import type { IncomingMessage, ServerResponse } from "node:http";

import { chromium, type Browser, type BrowserContext } from "playwright";

import { profileForViewport, type ViewportProfile } from "./devices";
import { CaptureError, assertPublicUrl } from "./ssrf";

/** The browser closes after this long with nothing to capture, giving its memory back. */
const BROWSER_IDLE_MS = 2 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_BYTES = 48 * 1024 * 1024;
const JOB_MS = 40_000;
/** Longest page kept, and the pixel budget that keeps a capture decodable on a phone. */
const MAX_CSS_HEIGHT = 12_000;
const MAX_PIXELS = 12_000_000;
const MAX_QUEUE = 24;
const JPEG_QUALITY = 80;

/** Ads and analytics only cost time and memory in a capture. */
const BLOCKED_TRACKERS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "adservice.google.com",
  "connect.facebook.net",
  "hotjar.com",
  "clarity.ms",
  "bat.bing.com",
  "segment.io",
  "segment.com",
  "mixpanel.com",
  "fullstory.com",
  "criteo.com",
  "criteo.net",
  "taboola.com",
  "outbrain.com",
  "scorecardresearch.com",
  "nr-data.net",
];

export type Capture = {
  image: Buffer;
  /** CSS width of the page, and how much of its height the image covers. */
  width: number;
  height: number;
  /** The page's full height, which can be taller than the capture. */
  pageHeight: number;
};

type Job = {
  key: string;
  url: string;
  profile: ViewportProfile;
  urgent: boolean;
  promise: Promise<Capture>;
  resolve: (capture: Capture) => void;
  reject: (error: unknown) => void;
};

let browser: Browser | null = null;
let browserTimer: NodeJS.Timeout | null = null;
let running = false;
const queue: Job[] = [];
const pending = new Map<string, Job>();
const cache = new Map<string, { capture: Capture; at: number }>();
let cacheBytes = 0;

function captureKey(url: string, profile: ViewportProfile) {
  return `${url}|${profile.width}x${profile.height}@${profile.dsf}`;
}

function remember(key: string, capture: Capture) {
  const previous = cache.get(key);
  if (previous) cacheBytes -= previous.capture.image.length;
  cache.set(key, { capture, at: Date.now() });
  cacheBytes += capture.image.length;
  // Map order is insertion order, so the first entries are the least recently used.
  for (const [oldKey, entry] of cache) {
    if (cacheBytes <= CACHE_BYTES) break;
    cache.delete(oldKey);
    cacheBytes -= entry.capture.image.length;
  }
}

function cached(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  if (Date.now() - entry.at > CACHE_MS) {
    cacheBytes -= entry.capture.image.length;
    return null;
  }
  cache.set(key, entry);
  return entry.capture;
}

function isTracker(url: string) {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return BLOCKED_TRACKERS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function isBenign(url: string) {
  return url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:");
}

async function getBrowser() {
  if (browserTimer) clearTimeout(browserTimer);
  browserTimer = null;
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--renderer-process-limit=1",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--mute-audio",
      "--disable-features=Translate,MediaRouter,OptimizationHints,BackForwardCache",
    ],
  });
  browser.on("disconnected", () => {
    browser = null;
  });
  return browser;
}

function scheduleBrowserClose() {
  if (browserTimer) clearTimeout(browserTimer);
  browserTimer = setTimeout(() => {
    const current = browser;
    browser = null;
    void current?.close().catch(() => undefined);
  }, BROWSER_IDLE_MS);
}

export function publicError(error: unknown) {
  if (error instanceof CaptureError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (/ERR_NAME_NOT_RESOLVED/.test(message)) return "Could not resolve that address";
  if (/Timeout|timed out/i.test(message)) return "The page took too long to load";
  if (/memory|ENOMEM|heap|killed/i.test(message)) return "The server ran out of memory. Try again.";
  return "Could not open this page";
}

/** Scrolls through the page so lazy images and scroll-triggered content load, then returns to the top. */
async function wakePage(page: import("playwright").Page, step: number) {
  await page
    .evaluate(
      async ({ step, max }) => {
        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        const height = () => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
        for (let y = 0; y < Math.min(height(), max); y += step) {
          window.scrollTo(0, y);
          await wait(110);
        }
        window.scrollTo(0, 0);
      },
      { step: Math.max(200, Math.round(step * 0.9)), max: MAX_CSS_HEIGHT },
    )
    .catch(() => undefined);
}

async function shoot(url: string, profile: ViewportProfile): Promise<Capture> {
  const instance = await getBrowser();
  let context: BrowserContext | null = null;
  try {
    context = await instance.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.dsf,
      userAgent: profile.userAgent,
      isMobile: profile.mobile,
      hasTouch: profile.kind !== "laptop" && profile.kind !== "desktop",
      locale: "es-ES",
      // Content that waits for a scroll animation shows up straight away.
      reducedMotion: "reduce",
      ignoreHTTPSErrors: true,
    });
    await context.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (isBenign(requestUrl)) return route.continue();
      if (isTracker(requestUrl)) return route.abort();
      try {
        await assertPublicUrl(requestUrl);
        await route.continue();
      } catch {
        await route.abort();
      }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await assertPublicUrl(page.url());
    await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => undefined);
    await wakePage(page, profile.height);
    await page.waitForTimeout(400);
    const pageHeight = await page.evaluate(() =>
      Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0, window.innerHeight),
    );
    const budget = Math.floor(MAX_PIXELS / (profile.width * profile.dsf * profile.dsf));
    const height = Math.max(profile.height, Math.min(pageHeight, MAX_CSS_HEIGHT, budget));
    const image = await page.screenshot({
      type: "jpeg",
      quality: JPEG_QUALITY,
      fullPage: true,
      clip: { x: 0, y: 0, width: profile.width, height },
      timeout: 15_000,
    });
    return { image, width: profile.width, height, pageHeight };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      // The device someone is looking at goes before background prefetches.
      const index = Math.max(0, queue.findIndex((job) => job.urgent));
      const job = queue.splice(index, 1)[0];
      let timer: NodeJS.Timeout | null = null;
      try {
        const capture = await Promise.race([
          shoot(job.url, job.profile),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Timeout")), JOB_MS);
          }),
        ]);
        remember(job.key, capture);
        job.resolve(capture);
      } catch (error) {
        job.reject(error);
        // A hung page can leave the browser unusable; start clean next time.
        if (error instanceof Error && error.message === "Timeout") {
          const current = browser;
          browser = null;
          await current?.close().catch(() => undefined);
        }
      } finally {
        if (timer) clearTimeout(timer);
        pending.delete(job.key);
      }
    }
  } finally {
    running = false;
    scheduleBrowserClose();
  }
}

export function requestCapture(url: string, profile: ViewportProfile, urgent: boolean, fresh: boolean) {
  const key = captureKey(url, profile);
  if (!fresh) {
    const hit = cached(key);
    if (hit) return Promise.resolve(hit);
  }
  const existing = pending.get(key);
  if (existing) {
    existing.urgent ||= urgent;
    return existing.promise;
  }
  if (queue.length >= MAX_QUEUE || (!urgent && queue.length >= MAX_QUEUE / 2)) {
    return Promise.reject(new CaptureError(503, "The server is busy. Try again in a moment."));
  }
  let resolve!: (capture: Capture) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Capture>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const job: Job = { key, url, profile, urgent, promise, resolve, reject };
  pending.set(key, job);
  queue.push(job);
  void drain();
  return promise;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/** GET /api/capture?url=&w=&h=[&priority=low][&fresh=1] → a full-page JPEG. */
export async function handleCapture(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Use GET" });
    return;
  }
  const params = new URL(req.url ?? "/", "http://localhost").searchParams;
  const width = Number(params.get("w"));
  const height = Number(params.get("h"));
  const profile = profileForViewport(width, height);
  if (!profile) {
    sendJson(res, 400, { error: "Screen size is not allowed" });
    return;
  }
  try {
    const target = await assertPublicUrl(params.get("url") ?? "");
    const capture = await requestCapture(
      target.toString(),
      profile,
      params.get("priority") !== "low",
      params.get("fresh") === "1",
    );
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": capture.image.length,
      "Cache-Control": "private, max-age=600",
      "X-Capture-Width": String(capture.width),
      "X-Capture-Height": String(capture.height),
      "X-Page-Height": String(capture.pageHeight),
    });
    res.end(capture.image);
  } catch (error) {
    const status = error instanceof CaptureError ? error.status : 502;
    sendJson(res, status, { error: publicError(error) });
  }
}

export async function shutdownBrowser() {
  if (browserTimer) clearTimeout(browserTimer);
  const current = browser;
  browser = null;
  await current?.close().catch(() => undefined);
}
