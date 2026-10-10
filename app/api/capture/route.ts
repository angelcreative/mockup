import { NextResponse } from "next/server";

import { isAllowedViewport } from "@/lib/devices";
import { CaptureError, assertPublicUrl } from "@/lib/ssrf";

export const maxDuration = 60;

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function sniffImage(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function imageResponse(body: Buffer, contentType: string) {
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error("timeout"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function captureWithPlaywright(target: URL, width: number, height: number) {
  const { chromium } = await import("playwright");
  const holder: { browser?: import("playwright").Browser } = {};

  const run = async () => {
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
      ],
    });
    holder.browser = browser;

    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      userAgent: MOBILE_UA,
      isMobile: true,
      hasTouch: true,
      locale: "es-ES",
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (
        requestUrl === "about:blank" ||
        requestUrl.startsWith("data:") ||
        requestUrl.startsWith("blob:")
      ) {
        await route.continue();
        return;
      }

      if (route.request().isNavigationRequest()) {
        try {
          await assertPublicUrl(requestUrl);
        } catch {
          await route.abort();
          return;
        }
      }

      await route.continue();
    });

    await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
    await assertPublicUrl(page.url());
    return page.screenshot({ type: "png", fullPage: false });
  };

  try {
    return await withTimeout(run(), 19_000, () => {
      void holder.browser?.close().catch(() => undefined);
    });
  } finally {
    await holder.browser?.close().catch(() => undefined);
  }
}

function isMicrolinkHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "microlink.io" || host.endsWith(".microlink.io");
}

function microlinkEndpoint(target: string, width: number, height: number, embed: boolean) {
  const endpoint = new URL("https://api.microlink.io/");
  endpoint.searchParams.set("url", target);
  endpoint.searchParams.set("screenshot", "true");
  endpoint.searchParams.set("meta", embed ? "false" : "true");
  endpoint.searchParams.set("viewport.width", String(width));
  endpoint.searchParams.set("viewport.height", String(height));
  endpoint.searchParams.set("viewport.deviceScaleFactor", "2");
  endpoint.searchParams.set("viewport.isMobile", "true");
  endpoint.searchParams.set("viewport.hasTouch", "true");
  if (embed) endpoint.searchParams.set("embed", "screenshot.url");
  return endpoint;
}

async function fetchBuffer(url: URL) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "image/png,image/jpeg,image/webp,image/*,application/json" },
  });
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_IMAGE_BYTES) {
    throw new Error("image too large");
  }
  return { ok: response.ok, body };
}

function screenshotUrlFromJson(body: Buffer): string | null {
  try {
    const payload = JSON.parse(body.toString("utf8")) as {
      data?: { screenshot?: { url?: unknown } };
    };
    const url = payload.data?.screenshot?.url;
    return typeof url === "string" ? url : null;
  } catch {
    return null;
  }
}

async function captureWithMicrolink(target: string, width: number, height: number) {
  const embedded = await fetchBuffer(microlinkEndpoint(target, width, height, true));
  const embeddedType = sniffImage(embedded.body);
  if (embedded.ok && embeddedType) {
    return { body: embedded.body, contentType: embeddedType };
  }

  const meta = await fetchBuffer(microlinkEndpoint(target, width, height, false));
  const shot = screenshotUrlFromJson(meta.body);
  if (!meta.ok || !shot) throw new Error("microlink");

  const shotUrl = new URL(shot);
  if (shotUrl.protocol !== "https:" || !isMicrolinkHost(shotUrl.hostname)) {
    throw new Error("microlink host");
  }

  const image = await fetchBuffer(shotUrl);
  const contentType = sniffImage(image.body);
  if (!image.ok || !contentType) throw new Error("microlink image");
  return { body: image.body, contentType };
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "URL no válida");
  }

  if (!payload || typeof payload !== "object") {
    return jsonError(400, "URL no válida");
  }

  const body = payload as { url?: unknown; width?: unknown; height?: unknown };
  if (typeof body.url !== "string" || body.url.length > 2048) {
    return jsonError(400, "URL no válida");
  }
  if (
    typeof body.width !== "number" ||
    typeof body.height !== "number" ||
    !Number.isInteger(body.width) ||
    !Number.isInteger(body.height) ||
    !isAllowedViewport(body.width, body.height)
  ) {
    return jsonError(400, "Tamaño de captura no permitido");
  }

  let target: URL;
  try {
    target = await assertPublicUrl(body.url);
  } catch (error) {
    if (error instanceof CaptureError) return jsonError(error.status, error.message);
    return jsonError(400, "URL no válida");
  }

  try {
    const png = await captureWithPlaywright(target, body.width, body.height);
    const contentType = sniffImage(png);
    if (!contentType) throw new Error("empty screenshot");
    return imageResponse(png, contentType);
  } catch (error) {
    console.error(
      "Playwright capture failed, falling back to Microlink",
      error instanceof Error ? error.message : "unknown",
    );
  }

  try {
    const image = await captureWithMicrolink(target.toString(), body.width, body.height);
    return imageResponse(image.body, image.contentType);
  } catch (error) {
    console.error(
      "Microlink capture failed",
      error instanceof Error ? error.message : "unknown",
    );
    return jsonError(502, "No se pudo capturar esta página");
  }
}
