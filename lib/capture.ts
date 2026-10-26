import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

import { chromium, type Browser, type BrowserContext } from "playwright";

import { profileForViewport, type ViewportProfile } from "./devices";
import { CaptureError, assertPublicUrl } from "./ssrf";

/** The browser closes after this long with nothing to capture, giving its memory back. */
const BROWSER_IDLE_MS = 2 * 60 * 1000;
/** Captures are served fresh for ten minutes, then served stale while a new one is taken. */
const FRESH_MS = 10 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
const CACHE_BYTES = 24 * 1024 * 1024;
const JOB_MS = 30_000;
/** How long a page may take to finish loading before its screen is shot anyway. */
const LOAD_MS = 5_000;
/** After scrolling to the asked position, time for lazy images and sticky headers to settle. */
const SETTLE_MS = 700;
const MAX_QUEUE = 24;
const JPEG_QUALITY = 82;
/** Positions are kept in 5% steps, so nearby slider values share a capture. */
const POSITION_STEPS = 20;
/** Past this share of the container's memory a capture is abandoned before the server is killed. */
const MEMORY_TRIP = 0.88;
const MEMORY_LIMIT = Number(process.env.MEMORY_LIMIT_MB || 512) * 1024 * 1024;
const HEAVY_PAGE = "This page is too heavy to capture on this server. Try a lighter page or a smaller device.";

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

/** One screen of the page, as a phone or laptop would show it at that scroll position. */
export type Capture = {
  image: Buffer;
  /** CSS size of the screen. */
  width: number;
  height: number;
  /** The page's full height and where the screen starts in it. */
  pageHeight: number;
  scrollY: number;
};

type Job = {
  key: string;
  url: string;
  profile: ViewportProfile;
  /** 0 is the top of the page, 1 its last screen. */
  position: number;
  urgent: boolean;
  promise: Promise<Capture>;
  resolve: (capture: Capture) => void;
  reject: (error: unknown) => void;
};

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;
let browserTimer: NodeJS.Timeout | null = null;
let running = false;
const queue: Job[] = [];
const pending = new Map<string, Job>();
const cache = new Map<string, { capture: Capture; at: number }>();
let cacheBytes = 0;

export function snapPosition(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * POSITION_STEPS) / POSITION_STEPS;
}

function captureKey(url: string, profile: ViewportProfile, position: number) {
  return `${url}|${profile.width}x${profile.height}@${profile.dsf}|${position}`;
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
  const age = Date.now() - entry.at;
  if (age > STALE_MS) {
    cacheBytes -= entry.capture.image.length;
    return null;
  }
  cache.set(key, entry);
  return { capture: entry.capture, stale: age > FRESH_MS };
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
  launching ??= chromium
    .launch({
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
        // One renderer for every frame instead of one per site, and a capped JavaScript heap.
        "--disable-site-isolation-trials",
        "--disable-features=IsolateOrigins,site-per-process,Translate,MediaRouter,OptimizationHints,BackForwardCache",
        "--js-flags=--max-old-space-size=192",
      ],
    })
    .then((instance) => {
      browser = instance;
      instance.on("disconnected", () => {
        if (browser === instance) browser = null;
      });
      return instance;
    })
    .finally(() => {
      launching = null;
    });
  return launching;
}

function scheduleBrowserClose() {
  if (browserTimer) clearTimeout(browserTimer);
  browserTimer = setTimeout(() => {
    if (running) return;
    const current = browser;
    browser = null;
    void current?.close().catch(() => undefined);
  }, BROWSER_IDLE_MS);
}

/** Starts Chromium ahead of the first capture, so opening a page skips the launch. */
export function warmBrowser() {
  void getBrowser()
    .then(() => {
      if (!running) scheduleBrowserClose();
    })
    .catch(() => undefined);
}

function readNumber(path: string) {
  try {
    return Number(readFileSync(path, "utf8").trim());
  } catch {
    return NaN;
  }
}

function statValue(path: string, keys: string[]) {
  try {
    const stat = readFileSync(path, "utf8");
    return keys.reduce((sum, key) => sum + Number(stat.match(new RegExp(`^${key} (\\d+)$`, "m"))?.[1] ?? 0), 0);
  } catch {
    return NaN;
  }
}

/**
 * Memory the container is really using (process memory, not the reclaimable file cache) and its
 * limit, from cgroup v2 or v1. Null where neither is readable, e.g. on a laptop.
 */
function containerMemory() {
  let used = statValue("/sys/fs/cgroup/memory.stat", ["anon", "shmem"]);
  let limit = readNumber("/sys/fs/cgroup/memory.max");
  if (!Number.isFinite(used) || used <= 0) {
    used = statValue("/sys/fs/cgroup/memory/memory.stat", ["total_rss", "total_shmem"]);
    limit = readNumber("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  }
  if (!Number.isFinite(used) || used <= 0) return null;
  if (!Number.isFinite(limit) || limit <= 0 || limit > 64 * 1024 ** 3) limit = MEMORY_LIMIT;
  return { used, limit };
}

/** Rejects as soon as memory nears the limit, so the job is dropped instead of the server. */
function memoryGuard() {
  let timer: NodeJS.Timeout | null = null;
  const tripped = new Promise<never>((_, reject) => {
    timer = setInterval(() => {
      const memory = containerMemory();
      if (memory && memory.used > memory.limit * MEMORY_TRIP) reject(new CaptureError(503, HEAVY_PAGE));
    }, 150);
  });
  tripped.catch(() => undefined);
  return { tripped, stop: () => timer && clearInterval(timer) };
}

export function publicError(error: unknown) {
  if (error instanceof CaptureError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (/ERR_NAME_NOT_RESOLVED/.test(message)) return "That address doesn't exist. Check the spelling.";
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(message)) {
    return "The site refused the connection.";
  }
  if (/ERR_CERT|SSL/.test(message)) return "The site's security certificate isn't valid.";
  if (/ERR_TOO_MANY_REDIRECTS/.test(message)) return "The site keeps redirecting.";
  if (/Timeout|timed out/i.test(message)) return "The site took too long to load.";
  if (/memory|ENOMEM|heap|killed/i.test(message)) return "The server ran out of memory. Try again.";
  return "Could not open this page.";
}

/**
 * Opens the page, moves to the asked position, lets that screen's lazy images and
 * scroll-triggered content load, and shoots it.
 */
async function shoot(job: Job): Promise<Capture> {
  const { url, profile, position } = job;
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
      // Video only costs memory in a still image; its poster frame still shows.
      if (isTracker(requestUrl) || route.request().resourceType() === "media") return route.abort();
      try {
        await assertPublicUrl(requestUrl);
        await route.continue();
      } catch {
        await route.abort();
      }
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await assertPublicUrl(page.url());
    const status = response?.status() ?? 200;
    if (status === 401 || status === 403 || status === 429) {
      throw new CaptureError(502, `This site blocks automated visits (${status}).`);
    }
    if (status >= 400) throw new CaptureError(502, `The site answered with an error (${status}).`);
    await page.waitForLoadState("load", { timeout: LOAD_MS }).catch(() => undefined);

    // Jump to the spot rather than scroll through: only what is on that screen gets loaded and
    // decoded, which keeps image-heavy pages small. A second jump catches pages that grew.
    const place = () =>
      page
        .evaluate((position) => {
          const height = Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight ?? 0,
            window.innerHeight,
          );
          window.scrollTo(0, Math.round(position * Math.max(0, height - window.innerHeight)));
          return { scrollY: Math.round(window.scrollY), pageHeight: height };
        }, position)
        .catch(() => ({ scrollY: 0, pageHeight: profile.height }));
    let placed = await place();
    if (position > 0) {
      await page.waitForTimeout(SETTLE_MS / 2);
      placed = await place();
    }
    await page.waitForTimeout(position > 0 ? SETTLE_MS : 200);
    // Lets Chromium drop decoded images it no longer shows before it paints the shot.
    await cdp.send("Memory.simulatePressureNotification", { level: "critical" }).catch(() => undefined);
    const image = await page.screenshot({ type: "jpeg", quality: JPEG_QUALITY, timeout: 10_000 });
    return { image, width: profile.width, height: profile.height, ...placed };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      // The device someone is looking at goes before background captures.
      const index = Math.max(0, queue.findIndex((job) => job.urgent));
      const job = queue.splice(index, 1)[0];
      let timer: NodeJS.Timeout | null = null;
      const guard = memoryGuard();
      try {
        const capture = await Promise.race([
          shoot(job),
          guard.tripped,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Timeout")), JOB_MS);
          }),
        ]);
        remember(job.key, capture);
        job.resolve(capture);
      } catch (error) {
        job.reject(error);
        // A hung or oversized page can leave the browser unusable or the server near its limit;
        // closing Chromium gives every byte back, and the next capture starts clean.
        const heavy = error instanceof CaptureError && error.message === HEAVY_PAGE;
        if (heavy || (error instanceof Error && error.message === "Timeout")) {
          const current = browser;
          browser = null;
          await current?.close().catch(() => undefined);
        }
      } finally {
        guard.stop();
        if (timer) clearTimeout(timer);
        pending.delete(job.key);
      }
    }
  } finally {
    running = false;
    scheduleBrowserClose();
  }
}

function enqueue(url: string, profile: ViewportProfile, position: number, urgent: boolean) {
  const key = captureKey(url, profile, position);
  const existing = pending.get(key);
  if (existing) {
    existing.urgent ||= urgent;
    return existing.promise;
  }
  if (queue.length >= MAX_QUEUE || (!urgent && queue.length >= MAX_QUEUE / 2)) {
    throw new CaptureError(503, "The server is busy. Try again in a moment.");
  }
  let resolve!: (capture: Capture) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Capture>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A background refresh nobody waits for must not surface as an unhandled rejection.
  promise.catch(() => undefined);
  pending.set(key, { key, url, profile, position, urgent, promise, resolve, reject });
  queue.push(pending.get(key) as Job);
  void drain();
  return promise;
}

/** A cached capture is served at once; a stale one is also refreshed in the background. */
export function requestCapture(
  url: string,
  profile: ViewportProfile,
  options: { position: number; urgent: boolean; fresh: boolean },
) {
  const position = snapPosition(options.position);
  if (!options.fresh) {
    const hit = cached(captureKey(url, profile, position));
    if (hit) {
      if (hit.stale) {
        try {
          enqueue(url, profile, position, false);
        } catch {
          // Busy: the stale capture will do.
        }
      }
      return Promise.resolve(hit.capture);
    }
  }
  try {
    return enqueue(url, profile, position, options.urgent);
  } catch (error) {
    return Promise.reject(error);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/**
 * GET /api/capture?url=&w=&h=[&at=0..1][&priority=low][&fresh=1][&warm=1] → one screen as a JPEG.
 * `at` is the position in the page (0 top, 1 last screen). `warm=1` only queues the capture and
 * answers 202 straight away.
 */
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
    const target = (await assertPublicUrl(params.get("url") ?? "")).toString();
    const options = {
      urgent: params.get("priority") !== "low",
      fresh: params.get("fresh") === "1",
      position: Number(params.get("at") ?? 0),
    };
    if (params.get("warm") === "1") {
      requestCapture(target, profile, options).catch(() => undefined);
      res.writeHead(202, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
    const capture = await requestCapture(target, profile, options);
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": capture.image.length,
      "Cache-Control": "no-store",
      "X-Capture-Width": String(capture.width),
      "X-Capture-Height": String(capture.height),
      "X-Page-Height": String(capture.pageHeight),
      "X-Scroll-Y": String(capture.scrollY),
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
