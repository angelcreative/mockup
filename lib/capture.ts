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
const JOB_MS = 40_000;
/** How long the first screen waits for the page's load event before it is shot anyway. */
const TOP_LOAD_MS = 1_500;
const FULL_LOAD_MS = 8_000;
/** Longest page kept, and the pixel budget that keeps a capture decodable on a phone. */
const MAX_CSS_HEIGHT = 12_000;
const MAX_PIXELS = 12_000_000;
const MAX_QUEUE = 24;
const JPEG_QUALITY = 80;
/**
 * The full page is shot in bands this tall rather than as one huge image, and Chromium is asked
 * to drop decoded images between bands; that keeps a heavy page well inside 512 MB.
 */
const TILE_CSS = 800;
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

/** `top` is the first screen, shot as soon as the page has painted; `full` is the whole page. */
export type CapturePart = "top" | "full";

export type Capture = {
  /** One or more JPEG bands, top to bottom, back to back. */
  image: Buffer;
  /** CSS height and byte length of each band. */
  tiles: { height: number; bytes: number }[];
  /** CSS width of the page, and how much of its height the image covers. */
  width: number;
  height: number;
  /** The page's full height, which can be taller than the capture. */
  pageHeight: number;
};

type Deferred = {
  promise: Promise<Capture>;
  resolve: (capture: Capture) => void;
  reject: (error: unknown) => void;
  settled: boolean;
};

type Job = {
  key: string;
  url: string;
  profile: ViewportProfile;
  urgent: boolean;
  top: Deferred;
  full: Deferred;
};

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;
let browserTimer: NodeJS.Timeout | null = null;
let running = false;
const queue: Job[] = [];
const pending = new Map<string, Job>();
const cache = new Map<string, { capture: Capture; at: number }>();
let cacheBytes = 0;

function deferred(): Deferred {
  const entry = { settled: false } as Deferred;
  entry.promise = new Promise<Capture>((resolve, reject) => {
    entry.resolve = (capture) => {
      entry.settled = true;
      resolve(capture);
    };
    entry.reject = (error) => {
      entry.settled = true;
      reject(error);
    };
  });
  // A part nobody asked for must not surface as an unhandled rejection.
  entry.promise.catch(() => undefined);
  return entry;
}

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

/** Scrolls through the page so lazy images and scroll-triggered content load, then returns to the top. */
async function wakePage(page: import("playwright").Page, step: number, relieve: () => Promise<unknown>) {
  // Every second and a half, and at the end, let Chromium drop what it has decoded so far.
  const relief = setInterval(() => void relieve(), 1500);
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
  clearInterval(relief);
  await relieve();
}

function pageHeightOf(page: import("playwright").Page) {
  return page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0, window.innerHeight),
  );
}

/** Shoots the first screen as soon as the page paints, then the whole page once it has settled. */
async function shoot(job: Job) {
  const { url, profile } = job;
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
    // Lets Chromium drop decoded images and caches it can rebuild for the next band.
    const relieve = () => cdp.send("Memory.simulatePressureNotification", { level: "critical" }).catch(() => undefined);
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await assertPublicUrl(page.url());
    const status = response?.status() ?? 200;
    if (status === 401 || status === 403 || status === 429) {
      throw new CaptureError(502, `This site blocks automated visits (${status}).`);
    }
    if (status >= 400) throw new CaptureError(502, `The site answered with an error (${status}).`);

    const started = Date.now();
    await page.waitForLoadState("load", { timeout: TOP_LOAD_MS }).catch(() => undefined);
    if (!job.top.settled) {
      const top = await page.screenshot({ type: "jpeg", quality: JPEG_QUALITY, timeout: 10_000 });
      const capture = {
        image: top,
        tiles: [{ height: profile.height, bytes: top.length }],
        width: profile.width,
        height: profile.height,
        pageHeight: await pageHeightOf(page),
      };
      remember(`${job.key}|top`, capture);
      job.top.resolve(capture);
    }

    const left = FULL_LOAD_MS - (Date.now() - started);
    if (left > 0) await page.waitForLoadState("load", { timeout: left }).catch(() => undefined);
    await wakePage(page, profile.height, relieve);
    await page.waitForTimeout(400);
    const pageHeight = await pageHeightOf(page);
    const budget = Math.floor(MAX_PIXELS / (profile.width * profile.dsf * profile.dsf));
    const height = Math.max(profile.height, Math.min(pageHeight, MAX_CSS_HEIGHT, budget));
    const bands: Buffer[] = [];
    const tiles: Capture["tiles"] = [];
    for (let y = 0; y < height; y += TILE_CSS) {
      const band = Math.min(TILE_CSS, height - y);
      await relieve();
      const image = await page.screenshot({
        type: "jpeg",
        quality: JPEG_QUALITY,
        fullPage: true,
        clip: { x: 0, y, width: profile.width, height: band },
        timeout: 15_000,
      });
      bands.push(image);
      tiles.push({ height: band, bytes: image.length });
    }
    const capture = { image: Buffer.concat(bands), tiles, width: profile.width, height, pageHeight };
    remember(`${job.key}|full`, capture);
    job.full.resolve(capture);
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
        await Promise.race([
          shoot(job),
          guard.tripped,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Timeout")), JOB_MS);
          }),
        ]);
      } catch (error) {
        if (!job.top.settled) job.top.reject(error);
        if (!job.full.settled) job.full.reject(error);
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

function enqueue(url: string, profile: ViewportProfile, urgent: boolean) {
  const key = captureKey(url, profile);
  const existing = pending.get(key);
  if (existing) {
    existing.urgent ||= urgent;
    return existing;
  }
  if (queue.length >= MAX_QUEUE || (!urgent && queue.length >= MAX_QUEUE / 2)) {
    throw new CaptureError(503, "The server is busy. Try again in a moment.");
  }
  const job: Job = { key, url, profile, urgent, top: deferred(), full: deferred() };
  pending.set(key, job);
  queue.push(job);
  void drain();
  return job;
}

/**
 * Resolves with the part asked for. A cached full page also answers a request for the top,
 * and a stale capture is served at once while a new one is taken in the background.
 */
export function requestCapture(
  url: string,
  profile: ViewportProfile,
  options: { urgent: boolean; fresh: boolean; part: CapturePart },
) {
  const key = captureKey(url, profile);
  if (!options.fresh) {
    const full = cached(`${key}|full`);
    const top = options.part === "top" ? cached(`${key}|top`) : null;
    const hit = full ?? top;
    if (hit) {
      if (hit.stale) {
        try {
          enqueue(url, profile, false);
        } catch {
          // Busy: the stale capture will do.
        }
      }
      return Promise.resolve(hit.capture);
    }
  }
  try {
    const job = enqueue(url, profile, options.urgent);
    return job[options.part].promise;
  } catch (error) {
    return Promise.reject(error);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/**
 * GET /api/capture?url=&w=&h=[&part=top][&priority=low][&fresh=1][&warm=1] → a JPEG.
 * `warm=1` only queues the capture and answers 202 straight away.
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
      part: (params.get("part") === "top" ? "top" : "full") as CapturePart,
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
      "X-Tiles": capture.tiles.map((tile) => `${tile.height}:${tile.bytes}`).join(","),
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
