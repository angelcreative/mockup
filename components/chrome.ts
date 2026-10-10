import type { DeviceSpec, ScreenStatus } from "@/lib/devices";

type Rgb = { r: number; g: number; b: number };

const FALLBACK: Rgb = { r: 243, g: 243, b: 243 };

let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

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

function drawStatusBar(
  context: CanvasRenderingContext2D,
  device: DeviceSpec,
  cssWidth: number,
  scale: number,
  ink: string,
) {
  if (device.topInset <= 0) return;
  const family = getComputedStyle(document.body).fontFamily || "Inter, sans-serif";
  const bandH = device.topInset * scale;
  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.font = `600 ${15 * scale}px ${family}`;
  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  context.fillText(time, 22 * scale, bandH / 2);

  const right = cssWidth * scale - 16 * scale;
  const mid = bandH / 2;
  drawBattery(context, right - 27 * scale, mid, scale);
  drawWifi(context, right - 46 * scale, mid + 1 * scale, scale);
  drawSignal(context, right - 78 * scale, mid + 5 * scale, scale);
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

function drawMessage(
  context: CanvasRenderingContext2D,
  status: ScreenStatus,
  message: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!message) return;
  const family = getComputedStyle(document.body).fontFamily || "Inter, sans-serif";
  context.fillStyle = status === "error" ? "#9f1239" : "#5c5c5c";
  context.font = `500 ${22 * (width / 390)}px ${family}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const words = message.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const maxWidth = width * 0.78;
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
  const lineHeight = 32 * (width / 390);
  const start = y + height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((value, index) => {
    context.fillText(value, x + width / 2, start + index * lineHeight);
  });
}

export function paintScreen(
  canvas: HTMLCanvasElement,
  device: DeviceSpec,
  frame: CanvasImageSource | null,
  frameWidth: number,
  frameHeight: number,
  status: ScreenStatus,
  message: string,
  cssWidth = device.width,
  cssHeight = device.height,
) {
  const scale = 2;
  const width = Math.max(2, Math.round(cssWidth * scale));
  const height = Math.max(2, Math.round(cssHeight * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  const top = device.topInset * scale;
  const bottom = device.bottomInset * scale;
  const contentH = height - top - bottom;
  const wide = cssWidth / Math.max(1, cssHeight) > 1.05;
  let topColor = FALLBACK;
  let bottomColor = FALLBACK;
  let drewFrame = false;
  if (frame && frameWidth > 0 && frameHeight > 0) {
    try {
      topColor = sampleStrip(frame, 0, 0, frameWidth, Math.max(1, Math.round(frameHeight * 0.02)));
      bottomColor = sampleStrip(frame, 0, Math.max(0, frameHeight - 2), frameWidth, 2);
      drewFrame = true;
    } catch {
      drewFrame = false;
    }
  }

  context.fillStyle = rgb(topColor);
  context.fillRect(0, 0, width, top);
  context.fillStyle = rgb(bottomColor);
  context.fillRect(0, height - bottom, width, bottom);
  context.fillStyle = "#f7f7f7";
  context.fillRect(0, top, width, contentH);

  if (drewFrame && frame) {
    try {
      drawContain(context, frame, 0, top, width, contentH, frameWidth, frameHeight);
    } catch {
      drawMessage(context, status, message, 0, top, wide ? width / 2 : width, contentH);
    }
  } else {
    drawMessage(context, status, message, 0, top, wide ? width / 2 : width, contentH);
  }

  const ink = isDark(topColor) ? "#f5f5f5" : "#111111";
  const homeInk = isDark(bottomColor) ? "rgba(245,245,245,0.92)" : "rgba(17,17,17,0.88)";
  drawStatusBar(context, device, cssWidth, scale, ink);
  drawHomeIndicator(context, device, cssWidth, cssHeight, scale, homeInk);
}
