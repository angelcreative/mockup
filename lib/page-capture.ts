/** A full-page capture as the client keeps it: the JPEG, decoded only while on screen. */
export type PageCapture = {
  url: string;
  /** CSS size of the viewport it was taken at, and how much of the page height it covers. */
  width: number;
  viewportHeight: number;
  height: number;
  pageHeight: number;
  blob: Blob;
};

export class CaptureFailed extends Error {}

export function captureKey(url: string, width: number, height: number) {
  return `${url}|${width}x${height}`;
}

export async function fetchCapture(
  url: string,
  width: number,
  height: number,
  options: { urgent: boolean; fresh?: boolean },
): Promise<PageCapture> {
  const params = new URLSearchParams({ url, w: String(width), h: String(height) });
  if (!options.urgent) params.set("priority", "low");
  if (options.fresh) params.set("fresh", "1");
  const response = await fetch(`/api/capture?${params}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new CaptureFailed(body?.error ?? "Could not open this page");
  }
  return {
    url,
    width: Number(response.headers.get("X-Capture-Width")) || width,
    viewportHeight: height,
    height: Number(response.headers.get("X-Capture-Height")) || height,
    pageHeight: Number(response.headers.get("X-Page-Height")) || height,
    blob: await response.blob(),
  };
}
