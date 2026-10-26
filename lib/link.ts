import {
  BACKGROUNDS,
  deviceById,
  isDeviceId,
  type BackgroundId,
  type DeviceId,
  type DeviceSpec,
  type Orientation,
} from "@/lib/devices";
import { normalizeHttpUrl } from "@/lib/url";

/** What a shared link restores. Anything missing or invalid falls back to the studio default. */
export type LinkState = {
  url?: string;
  device?: DeviceId;
  finish?: string;
  background?: BackgroundId;
  orientation?: Orientation;
  open?: boolean;
  /** Where in the page the screen shows, 0 the top to 1 the bottom. */
  position?: number;
};

export const LINK_DEFAULTS = { url: "https://www.apple.com", device: "iphone-14" as DeviceId };

/** Laptops start open; the Duo starts closed. */
export function defaultOpen(device: DeviceSpec) {
  return device.kind === "laptop";
}

export function hasHinge(device: DeviceSpec) {
  return device.id === "iphone-duo" || device.kind === "laptop";
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(normalizeHttpUrl(value));
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function readLink(search: string): LinkState {
  const params = new URLSearchParams(search);
  const state: LinkState = {};
  const url = params.get("url");
  if (url && isHttpUrl(url)) state.url = normalizeHttpUrl(url);
  const device = params.get("device");
  if (device && isDeviceId(device)) state.device = device;
  const spec = deviceById(state.device ?? LINK_DEFAULTS.device);
  const finish = params.get("finish");
  if (finish && spec.finishes.some((item) => item.id === finish)) state.finish = finish;
  const background = params.get("bg");
  const known = BACKGROUNDS.find((item) => item.id === background);
  if (known) state.background = known.id;
  const orientation = params.get("orientation");
  if (orientation === "portrait" || orientation === "landscape") state.orientation = orientation;
  const open = params.get("open");
  if (open === "1" || open === "0") state.open = open === "1";
  const at = Number(params.get("at"));
  if (params.has("at") && Number.isFinite(at)) state.position = Math.round(Math.min(1, Math.max(0, at)) * 20) / 20;
  return state;
}

/** Only what differs from the defaults goes in the link, so it stays short. */
export function writeLink(state: {
  url: string;
  device: DeviceSpec;
  finish: string;
  background: BackgroundId | null;
  orientation: Orientation;
  open: boolean;
  position: number;
}) {
  const params = new URLSearchParams();
  if (state.url !== LINK_DEFAULTS.url) params.set("url", state.url);
  if (state.device.id !== LINK_DEFAULTS.device) params.set("device", state.device.id);
  if (state.finish !== state.device.finishes[0].id) params.set("finish", state.finish);
  if (state.background && state.background !== "blanco") params.set("bg", state.background);
  if (state.orientation !== "portrait") params.set("orientation", state.orientation);
  if (hasHinge(state.device) && state.open !== defaultOpen(state.device)) params.set("open", state.open ? "1" : "0");
  if (state.position > 0) params.set("at", String(state.position));
  const query = params.toString();
  return query ? `?${query}` : "";
}
