export type ScreenPanel = "single" | "left" | "right";

export type PointerHit = {
  u: number;
  v: number;
  panel: ScreenPanel;
  screenWidth: number;
  screenHeight: number;
  topInset: number;
  bottomInset: number;
  /** Full glass width. Duo panels pass the whole display, not one leaf. */
  glassWidth?: number;
  cutout?: "notch" | "island" | "none";
  /** Landscape status-bar thickness, in CSS px of the glass width. */
  landscapeStatus?: number;
};

export function uvToCss(
  hit: PointerHit,
  viewportWidth: number,
  viewportHeight: number,
  orientation: "portrait" | "landscape" = "portrait",
): { x: number; y: number } | null {
  const { u, v, panel, screenWidth, screenHeight, topInset, bottomInset } = hit;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  if (screenWidth <= 0 || screenHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }

  const yFromTop = (1 - v) * screenHeight;

  // Landscape turns the device clockwise onto its side and draws the page
  // rotated so the top of the page stays up. Phone-top is page-left.
  // The status bar sits on the visual top (portrait right). The cutout stays
  // on the physical top, which is the visual left.
  if (orientation === "landscape") {
    const cutout = hit.cutout ?? "notch";
    const sideTop = cutout === "none" ? 0 : topInset;
    const sideBottom = bottomInset;
    if (yFromTop < sideTop || yFromTop > screenHeight - sideBottom) return null;
    const span = screenHeight - sideTop - sideBottom;
    if (span <= 0) return null;
    const along = (yFromTop - sideTop) / span;

    const glassWidth = hit.glassWidth ?? screenWidth;
    const status = hit.landscapeStatus ?? 0;
    const uPage = glassWidth > 0 ? (glassWidth - status) / glassWidth : 1;
    if (uPage <= 0) return null;
    const fullU = panel === "right" ? 0.5 + u * 0.5 : panel === "left" ? u * 0.5 : u;
    if (fullU > uPage) return null;

    const x = along * viewportWidth;
    const y = ((uPage - fullU) / uPage) * viewportHeight;
    if (x < 0 || y < 0 || x > viewportWidth || y > viewportHeight) return null;
    return {
      x: Math.min(x, Math.max(0, viewportWidth - 0.01)),
      y: Math.min(y, Math.max(0, viewportHeight - 0.01)),
    };
  }

  const contentTop = topInset;
  const contentBottom = screenHeight - bottomInset;
  if (yFromTop < contentTop || yFromTop > contentBottom) return null;

  const contentHeight = contentBottom - contentTop;
  if (contentHeight <= 0) return null;
  const along = (yFromTop - contentTop) / contentHeight;

  const y = along * viewportHeight;

  let x: number;
  if (panel === "right") {
    x = viewportWidth / 2 + u * (viewportWidth / 2);
  } else if (panel === "left" && viewportWidth > screenWidth + 0.5) {
    x = u * screenWidth;
  } else {
    x = u * viewportWidth;
  }

  if (x < 0 || y < 0 || x > viewportWidth || y > viewportHeight) return null;
  return {
    x: Math.min(x, Math.max(0, viewportWidth - 0.01)),
    y: Math.min(y, Math.max(0, viewportHeight - 0.01)),
  };
}
