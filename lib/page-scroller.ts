import { paintSkeleton } from "@/components/chrome";
import type { PageCapture } from "@/lib/page-capture";

/** iOS-like feel: momentum decays per millisecond, the edges stretch and spring back. */
const DECELERATION = 0.998;
const RUBBER = 0.35;
const SPRING_MS = 90;
const MIN_FLING = 0.06;
/** One capture replacing another blends over this long. */
const FADE_MS = 220;
/** Matches the server's cap, so a first screen can scroll as far as the full page will. */
const MAX_PAGE = 12_000;

/**
 * Scrolls a full-page capture inside the device. It draws only the visible slice into a
 * canvas sized to the viewport, so the glass never holds the whole tall image.
 */
export class PageScroller {
  readonly canvas: HTMLCanvasElement;
  /** The capture's bands, decoded, with where each starts in image pixels. */
  private bands: { bitmap: ImageBitmap; start: number }[] = [];
  private capture: PageCapture | null = null;
  private viewport = { width: 1, height: 1 };
  /** Scroll position in CSS pixels of the device's viewport. */
  private y = 0;
  private velocity = 0;
  private samples: { t: number; dy: number }[] = [];
  private frame = 0;
  private last = 0;
  private token = 0;
  private settle = 0;
  private fade: { from: HTMLCanvasElement; start: number; frame: number } | null = null;

  constructor(private readonly onFrame: (canvas: HTMLCanvasElement | null) => void) {
    this.canvas = document.createElement("canvas");
  }

  /** Viewport CSS pixels per capture CSS pixel, so a capture from a near size still fits. */
  private get scale() {
    return this.capture ? this.capture.width / this.viewport.width : 1;
  }

  /** How tall the page is in capture pixels: what is captured, or what is coming. */
  private get extent() {
    if (!this.capture) return 0;
    return this.capture.partial ? Math.min(this.capture.pageHeight, MAX_PAGE) : this.capture.height;
  }

  private get maxY() {
    if (!this.capture) return 0;
    return Math.max(0, this.extent / this.scale - this.viewport.height);
  }

  get current() {
    return this.capture;
  }

  /**
   * Shows a capture. The same page at the same width keeps its exact scroll (the full page
   * replacing its first screen); at another size it keeps its place proportionally; a new
   * page starts at the top. A capture replacing another fades in.
   */
  async show(capture: PageCapture, width: number, height: number) {
    const token = ++this.token;
    if (capture === this.capture) {
      this.resize(width, height);
      return true;
    }
    let bitmaps: ImageBitmap[];
    try {
      bitmaps = await Promise.all(capture.tiles.map((tile) => createImageBitmap(tile.blob)));
    } catch {
      return false;
    }
    if (token !== this.token) {
      bitmaps.forEach((bitmap) => bitmap.close());
      return false;
    }
    const previous = this.capture;
    const samePage = previous?.url === capture.url;
    const sameWidth = samePage && previous?.width === capture.width && this.viewport.width === width;
    const ratio = samePage && this.maxY > 0 ? this.y / this.maxY : 0;
    const keep = this.y;
    const fadeFrom = previous && this.bands.length ? this.snapshot() : null;
    this.releaseBands();
    let start = 0;
    this.bands = bitmaps.map((bitmap) => {
      const band = { bitmap, start };
      start += bitmap.height;
      return band;
    });
    this.capture = capture;
    this.viewport = { width, height };
    this.y = sameWidth ? Math.min(keep, this.maxY) : ratio * this.maxY;
    if (!sameWidth || !samePage) this.stop();
    if (fadeFrom && !(sameWidth && previous?.partial)) this.startFade(fadeFrom);
    this.draw();
    return true;
  }

  resize(width: number, height: number) {
    if (width === this.viewport.width && height === this.viewport.height) return;
    const ratio = this.maxY > 0 ? this.y / this.maxY : 0;
    this.viewport = { width, height };
    this.y = ratio * this.maxY;
    this.draw();
  }

  clear() {
    this.token += 1;
    window.clearTimeout(this.settle);
    this.endFade();
    this.stop();
    this.releaseBands();
    this.capture = null;
    this.y = 0;
    this.onFrame(null);
  }

  /** A wheel or trackpad step scrolls directly; a finger drag stretches past the edges. */
  scrollBy(dy: number, drag: boolean) {
    if (!this.capture) return;
    this.stop();
    if (drag) {
      const now = performance.now();
      this.samples.push({ t: now, dy });
      this.samples = this.samples.filter((sample) => now - sample.t < 100);
      const outside = this.y < 0 || this.y > this.maxY;
      this.y += outside ? dy * RUBBER : dy;
    } else {
      this.y = Math.min(this.maxY, Math.max(0, this.y + dy));
    }
    this.draw();
  }

  /** The finger lifts: carry on with the drag's speed, then settle inside the page. */
  release() {
    const now = performance.now();
    const recent = this.samples.filter((sample) => now - sample.t < 100);
    this.samples = [];
    const span = recent.length > 1 ? now - recent[0].t : 0;
    const distance = recent.reduce((sum, sample) => sum + sample.dy, 0);
    this.velocity = span > 0 ? distance / span : 0;
    if (Math.abs(this.velocity) < MIN_FLING) this.velocity = 0;
    this.animate();
  }

  private releaseBands() {
    this.bands.forEach((band) => band.bitmap.close());
    this.bands = [];
  }

  private stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.velocity = 0;
  }

  private snapshot() {
    const copy = document.createElement("canvas");
    copy.width = this.canvas.width;
    copy.height = this.canvas.height;
    copy.getContext("2d")?.drawImage(this.canvas, 0, 0);
    return copy;
  }

  private startFade(from: HTMLCanvasElement) {
    this.endFade();
    const fade = { from, start: performance.now(), frame: 0 };
    this.fade = fade;
    const step = () => {
      if (this.fade !== fade) return;
      this.draw();
      if (performance.now() - fade.start >= FADE_MS) this.endFade();
      else fade.frame = requestAnimationFrame(step);
    };
    fade.frame = requestAnimationFrame(step);
  }

  private endFade() {
    if (!this.fade) return;
    cancelAnimationFrame(this.fade.frame);
    this.fade = null;
    this.draw();
  }

  private animate() {
    cancelAnimationFrame(this.frame);
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(48, now - this.last);
      this.last = now;
      const max = this.maxY;
      const outside = this.y < 0 ? 0 : this.y > max ? max : null;
      if (outside !== null) {
        // Past an edge: brake hard and spring back.
        this.velocity *= 0.8;
        this.y += this.velocity * dt;
        this.y += (outside - this.y) * (1 - Math.exp(-dt / SPRING_MS));
        if (Math.abs(this.y - outside) < 0.5 && Math.abs(this.velocity) < MIN_FLING) {
          this.y = outside;
          this.velocity = 0;
        }
      } else {
        this.y += this.velocity * dt;
        this.velocity *= DECELERATION ** dt;
        if (Math.abs(this.velocity) < 0.01) this.velocity = 0;
      }
      this.draw();
      const settled = this.velocity === 0 && this.y >= 0 && this.y <= this.maxY;
      this.frame = settled ? 0 : requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private draw() {
    const capture = this.capture;
    const first = this.bands[0]?.bitmap;
    if (!first || !capture) return;
    const pixels = first.width / capture.width;
    const width = first.width;
    const height = Math.max(1, Math.round(this.viewport.height * this.scale * pixels));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const top = this.y * this.scale * pixels;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    // Only the parts of the bands inside the slice are copied; overscroll shows white.
    let to = Math.max(0, top);
    for (const { bitmap, start } of this.bands) {
      const from = Math.max(top, start);
      const end = Math.min(top + height, start + bitmap.height);
      if (end <= from) continue;
      context.drawImage(bitmap, 0, from - start, width, end - from, 0, from - top, width, end - from);
      to = Math.max(to, end);
    }
    // Below the first screen, until the full page arrives, the rest of the page is sketched.
    const coming = Math.min(this.extent * pixels, top + height);
    if (capture.partial && coming > Math.max(to, top)) {
      const start = Math.max(to, top) - top;
      paintSkeleton(context, 0, start, width, coming - top - start, 0, true);
    }
    if (this.fade) {
      const t = Math.min(1, (performance.now() - this.fade.start) / FADE_MS);
      context.globalAlpha = 1 - t * t * (3 - 2 * t);
      context.drawImage(this.fade.from, 0, 0, width, height);
      context.globalAlpha = 1;
    }
    this.onFrame(this.canvas);
    // The status bar samples its colour at most every 400 ms; one more paint after the page
    // stops lets it match where the scroll ended.
    window.clearTimeout(this.settle);
    this.settle = window.setTimeout(() => this.onFrame(this.canvas), 450);
  }
}
