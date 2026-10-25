import type { PageCapture } from "@/lib/page-capture";

/** iOS-like feel: momentum decays per millisecond, the edges stretch and spring back. */
const DECELERATION = 0.998;
const RUBBER = 0.35;
const SPRING_MS = 90;
const MIN_FLING = 0.06;

/**
 * Scrolls a full-page capture inside the device. It draws only the visible slice into a
 * canvas sized to the viewport, so the glass never holds the whole tall image.
 */
export class PageScroller {
  readonly canvas: HTMLCanvasElement;
  private bitmap: ImageBitmap | null = null;
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

  constructor(private readonly onFrame: (canvas: HTMLCanvasElement | null) => void) {
    this.canvas = document.createElement("canvas");
  }

  /** Viewport CSS pixels per capture CSS pixel, so a capture from a near size still fits. */
  private get scale() {
    return this.capture ? this.capture.width / this.viewport.width : 1;
  }

  private get maxY() {
    if (!this.capture) return 0;
    return Math.max(0, this.capture.height / this.scale - this.viewport.height);
  }

  get current() {
    return this.capture;
  }

  /** Shows a capture, keeping the reader at the same point of the page. */
  async show(capture: PageCapture, width: number, height: number) {
    const token = ++this.token;
    if (capture === this.capture) {
      this.resize(width, height);
      return true;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(capture.blob);
    } catch {
      return false;
    }
    if (token !== this.token) {
      bitmap.close();
      return false;
    }
    // The same page at another size keeps its place; a new page starts at the top.
    const ratio = this.capture?.url === capture.url && this.maxY > 0 ? this.y / this.maxY : 0;
    this.bitmap?.close();
    this.bitmap = bitmap;
    this.capture = capture;
    this.viewport = { width, height };
    this.y = ratio * this.maxY;
    this.stop();
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
    this.stop();
    this.bitmap?.close();
    this.bitmap = null;
    this.capture = null;
    this.y = 0;
    this.onFrame(null);
  }

  top() {
    this.stop();
    this.y = 0;
    this.draw();
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

  private stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.velocity = 0;
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
    const bitmap = this.bitmap;
    const capture = this.capture;
    if (!bitmap || !capture) return;
    const pixels = bitmap.width / capture.width;
    const width = bitmap.width;
    const height = Math.max(1, Math.round(this.viewport.height * this.scale * pixels));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const top = this.y * this.scale * pixels;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    // Only the part of the slice that lies on the image is copied; overscroll shows white.
    const from = Math.max(0, top);
    const to = Math.min(bitmap.height, top + height);
    if (to > from) context.drawImage(bitmap, 0, from, width, to - from, 0, from - top, width, to - from);
    this.onFrame(this.canvas);
    // The status bar samples its colour at most every 400 ms; one more paint after the page
    // stops lets it match where the scroll ended.
    window.clearTimeout(this.settle);
    this.settle = window.setTimeout(() => this.onFrame(this.canvas), 450);
  }
}
