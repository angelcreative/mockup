export type LiveClientMessage =
  | { type: "open"; url: string; width: number; height: number }
  | { type: "resize"; width: number; height: number }
  | { type: "ping" }
  | {
      type: "input";
      action: "move" | "down" | "up" | "wheel";
      x: number;
      y: number;
      button?: number;
      deltaX?: number;
      deltaY?: number;
    };

export type LiveServerMessage =
  | { type: "status"; state: "loading" | "ready" }
  | { type: "error"; message: string }
  | { type: "idle" };

export function parseClientMessage(raw: string): LiveClientMessage | null {
  if (raw.length > 8192) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as { type?: unknown };
  if (message.type === "ping") return { type: "ping" };
  if (message.type === "open" || message.type === "resize") {
    const body = value as { url?: unknown; width?: unknown; height?: unknown };
    if (message.type === "open" && (typeof body.url !== "string" || body.url.length > 2048)) {
      return null;
    }
    if (typeof body.width !== "number" || typeof body.height !== "number") return null;
    if (message.type === "open") {
      return { type: "open", url: body.url as string, width: body.width, height: body.height };
    }
    return { type: "resize", width: body.width, height: body.height };
  }
  if (message.type === "input") {
    const body = value as {
      action?: unknown;
      x?: unknown;
      y?: unknown;
      button?: unknown;
      deltaX?: unknown;
      deltaY?: unknown;
    };
    if (
      body.action !== "move" &&
      body.action !== "down" &&
      body.action !== "up" &&
      body.action !== "wheel"
    ) {
      return null;
    }
    if (typeof body.x !== "number" || typeof body.y !== "number") return null;
    return {
      type: "input",
      action: body.action,
      x: body.x,
      y: body.y,
      button: typeof body.button === "number" ? body.button : 0,
      deltaX: typeof body.deltaX === "number" ? body.deltaX : 0,
      deltaY: typeof body.deltaY === "number" ? body.deltaY : 0,
    };
  }
  return null;
}
