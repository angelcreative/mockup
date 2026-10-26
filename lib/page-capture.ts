/** A capture as the client keeps it: the JPEG, decoded only while on screen. */
export type PageCapture = {
  url: string;
  /** CSS size of the viewport it was taken at, and how much of the page height it covers. */
  width: number;
  viewportHeight: number;
  height: number;
  pageHeight: number;
  /** Only the first screen; the full page is still on its way. */
  partial: boolean;
  /** JPEG bands, top to bottom, with their CSS heights. */
  tiles: { blob: Blob; height: number }[];
};

export class CaptureFailed extends Error {}

export function captureKey(url: string, width: number, height: number) {
  return `${url}|${width}x${height}`;
}

function captureParams(url: string, width: number, height: number) {
  return new URLSearchParams({ url, w: String(width), h: String(height) });
}

export async function fetchCapture(
  url: string,
  width: number,
  height: number,
  options: { urgent: boolean; fresh?: boolean; part?: "top" | "full" },
): Promise<PageCapture> {
  const params = captureParams(url, width, height);
  if (!options.urgent) params.set("priority", "low");
  if (options.fresh) params.set("fresh", "1");
  if (options.part === "top") params.set("part", "top");
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
  const captured = Number(response.headers.get("X-Capture-Height")) || height;
  const pageHeight = Number(response.headers.get("X-Page-Height")) || height;
  const body = await response.blob();
  return {
    url,
    width: Number(response.headers.get("X-Capture-Width")) || width,
    viewportHeight: height,
    height: captured,
    pageHeight,
    // A request for the top can be answered with the whole page when that is cached.
    partial: options.part === "top" && captured <= height && pageHeight > captured,
    tiles: splitTiles(body, response.headers.get("X-Tiles"), captured),
  };
}

/** The server sends the page as JPEG bands back to back; `X-Tiles` lists "height:bytes" for each. */
function splitTiles(body: Blob, header: string | null, height: number) {
  const parts = (header ?? "")
    .split(",")
    .map((part) => part.split(":").map(Number))
    .filter(([h, bytes]) => h > 0 && bytes > 0);
  if (parts.length === 0) return [{ blob: body, height }];
  let offset = 0;
  return parts.map(([h, bytes]) => {
    const blob = body.slice(offset, offset + bytes, "image/jpeg");
    offset += bytes;
    return { blob, height: h };
  });
}

/** Asks the server to start a capture without waiting for it, e.g. while a URL is typed. */
export function warmCapture(url: string, width: number, height: number) {
  const params = captureParams(url, width, height);
  params.set("warm", "1");
  void fetch(`/api/capture?${params}`).catch(() => undefined);
}

/** Starts Chromium on the server ahead of the first capture. */
export function warmServer() {
  void fetch("/api/warm").catch(() => undefined);
}
