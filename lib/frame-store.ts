/**
 * The newest screencast frame, outside React state. Frames arrive many times a second;
 * the scene subscribes and repaints the glass without re-rendering the whole studio.
 */
export type FrameStore = {
  get: () => ImageBitmap | null;
  set: (next: ImageBitmap | null) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createFrameStore(): FrameStore {
  let current: ImageBitmap | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      if (current === next) return;
      const stale = current;
      current = next;
      listeners.forEach((listener) => listener());
      // The GPU may still be reading the old bitmap for the frame being drawn.
      if (stale) requestAnimationFrame(() => requestAnimationFrame(() => stale.close()));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
