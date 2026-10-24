import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "playwright";
import type { WebSocket } from "ws";

import { profileForViewport, type ViewportProfile } from "./devices";
import { parseClientMessage, type LiveClientMessage, type LiveServerMessage } from "./live-protocol";
import { CaptureError, assertPublicUrl } from "./ssrf";

const IDLE_MS = 3 * 60 * 1000;
/** A hidden tab gives the browser back sooner. */
const PAUSED_IDLE_MS = 60 * 1000;
/** Frame pacing: ~30 fps while someone is using the page, ~6 fps while it only animates by itself. */
const ACTIVE_GAP_MS = 33;
const RESTING_GAP_MS = 166;
const ACTIVE_FOR_MS = 4000;
/** If the client never confirms a frame, release the next one anyway. */
const ACK_FALLBACK_MS = 1000;
const MIN_SCALE = 0.6;

/** Ads and analytics only cost CPU and memory in a preview. */
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

type InputMessage = Extract<LiveClientMessage, { type: "input" }>;
type InputSlot = { kind: "move" | "wheel"; message: InputMessage };

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
  paused: boolean;
  /** The frame on the wire, acknowledged to Chromium once the client has drawn it. */
  inFlight: { sessionId: number; sentAt: number; fallback: NodeJS.Timeout } | null;
  /** Chromium keeps up to two frames unacknowledged; the second waits here. */
  queued: ScreencastFrame | null;
  release: NodeJS.Timeout | null;
  lastInput: number;
  /** Device pixels per CSS pixel the client can actually show, capped by the profile. */
  scale: number;
  slot: InputSlot | null;
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
    return `Chromium ran out of memory (${message})`;
  }
  if (message) return "Could not open this page";
  return "Could not open this page";
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
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--mute-audio",
      "--disable-features=Translate,MediaRouter,OptimizationHints,BackForwardCache",
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

function encodeScale(session: Session, profile: ViewportProfile) {
  return Math.min(profile.dsf, Math.max(MIN_SCALE, session.scale));
}

function clearPacing(session: Session) {
  if (session.inFlight) clearTimeout(session.inFlight.fallback);
  session.inFlight = null;
  session.queued = null;
  if (session.release) clearTimeout(session.release);
  session.release = null;
}

function sendFrame(session: Session, cdp: CDPSession, frame: ScreencastFrame) {
  session.ws.send(Buffer.from(frame.data, "base64"));
  session.inFlight = {
    sessionId: frame.sessionId,
    sentAt: Date.now(),
    fallback: setTimeout(() => releaseFrame(session, cdp), ACK_FALLBACK_MS),
  };
}

/**
 * Chromium sends the next frame only after the previous one is acknowledged. Holding the
 * ack until the client has drawn the frame keeps one frame on the wire instead of a queue,
 * and the gap caps the frame rate, lower when nobody is touching the page.
 */
function releaseFrame(session: Session, cdp: CDPSession) {
  const frame = session.inFlight;
  if (!frame || session.release) return;
  clearTimeout(frame.fallback);
  const now = Date.now();
  const gap = now - session.lastInput < ACTIVE_FOR_MS ? ACTIVE_GAP_MS : RESTING_GAP_MS;
  const wait = Math.max(0, gap - (now - frame.sentAt));
  const next = () => {
    session.release = null;
    session.inFlight = null;
    if (session.closed || session.cdp !== cdp) return;
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
    const queued = session.queued;
    session.queued = null;
    if (queued && session.ws.readyState === session.ws.OPEN) sendFrame(session, cdp, queued);
  };
  if (wait === 0) next();
  else session.release = setTimeout(next, wait);
}

async function bindScreencast(session: Session, profile: ViewportProfile) {
  const cdp = session.cdp;
  const ws = session.ws;
  if (!cdp) return;
  // Chromium rejects Page.startScreencast while one is already active. A resize
  // keeps the page, so the previous cast is still running.
  await stopScreencast(session);
  if (session.closed || session.cdp !== cdp) return;
  const onFrame = (event: ScreencastFrame) => {
    if (session.closed || ws.readyState !== ws.OPEN) return;
    if (!session.inFlight) {
      sendFrame(session, cdp, event);
      return;
    }
    // A newer frame replaces one still waiting; letting the replaced one go lets
    // Chromium carry on, which only happens if acks were lost.
    const replaced = session.queued;
    session.queued = event;
    if (replaced) {
      void cdp.send("Page.screencastFrameAck", { sessionId: replaced.sessionId }).catch(() => undefined);
    }
  };
  cdp.on("Page.screencastFrame", onFrame);
  session.unbind = () => {
    cdp.off("Page.screencastFrame", onFrame);
  };
  const scale = encodeScale(session, profile);
  return cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 58,
    maxWidth: Math.round(profile.width * scale),
    maxHeight: Math.round(profile.height * scale),
    everyNthFrame: 1,
  });
}

async function stopScreencast(session: Session) {
  session.unbind?.();
  session.unbind = null;
  clearPacing(session);
  await session.cdp?.send("Page.stopScreencast").catch(() => undefined);
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

async function installRoutes(context: BrowserContext) {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (isBenign(url)) {
      await route.continue();
      return;
    }
    if (isTracker(url)) {
      await route.abort();
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
  if (!page) throw new Error("no page");
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

  if (session.paused) {
    send(session.ws, { type: "status", state: "ready" });
    return;
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

function bumpIdle(session: Session, ms = IDLE_MS) {
  if (session.idle) clearTimeout(session.idle);
  session.idle = setTimeout(() => {
    send(session.ws, { type: "idle" });
    void closeSession(session, true).finally(() => {
      if (session.ws.readyState === session.ws.OPEN) session.ws.close();
    });
  }, ms);
}

function enqueue(session: Session, task: () => Promise<void>) {
  session.chain = session.chain.then(task, task);
  return session.chain;
}

async function handleInput(session: Session, message: InputMessage) {
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

/**
 * Moves and wheel steps that pile up while Chromium is busy merge into one: the newest
 * pointer position, and the summed scroll. A click or release closes the open slot so
 * nothing after it can jump ahead of it.
 */
function queueInput(session: Session, message: InputMessage) {
  session.lastInput = Date.now();
  const kind = message.action === "move" ? "move" : message.action === "wheel" ? "wheel" : null;
  const open = session.slot;
  if (kind && open?.kind === kind) {
    open.message =
      kind === "wheel"
        ? {
            ...message,
            deltaX: (open.message.deltaX ?? 0) + (message.deltaX ?? 0),
            deltaY: (open.message.deltaY ?? 0) + (message.deltaY ?? 0),
          }
        : message;
    return;
  }
  const slot: InputSlot | null = kind ? { kind, message } : null;
  session.slot = slot;
  void enqueue(session, async () => {
    if (slot && session.slot === slot) session.slot = null;
    if (session.closed || active !== session) return;
    try {
      await handleInput(session, slot ? slot.message : message);
    } catch (error) {
      send(session.ws, { type: "error", message: publicError(error) });
    }
  });
}

export function attachLiveSocket(ws: WebSocket) {
  if (active && active.ws !== ws) {
    const previous = active;
    if (!previous.closed && previous.ws.readyState === previous.ws.OPEN) {
      // One Chromium page fits in this server. Whoever has it keeps it until they leave
      // or go idle, instead of the newest visitor taking it away.
      send(ws, { type: "error", message: "Someone else is using the live view. Try again in a few minutes." });
      ws.close();
      return;
    }
    void closeSession(previous, false);
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
    paused: false,
    inFlight: null,
    queued: null,
    release: null,
    lastInput: Date.now(),
    scale: Infinity,
    slot: null,
  };
  active = session;
  bumpIdle(session);

  ws.on("message", (data, isBinary) => {
    if (session.closed || isBinary) return;
    const parsed = parseClientMessage(data.toString());
    if (!parsed) {
      send(ws, { type: "error", message: "Invalid request" });
      return;
    }
    // Keep-alives, frame receipts and zoom hints are not someone using the page.
    if (parsed.type === "ping") return;
    if (parsed.type === "frame") {
      if (session.cdp) releaseFrame(session, session.cdp);
      return;
    }
    if (parsed.type === "scale") {
      const previous = session.scale;
      session.scale = parsed.value;
      void enqueue(session, async () => {
        if (session.closed || active !== session || session.paused) return;
        const profile = session.profile;
        if (!profile || !session.page) return;
        const before = Math.min(profile.dsf, Math.max(MIN_SCALE, previous));
        if (Math.abs(encodeScale(session, profile) - before) < 0.05) return;
        await bindScreencast(session, profile);
      });
      return;
    }
    if (parsed.type === "input") {
      bumpIdle(session);
      queueInput(session, parsed);
      return;
    }
    if (parsed.type === "pause") {
      bumpIdle(session, PAUSED_IDLE_MS);
      session.paused = true;
      void enqueue(session, async () => {
        if (session.closed || active !== session) return;
        await stopScreencast(session);
      });
      return;
    }
    bumpIdle(session);
    if (parsed.type === "resume") {
      session.paused = false;
      void enqueue(session, async () => {
        if (session.closed || active !== session || session.paused) return;
        if (session.page && session.profile) await bindScreencast(session, session.profile);
      });
      return;
    }

    void enqueue(session, async () => {
      if (session.closed || active !== session) return;
      try {
        if (parsed.type === "open") {
          const target = await assertPublicUrl(parsed.url);
          const profile = profileForViewport(parsed.width, parsed.height);
          if (!profile) {
            send(ws, { type: "error", message: "Screen size is not allowed" });
            return;
          }
          await show(session, profile, target.toString(), true);
          return;
        }
        if (parsed.type === "resize") {
          const profile = profileForViewport(parsed.width, parsed.height);
          if (!profile || !session.url) {
            send(ws, { type: "error", message: "Screen size is not allowed" });
            return;
          }
          try {
            await show(session, profile, session.url, false);
          } catch (error) {
            if (error instanceof CaptureError) throw error;
            if (session.closed || session.paused || !session.profile) return;
            await bindScreencast(session, session.profile).catch(() => undefined);
          }
        }
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
