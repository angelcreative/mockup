import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "playwright";
import type { WebSocket } from "ws";

import { profileForViewport, type ViewportProfile } from "./devices";
import { parseClientMessage, type LiveServerMessage } from "./live-protocol";
import { CaptureError, assertPublicUrl } from "./ssrf";

const IDLE_MS = 3 * 60 * 1000;

type ScreencastFrame = {
  data: string;
  sessionId: number;
};

type Session = {
  ws: WebSocket;
  context: BrowserContext | null;
  page: Page | null;
  cdp: CDPSession | null;
  unbind: (() => void) | null;
  profile: ViewportProfile | null;
  url: string | null;
  idle: NodeJS.Timeout | null;
  chain: Promise<void>;
  closed: boolean;
};

let browser: Browser | null = null;
let browserTimer: NodeJS.Timeout | null = null;
let active: Session | null = null;

function send(ws: WebSocket, message: LiveServerMessage) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(message));
}

function publicError(error: unknown) {
  if (error instanceof CaptureError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (/memory|ENOMEM|heap|out of memory|killed/i.test(message)) {
    return `Chromium se quedó sin memoria (${message})`;
  }
  if (message) return "No se pudo abrir esta página";
  return "No se pudo abrir esta página";
}

function isBenign(url: string) {
  return (
    url === "about:blank" ||
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("about:")
  );
}

function clearBrowserTimer() {
  if (!browserTimer) return;
  clearTimeout(browserTimer);
  browserTimer = null;
}

async function killBrowser() {
  clearBrowserTimer();
  const current = browser;
  browser = null;
  await current?.close().catch(() => undefined);
}

function scheduleBrowserKill() {
  clearBrowserTimer();
  browserTimer = setTimeout(() => {
    void killBrowser();
  }, IDLE_MS);
}

async function getBrowser() {
  clearBrowserTimer();
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
    ],
  });
  browser.on("disconnected", () => {
    if (browser?.isConnected() === false) browser = null;
  });
  return browser;
}

function mouseButton(button: number | undefined): "left" | "middle" | "right" {
  if (button === 2) return "right";
  if (button === 1) return "middle";
  return "left";
}

function bindScreencast(session: Session, profile: ViewportProfile) {
  const cdp = session.cdp;
  const ws = session.ws;
  if (!cdp) return;
  session.unbind?.();
  const onFrame = (event: ScreencastFrame) => {
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => undefined);
    if (session.closed || ws.readyState !== ws.OPEN) return;
    if (ws.bufferedAmount > 750_000) return;
    ws.send(Buffer.from(event.data, "base64"));
  };
  cdp.on("Page.screencastFrame", onFrame);
  session.unbind = () => {
    cdp.off("Page.screencastFrame", onFrame);
  };
  return cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 58,
    maxWidth: profile.width * profile.dsf,
    maxHeight: profile.height * profile.dsf,
    everyNthFrame: 1,
  });
}

async function stopScreencast(session: Session) {
  session.unbind?.();
  session.unbind = null;
  await session.cdp?.send("Page.stopScreencast").catch(() => undefined);
}

async function installRoutes(context: BrowserContext) {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (isBenign(url)) {
      await route.continue();
      return;
    }
    try {
      await assertPublicUrl(url);
      await route.continue();
    } catch {
      await route.abort();
    }
  });
}

async function openContext(session: Session, profile: ViewportProfile) {
  await stopScreencast(session);
  await session.context?.close().catch(() => undefined);
  session.context = null;
  session.page = null;
  session.cdp = null;

  const instance = await getBrowser();
  const context = await instance.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dsf,
    userAgent: profile.userAgent,
    isMobile: profile.mobile,
    hasTouch: true,
    locale: "es-ES",
    ignoreHTTPSErrors: true,
  });
  await installRoutes(context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  session.context = context;
  session.page = page;
  session.cdp = cdp;
  session.profile = profile;
}

async function show(session: Session, profile: ViewportProfile, url: string, reload: boolean) {
  if (!session.page || !session.profile) {
    await openContext(session, profile);
  } else if (
    session.profile.mobile !== profile.mobile ||
    session.profile.dsf !== profile.dsf ||
    session.profile.userAgent !== profile.userAgent
  ) {
    await openContext(session, profile);
    reload = true;
  } else if (session.page) {
    await session.page.setViewportSize({ width: profile.width, height: profile.height });
    session.profile = profile;
  }

  const page = session.page;
  if (!page) throw new Error("sin página");
  session.url = url;
  session.profile = profile;

  if (reload || page.url() === "about:blank") {
    await stopScreencast(session);
    send(session.ws, { type: "status", state: "loading" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await assertPublicUrl(page.url()).catch(async (error: unknown) => {
      await page.goto("about:blank").catch(() => undefined);
      throw error;
    });
  }

  await bindScreencast(session, profile);
  send(session.ws, { type: "status", state: "ready" });
}

async function closeSession(session: Session, killNow: boolean) {
  if (session.closed) return;
  session.closed = true;
  if (session.idle) clearTimeout(session.idle);
  if (active === session) active = null;
  await stopScreencast(session);
  await session.context?.close().catch(() => undefined);
  session.context = null;
  session.page = null;
  session.cdp = null;
  if (killNow) await killBrowser();
  else scheduleBrowserKill();
}

function bumpIdle(session: Session) {
  if (session.idle) clearTimeout(session.idle);
  session.idle = setTimeout(() => {
    send(session.ws, { type: "idle" });
    void closeSession(session, true).finally(() => {
      if (session.ws.readyState === session.ws.OPEN) session.ws.close();
    });
  }, IDLE_MS);
}

function enqueue(session: Session, task: () => Promise<void>) {
  session.chain = session.chain.then(task, task);
  return session.chain;
}

async function handleInput(session: Session, message: Extract<ReturnType<typeof parseClientMessage>, { type: "input" }>) {
  const page = session.page;
  const profile = session.profile;
  if (!page || !profile) return;
  const x = Math.min(profile.width - 0.01, Math.max(0, message.x));
  const y = Math.min(profile.height - 0.01, Math.max(0, message.y));
  const button = mouseButton(message.button);
  if (message.action === "move") {
    await page.mouse.move(x, y);
    return;
  }
  if (message.action === "down") {
    await page.mouse.move(x, y);
    await page.mouse.down({ button });
    return;
  }
  if (message.action === "up") {
    await page.mouse.move(x, y);
    await page.mouse.up({ button });
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.wheel(message.deltaX ?? 0, message.deltaY ?? 0);
}

export function attachLiveSocket(ws: WebSocket) {
  if (active && active.ws !== ws) {
    const previous = active;
    void closeSession(previous, false);
    if (previous.ws.readyState === previous.ws.OPEN) previous.ws.close();
  }

  const session: Session = {
    ws,
    context: null,
    page: null,
    cdp: null,
    unbind: null,
    profile: null,
    url: null,
    idle: null,
    chain: Promise.resolve(),
    closed: false,
  };
  active = session;
  bumpIdle(session);

  ws.on("message", (data, isBinary) => {
    if (session.closed || isBinary) return;
    const parsed = parseClientMessage(data.toString());
    if (!parsed) {
      send(ws, { type: "error", message: "Petición no válida" });
      return;
    }
    bumpIdle(session);
    if (parsed.type === "ping") return;

    void enqueue(session, async () => {
      if (session.closed || active !== session) return;
      try {
        if (parsed.type === "open") {
          const target = await assertPublicUrl(parsed.url);
          const profile = profileForViewport(parsed.width, parsed.height);
          if (!profile) {
            send(ws, { type: "error", message: "Tamaño de pantalla no permitido" });
            return;
          }
          await show(session, profile, target.toString(), true);
          return;
        }
        if (parsed.type === "resize") {
          const profile = profileForViewport(parsed.width, parsed.height);
          if (!profile || !session.url) {
            send(ws, { type: "error", message: "Tamaño de pantalla no permitido" });
            return;
          }
          await show(session, profile, session.url, false);
          return;
        }
        await handleInput(session, parsed);
      } catch (error) {
        send(ws, { type: "error", message: publicError(error) });
      }
    });
  });

  ws.on("close", () => {
    void closeSession(session, false);
  });

  ws.on("error", () => {
    void closeSession(session, false);
  });
}

export async function shutdownBrowser() {
  if (active) await closeSession(active, true);
  else await killBrowser();
}
