export type ScreenPanel = "single" | "left" | "right";

export type PointerHit = {
  u: number;
  v: number;
  panel: ScreenPanel;
  screenWidth: number;
  screenHeight: number;
  topInset: number;
  bottomInset: number;
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
  const contentTop = topInset;
  const contentBottom = screenHeight - bottomInset;
  if (yFromTop < contentTop || yFromTop > contentBottom) return null;

  const contentHeight = contentBottom - contentTop;
  if (contentHeight <= 0) return null;
  const along = (yFromTop - contentTop) / contentHeight;

  // Landscape turns the device clockwise onto its side and draws the page
  // rotated so the top of the page stays up. Phone-top is page-left.
  if (orientation === "landscape") {
    const x = along * viewportWidth;
    const y =
      panel === "right"
        ? (1 - u) * (viewportHeight / 2)
        : panel === "left"
          ? viewportHeight / 2 + (1 - u) * (viewportHeight / 2)
          : (1 - u) * viewportHeight;
    if (x < 0 || y < 0 || x > viewportWidth || y > viewportHeight) return null;
    return {
      x: Math.min(x, Math.max(0, viewportWidth - 0.01)),
      y: Math.min(y, Math.max(0, viewportHeight - 0.01)),
    };
  }

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
