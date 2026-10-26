import type { PageCapture } from "@/lib/page-capture";

/** One capture replacing another blends over this long. */
const FADE_MS = 220;

/**
 * Puts a captured screen on the glass. A capture from a slightly different size fills the
 * screen's width and is cut to its height, and each new capture fades over the last.
 */
export class PageView {
  readonly canvas: HTMLCanvasElement;
  private bitmap: ImageBitmap | null = null;
  private capture: PageCapture | null = null;
  private viewport = { width: 1, height: 1 };
  private token = 0;
  private fade: { from: HTMLCanvasElement; start: number; frame: number } | null = null;

  constructor(private readonly onFrame: (canvas: HTMLCanvasElement | null) => void) {
    this.canvas = document.createElement("canvas");
  }

  get current() {
    return this.capture;
  }

  async show(capture: PageCapture, width: number, height: number) {
    const token = ++this.token;
    if (capture === this.capture) {
      this.viewport = { width, height };
      this.draw();
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
    const fadeFrom = this.bitmap ? this.snapshot() : null;
    this.bitmap?.close();
    this.bitmap = bitmap;
    this.capture = capture;
    this.viewport = { width, height };
    if (fadeFrom) this.startFade(fadeFrom);
    this.draw();
    return true;
  }

  clear() {
    this.token += 1;
    this.endFade();
    this.bitmap?.close();
    this.bitmap = null;
    this.capture = null;
    this.onFrame(null);
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

  private draw() {
    const bitmap = this.bitmap;
    const capture = this.capture;
    if (!bitmap || !capture) return;
    // Pixels as captured; the height follows the screen's shape.
    const width = bitmap.width;
    const height = Math.max(1, Math.round((width * this.viewport.height) / this.viewport.width));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, Math.min(bitmap.height, height), 0, 0, width, Math.min(bitmap.height, height));
    if (this.fade) {
      const t = Math.min(1, (performance.now() - this.fade.start) / FADE_MS);
      context.globalAlpha = 1 - t * t * (3 - 2 * t);
      context.drawImage(this.fade.from, 0, 0, width, height);
      context.globalAlpha = 1;
    }
    this.onFrame(this.canvas);
  }
}
