/** One screen of a page as the client keeps it: the JPEG, decoded only while on screen. */
export type PageCapture = {
  url: string;
  /** CSS size of the screen it was taken at. */
  width: number;
  height: number;
  /** Where in the page it was taken: 0 the top, 1 the last screen. */
  position: number;
  pageHeight: number;
  blob: Blob;
};

export class CaptureFailed extends Error {}

/** Positions come in 5% steps, matching the server's cache. */
export function snapPosition(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 20) / 20;
}

export function captureKey(url: string, width: number, height: number, position: number) {
  return `${url}|${width}x${height}|${snapPosition(position)}`;
}

function captureParams(url: string, width: number, height: number, position: number) {
  return new URLSearchParams({ url, w: String(width), h: String(height), at: String(snapPosition(position)) });
}

export async function fetchCapture(
  url: string,
  width: number,
  height: number,
  options: { position: number; urgent: boolean; fresh?: boolean },
): Promise<PageCapture> {
  const params = captureParams(url, width, height, options.position);
  if (!options.urgent) params.set("priority", "low");
  if (options.fresh) params.set("fresh", "1");
  let response: Response;
  try {
    response = await fetch(`/api/capture?${params}`);
  } catch {
    throw new CaptureFailed("Can't reach the server. Check your connection.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new CaptureFailed(body?.error ?? "Could not open this page.");
  }
  return {
    url,
    width: Number(response.headers.get("X-Capture-Width")) || width,
    height: Number(response.headers.get("X-Capture-Height")) || height,
    position: snapPosition(options.position),
    pageHeight: Number(response.headers.get("X-Page-Height")) || height,
    blob: await response.blob(),
  };
}

/** Asks the server to start a capture without waiting for it, e.g. while a URL is typed. */
export function warmCapture(url: string, width: number, height: number, position: number) {
  const params = captureParams(url, width, height, position);
  params.set("warm", "1");
  void fetch(`/api/capture?${params}`).catch(() => undefined);
}

/** Starts Chromium on the server ahead of the first capture. */
export function warmServer() {
  void fetch("/api/warm").catch(() => undefined);
}
