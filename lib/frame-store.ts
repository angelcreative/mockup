/** What the glass shows: the captured screen, redrawn while one capture fades into the next. */
export type PageFrame = HTMLCanvasElement | ImageBitmap;

/**
 * The current page frame, outside React state. A fade redraws it many times a second;
 * the scene subscribes and repaints the glass without re-rendering the whole studio.
 */
export type FrameStore = {
  get: () => PageFrame | null;
  /** Notifies even when the frame is the same canvas, since its pixels have changed. */
  set: (next: PageFrame | null) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createFrameStore(): FrameStore {
  let current: PageFrame | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      current = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
