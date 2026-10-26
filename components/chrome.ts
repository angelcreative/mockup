import type { DeviceSpec, ScreenStatus } from "@/lib/devices";
import { duoHole, isComputer, landscapeStatusPx } from "@/lib/devices";

type Rgb = { r: number; g: number; b: number };

const FALLBACK: Rgb = { r: 243, g: 243, b: 243 };

let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

/** Reading pixels back stalls the GPU, so the bar colours are sampled at most this often. */
const SAMPLE_MS = 400;
let sampled: { at: number; width: number; height: number; top: Rgb; bottom: Rgb } | null = null;

function sampleStrip(
  image: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): Rgb {
  if (typeof document === "undefined") return FALLBACK;
  scratch ??= document.createElement("canvas");
  scratchCtx ??= scratch.getContext("2d", { willReadFrequently: true });
  if (!scratchCtx) return FALLBACK;
  scratch.width = 1;
  scratch.height = 1;
  scratchCtx.drawImage(image, sx, sy, Math.max(1, sw), Math.max(1, sh), 0, 0, 1, 1);
  const pixel = scratchCtx.getImageData(0, 0, 1, 1).data;
  return { r: pixel[0], g: pixel[1], b: pixel[2] };
}

function rgb({ r, g, b }: Rgb) {
  return `rgb(${r}, ${g}, ${b})`;
}

function isDark({ r, g, b }: Rgb) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722 < 145;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawContain(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
) {
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const dw = imageWidth * scale;
  const dh = imageHeight * scale;
  context.drawImage(image, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
}

/** Page top lands on the right of the portrait glass, which is visual up after the device turns. */
function drawLandscape(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(Math.PI / 2);
  const scale = Math.min(height / imageWidth, width / imageHeight);
  const dw = imageWidth * scale;
  const dh = imageHeight * scale;
  context.drawImage(image, -dw / 2, -dh / 2, dw, dh);
  context.restore();
}

function drawSignal(context: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const barW = 3 * scale;
  const gap = 1.6 * scale;
  for (let index = 0; index < 4; index += 1) {
    const h = (4 + index * 2.4) * scale;
    context.fillRect(x + index * (barW + gap), y - h, barW, h);
  }
}

function drawWifi(context: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  context.strokeStyle = context.fillStyle as string;
  context.lineWidth = 1.6 * scale;
  context.lineCap = "round";
  for (let index = 0; index < 3; index += 1) {
    const radius = (3.2 + index * 3.1) * scale;
    context.beginPath();
    context.arc(x, y, radius, Math.PI * 1.16, Math.PI * 1.84);
    context.stroke();
  }
  context.beginPath();
  context.arc(x, y, 1.15 * scale, 0, Math.PI * 2);
  context.fill();
}

function drawBattery(context: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const w = 24 * scale;
  const h = 11.5 * scale;
  context.strokeStyle = context.fillStyle as string;
  context.lineWidth = 1.25 * scale;
  roundRect(context, x, y - h / 2, w, h, 2.5 * scale);
  context.stroke();
  context.fillRect(x + w + 0.6 * scale, y - 2.2 * scale, 1.6 * scale, 4.4 * scale);
  context.fillRect(x + 1.6 * scale, y - h / 2 + 1.5 * scale, w * 0.62, h - 3 * scale);
}

function fontFamily() {
  return getComputedStyle(document.body).fontFamily || "Inter, sans-serif";
}

function drawStatusIcons(
  context: CanvasRenderingContext2D,
  right: number,
  mid: number,
  scale: number,
) {
  drawBattery(context, right - 27 * scale, mid, scale);
  drawWifi(context, right - 46 * scale, mid + 1 * scale, scale);
  drawSignal(context, right - 78 * scale, mid + 5 * scale, scale);
}

function drawStatusBar(
  context: CanvasRenderingContext2D,
  device: DeviceSpec,
  cssWidth: number,
  scale: number,
  ink: string,
  time: string,
) {
  if (device.topInset <= 0) return;
  const bandH = device.topInset * scale;
  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.font = `600 ${15 * scale}px ${fontFamily()}`;
  // The clock starts past the cover's camera hole.
  const hole = duoHole(device, cssWidth);
  context.fillText(time, (hole ? hole.left + hole.size + 10 : 22) * scale, bandH / 2);

  const right = cssWidth * scale - 16 * scale;
  drawStatusIcons(context, right, bandH / 2, scale);
}

/** Visual top of a landscape phone is the portrait right edge. Text reads left to right after the device turns. */
function drawLandscapeStatus(
  context: CanvasRenderingContext2D,
  device: DeviceSpec,
  cssWidth: number,
  cssHeight: number,
  scale: number,
  ink: string,
  time: string,
) {
  const statusPx = landscapeStatusPx(device);
  if (statusPx <= 0) return;
  const band = statusPx * scale;
  const barLen = cssHeight * scale;
  const x0 = cssWidth * scale - band;
  context.save();
  context.beginPath();
  context.rect(x0, 0, band, barLen);
  context.clip();
  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.translate(x0 + band / 2, 0);
  context.rotate(Math.PI / 2);
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.font = `600 ${13 * scale}px ${fontFamily()}`;
  context.fillText(time, 22 * scale, 0);
  drawStatusIcons(context, barLen - 16 * scale, 0, scale);
  context.restore();
}

function drawMenuBar(
  context: CanvasRenderingContext2D,
  device: DeviceSpec,
  cssWidth: number,
  scale: number,
  ink: string,
  time: string,
) {
  if (device.topInset <= 0) return;
  const bandH = device.topInset * scale;
  const family = fontFamily();
  context.fillStyle = ink;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.font = `500 ${13 * scale}px ${family}`;
  let x = 18 * scale;
  for (const label of ["File", "Edit", "View"]) {
    context.fillText(label, x, bandH / 2);
    x += context.measureText(label).width + 18 * scale;
  }
  context.textAlign = "right";
  context.fillText(time, cssWidth * scale - 18 * scale, bandH / 2);
}

function drawHomeIndicator(
  context: CanvasRenderingContext2D,
  device: DeviceSpec,
  cssWidth: number,
  cssHeight: number,
  scale: number,
  ink: string,
) {
  if (device.bottomInset <= 0) return;
  const width = (device.kind === "tablet" ? cssWidth * 0.13 : Math.min(134, cssWidth * 0.34)) * scale;
  const height = 5 * scale;
  const fromBottom = (device.kind === "tablet" ? 7 : 10) * scale;
  const x = (cssWidth * scale - width) / 2;
  const y = cssHeight * scale - fromBottom - height;
  context.fillStyle = ink;
  roundRect(context, x, y, width, height, height / 2);
  context.fill();
}

function drawLoader(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
) {
  if (width < 4 || height < 4) return;
  const radius = Math.min(Math.max(18, Math.min(width, height) * 0.045), 56);
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(angle);
  context.strokeStyle = "rgba(70,70,70,0.72)";
  context.lineWidth = Math.max(2.4, radius * 0.14);
  context.lineCap = "round";
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 1.35);
  context.stroke();
  context.restore();
}

/**
 * A page-shaped placeholder: a bar, a hero, headings, text and cards, swept by a soft
 * highlight. `phase` (radians) moves the sweep.
 */
function paintSkeleton(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  phase: number,
) {
  if (width < 8 || height < 8) return;
  const unit = Math.max(0.5, Math.min(width / 390, height / 640));
  const pad = 18 * unit;
  const inner = Math.min(width - pad * 2, 1100 * unit);
  const left = x + (width - inner) / 2;
  const block = (bx: number, by: number, bw: number, bh: number, radius: number) => {
    if (by > y + height || by + bh < y) return;
    roundRect(context, bx, by, bw, bh, radius);
    context.fill();
  };
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillStyle = "#e9e9e9";
  let cursor = y;
  context.fillRect(x, y, width, 52 * unit);
  cursor += 52 * unit + pad;
  const hero = Math.min(height * 0.34, 300 * unit);
  block(left, cursor, inner, hero, 14 * unit);
  cursor += hero + pad * 1.4;
  // Text and cards repeat down the page.
  const widths = [0.62, 0.94, 0.86, 0.72];
  while (cursor < y + height) {
    block(left, cursor, inner * widths[0], 20 * unit, 6 * unit);
    cursor += 20 * unit + pad;
    for (const share of widths.slice(1)) {
      block(left, cursor, inner * share, 11 * unit, 5 * unit);
      cursor += 22 * unit;
    }
    cursor += pad;
    const gap = 12 * unit;
    const card = (inner - gap) / 2;
    block(left, cursor, card, 118 * unit, 12 * unit);
    block(left + card + gap, cursor, card, 118 * unit, 12 * unit);
    cursor += 118 * unit + pad * 1.6;
  }
  // The sweep crosses the area every turn of the phase.
  const travel = width * 1.6;
  const offset = x - width * 0.3 + ((((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * travel;
  const sweep = context.createLinearGradient(offset - width * 0.25, y, offset + width * 0.25, y + height * 0.12);
  sweep.addColorStop(0, "rgba(255,255,255,0)");
  sweep.addColorStop(0.5, "rgba(255,255,255,0.55)");
  sweep.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = sweep;
  context.fillRect(x, y, width, height);
  context.restore();
}

/** A quiet line under the placeholder when a page is slow, e.g. "Still loading…". */
function drawCaption(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number) {
  const unit = Math.max(0.5, Math.min(width / 390, height / 640));
  const size = 13 * unit;
  context.save();
  context.font = `500 ${size}px ${fontFamily()}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const pillW = Math.min(width * 0.86, context.measureText(text).width + 28 * unit);
  const pillH = 30 * unit;
  const cx = x + width / 2;
  const cy = y + height - 56 * unit;
  context.fillStyle = "rgba(23,23,23,0.82)";
  roundRect(context, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
  context.fill();
  context.fillStyle = "#ffffff";
  context.fillText(text, cx, cy);
  context.restore();
}

function wrapLines(context: CanvasRenderingContext2D, message: string, maxWidth: number) {
  const words = message.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawMessage(
  context: CanvasRenderingContext2D,
  message: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!message) return;
  const family = fontFamily();
  const unit = width / 390;
  context.fillStyle = "#5c5c5c";
  context.font = `500 ${22 * unit}px ${family}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines = wrapLines(context, message, width * 0.78);
  const lineHeight = 32 * unit;
  const start = y + height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((value, index) => {
    context.fillText(value, x + width / 2, start + index * lineHeight);
  });
}

function drawRecovery(
  context: CanvasRenderingContext2D,
  title: string,
  detail: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!title) return;
  const family = fontFamily();
  const unit = width / 390;
  const titleSize = 22 * unit;
  const detailSize = 15 * unit;
  const actionSize = 15 * unit;
  const maxWidth = width * 0.78;
  const titleLine = titleSize * 1.35;
  const detailLine = detailSize * 1.45;
  const actionHeight = 34 * unit;
  const gap = 12 * unit;

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `500 ${titleSize}px ${family}`;
  const titleLines = wrapLines(context, title, maxWidth);
  context.font = `400 ${detailSize}px ${family}`;
  const detailLines = detail ? wrapLines(context, detail, maxWidth) : [];
  const block =
    titleLines.length * titleLine +
    (detailLines.length ? gap + detailLines.length * detailLine : 0) +
    gap * 1.6 +
    actionHeight;
  let cursor = y + (height - block) / 2;

  context.fillStyle = "#5c5c5c";
  context.font = `500 ${titleSize}px ${family}`;
  for (const line of titleLines) {
    context.fillText(line, x + width / 2, cursor + titleLine / 2);
    cursor += titleLine;
  }
  if (detailLines.length) {
    cursor += gap;
    context.fillStyle = "#737373";
    context.font = `400 ${detailSize}px ${family}`;
    for (const line of detailLines) {
      context.fillText(line, x + width / 2, cursor + detailLine / 2);
      cursor += detailLine;
    }
  }
  cursor += gap * 1.6;

  context.font = `500 ${actionSize}px ${family}`;
  const label = "Open again";
  const buttonWidth = Math.min(maxWidth, context.measureText(label).width + 28 * unit);
  const buttonX = x + (width - buttonWidth) / 2;
  context.fillStyle = "rgba(255,255,255,0.9)";
  context.strokeStyle = "rgba(23,23,23,0.14)";
  context.lineWidth = Math.max(1, unit);
  roundRect(context, buttonX, cursor, buttonWidth, actionHeight, actionHeight / 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#171717";
  context.fillText(label, x + width / 2, cursor + actionHeight / 2);
}

export function paintDesign(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  image: CanvasImageSource | null,
  imageWidth: number,
  imageHeight: number,
  reveal = 1,
  spin = 0,
) {
  const scale = 2;
  const width = Math.max(2, Math.round(cssWidth * scale));
  const height = Math.max(2, Math.round(cssHeight * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f7f7f7";
  context.fillRect(0, 0, width, height);
  const hasImage = Boolean(image) && imageWidth > 0 && imageHeight > 0;
  if (reveal < 1) drawLoader(context, 0, 0, width, height, spin);
  if (hasImage && image && reveal > 0) {
    context.save();
    context.globalAlpha = reveal;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    drawContain(context, image, 0, 0, width, height, imageWidth, imageHeight);
    context.restore();
    return;
  }
  if (!hasImage && reveal > 0) {
    context.save();
    context.globalAlpha = reveal;
    drawMessage(context, "Upload a design for this screen", 0, 0, width, height);
    context.restore();
  }
}

export function paintScreen(
  canvas: HTMLCanvasElement,
  device: DeviceSpec,
  frame: CanvasImageSource | null,
  frameWidth: number,
  frameHeight: number,
  status: ScreenStatus,
  message: string,
  detail = "",
  cssWidth = device.width,
  cssHeight = device.height,
  orientation: "portrait" | "landscape" = "portrait",
  time = "9:41",
  reveal = 1,
  spin = 0,
) {
  // Large screens stream at 1× (see dsfFor), so painting them at 2× only costs memory and upload time.
  const scale = cssWidth * cssHeight > 600_000 ? 1 : 2;
  const width = Math.max(2, Math.round(cssWidth * scale));
  const height = Math.max(2, Math.round(cssHeight * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  const landscape = orientation === "landscape" && !isComputer(device);
  const sideTop = landscape && device.cutout === "none" ? 0 : device.topInset;
  const statusPx = landscape ? landscapeStatusPx(device) : 0;
  const top = sideTop * scale;
  const bottom = device.bottomInset * scale;
  const statusBand = statusPx * scale;
  const pageW = width - statusBand;
  const pageH = height - top - bottom;
  const splitMessage = device.id === "iphone-duo" && cssWidth / Math.max(1, cssHeight) > 1.05;
  const messageWidth = splitMessage ? width / 2 : pageW;
  let topColor = FALLBACK;
  let bottomColor = FALLBACK;
  let drewFrame = false;
  if (frame && frameWidth > 0 && frameHeight > 0) {
    const now = performance.now();
    if (sampled && sampled.width === frameWidth && sampled.height === frameHeight && now - sampled.at < SAMPLE_MS) {
      topColor = sampled.top;
      bottomColor = sampled.bottom;
      drewFrame = true;
    } else {
      try {
        topColor = sampleStrip(frame, 0, 0, frameWidth, Math.max(1, Math.round(frameHeight * 0.02)));
        bottomColor = sampleStrip(frame, 0, Math.max(0, frameHeight - 2), frameWidth, 2);
        sampled = { at: now, width: frameWidth, height: frameHeight, top: topColor, bottom: bottomColor };
        drewFrame = true;
      } catch {
        drewFrame = false;
      }
    }
  }

  const ink = isDark(topColor) ? "#f5f5f5" : "#111111";
  const homeInk = isDark(bottomColor) ? "rgba(245,245,245,0.92)" : "rgba(17,17,17,0.88)";

  if (top > 0) {
    context.fillStyle = rgb(topColor);
    context.fillRect(0, 0, width, top);
  }
  if (bottom > 0) {
    context.fillStyle = rgb(bottomColor);
    context.fillRect(0, height - bottom, width, bottom);
  }
  if (statusBand > 0) {
    context.fillStyle = rgb(topColor);
    context.fillRect(pageW, 0, statusBand, height);
  }
  context.fillStyle = "#f7f7f7";
  context.fillRect(0, top, pageW, pageH);

  const recovery = status === "error" || status === "paused";
  if (recovery && drewFrame && frame) {
    context.save();
    context.globalAlpha = 0.42;
    try {
      if (landscape) {
        drawLandscape(context, frame, 0, top, pageW, pageH, frameWidth, frameHeight);
      } else {
        drawContain(context, frame, 0, top, pageW, pageH, frameWidth, frameHeight);
      }
    } catch {
      drewFrame = false;
    }
    context.restore();
    context.fillStyle = "rgba(247,247,247,0.46)";
    context.fillRect(0, top, pageW, pageH);
  }

  const showLoader = reveal < 1 && !recovery && status !== "empty";
  if (showLoader) {
    // The placeholder is laid out in page space, so a turned device gets it turned too.
    const skeleton = (sx: number, sw: number) => {
      if (!landscape) {
        paintSkeleton(context, sx, top, sw, pageH, spin);
        return;
      }
      context.save();
      context.translate(sx + sw / 2, top + pageH / 2);
      context.rotate(Math.PI / 2);
      paintSkeleton(context, -pageH / 2, -sw / 2, pageH, sw, spin);
      context.restore();
    };
    if (splitMessage) {
      skeleton(0, pageW / 2);
      skeleton(pageW / 2, pageW / 2);
    } else {
      skeleton(0, pageW);
    }
    if (message && message !== "Opening…") {
      if (landscape) {
        context.save();
        context.translate(pageW / 2, top + pageH / 2);
        context.rotate(Math.PI / 2);
        drawCaption(context, message, -pageH / 2, -pageW / 2, pageH, pageW);
        context.restore();
      } else {
        drawCaption(context, message, 0, top, pageW, pageH);
      }
    }
  }

  const paintNotice = (noticeX: number, noticeY: number, noticeWidth: number, noticeHeight: number) => {
    if (recovery) {
      drawRecovery(context, message, detail, noticeX, noticeY, noticeWidth, noticeHeight);
      return;
    }
    drawMessage(context, message, noticeX, noticeY, noticeWidth, noticeHeight);
  };

  if (!recovery && drewFrame && frame && reveal > 0) {
    context.save();
    context.globalAlpha = reveal;
    try {
      if (landscape) {
        drawLandscape(context, frame, 0, top, pageW, pageH, frameWidth, frameHeight);
      } else {
        drawContain(context, frame, 0, top, pageW, pageH, frameWidth, frameHeight);
      }
    } catch {
      paintNotice(0, top, messageWidth, pageH);
    }
    context.restore();
  } else if (!showLoader && landscape) {
    context.save();
    context.translate(pageW / 2, top + pageH / 2);
    context.rotate(Math.PI / 2);
    paintNotice(-pageH / 2, -messageWidth / 2, pageH, messageWidth);
    context.restore();
  } else if (!showLoader) {
    paintNotice(0, top, messageWidth, pageH);
  }

  if (isComputer(device)) {
    const bar = isDark(topColor) ? "rgba(28,28,30,0.94)" : "rgba(246,246,246,0.96)";
    context.fillStyle = bar;
    context.fillRect(0, 0, width, device.topInset * scale);
    drawMenuBar(context, device, cssWidth, scale, ink, time);
    return;
  }

  if (landscape) {
    drawLandscapeStatus(context, device, cssWidth, cssHeight, scale, ink, time);
  } else {
    drawStatusBar(context, device, cssWidth, scale, ink, time);
  }
  drawHomeIndicator(context, device, cssWidth, cssHeight, scale, homeInk);
}
