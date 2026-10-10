export type DeviceId =
  | "iphone-14"
  | "iphone-15"
  | "iphone-16"
  | "iphone-16-pro"
  | "fold"
  | "ipad-pro-13"
  | "ipad-pro-11"
  | "ipad-air-13"
  | "ipad-air-11"
  | "ipad"
  | "ipad-mini";

export type Cutout = "notch" | "island" | "none";

export type Finish = "midnight" | "black" | "graphite" | "titanium" | "silver" | "starlight";

export type DeviceKind = "phone" | "tablet" | "fold";

export type CameraEdge = "none" | "top" | "right";

export type DeviceSpec = {
  id: DeviceId;
  label: string;
  width: number;
  height: number;
  cutout: Cutout;
  finish: Finish;
  kind: DeviceKind;
  topInset: number;
  bottomInset: number;
  camera: CameraEdge;
};

export const FOLD_PANEL_WIDTH = 384;
export const FOLD_OPEN_WIDTH = 768;
export const FOLD_HEIGHT = 874;
export const FOLD_OPEN_AT = 0.02;

export const ISLAND_POINTS = { width: 126, height: 37, top: 11 };
export const NOTCH_POINTS = { width: 162, height: 33 };

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

const FOLD_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel Fold) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

export const DEVICES: readonly DeviceSpec[] = [
  {
    id: "iphone-14",
    label: "iPhone 14",
    width: 390,
    height: 844,
    cutout: "notch",
    finish: "midnight",
    kind: "phone",
    topInset: 47,
    bottomInset: 34,
    camera: "none",
  },
  {
    id: "iphone-15",
    label: "iPhone 15",
    width: 393,
    height: 852,
    cutout: "island",
    finish: "black",
    kind: "phone",
    topInset: 59,
    bottomInset: 34,
    camera: "none",
  },
  {
    id: "iphone-16",
    label: "iPhone 16",
    width: 393,
    height: 852,
    cutout: "island",
    finish: "graphite",
    kind: "phone",
    topInset: 59,
    bottomInset: 34,
    camera: "none",
  },
  {
    id: "iphone-16-pro",
    label: "iPhone 16 Pro",
    width: 402,
    height: 874,
    cutout: "island",
    finish: "titanium",
    kind: "phone",
    topInset: 59,
    bottomInset: 34,
    camera: "none",
  },
  {
    id: "fold",
    label: "Fold",
    width: FOLD_OPEN_WIDTH,
    height: FOLD_HEIGHT,
    cutout: "none",
    finish: "black",
    kind: "fold",
    topInset: 0,
    bottomInset: 0,
    camera: "none",
  },
  {
    id: "ipad-pro-13",
    label: "iPad Pro 13\"",
    width: 1032,
    height: 1376,
    cutout: "none",
    finish: "graphite",
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
  },
  {
    id: "ipad-pro-11",
    label: "iPad Pro 11\"",
    width: 834,
    height: 1210,
    cutout: "none",
    finish: "silver",
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
  },
  {
    id: "ipad-air-13",
    label: "iPad Air 13\"",
    width: 1024,
    height: 1366,
    cutout: "none",
    finish: "starlight",
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
  },
  {
    id: "ipad-air-11",
    label: "iPad Air 11\"",
    width: 820,
    height: 1180,
    cutout: "none",
    finish: "silver",
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
  },
  {
    id: "ipad",
    label: "iPad",
    width: 820,
    height: 1180,
    cutout: "none",
    finish: "midnight",
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
  },
  {
    id: "ipad-mini",
    label: "iPad mini",
    width: 744,
    height: 1133,
    cutout: "none",
    finish: "starlight",
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "top",
  },
];

export const BACKGROUNDS = [
  { id: "blanco", label: "Blanco", color: "#ffffff" },
  { id: "niebla", label: "Niebla", color: "#e8e8e8" },
  { id: "negro", label: "Negro", color: "#111111" },
  { id: "gradiente", label: "Gradiente", color: null },
] as const;

export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];

export type ScreenStatus = "empty" | "loading" | "error" | "ready";

export type ScreenState = {
  status: ScreenStatus;
  message: string;
};

export type ViewportProfile = {
  width: number;
  height: number;
  userAgent: string;
  platform: string;
  mobile: boolean;
  dsf: number;
  kind: DeviceKind;
};

export function isDeviceId(value: string): value is DeviceId {
  return DEVICES.some((device) => device.id === value);
}

export function deviceById(id: DeviceId): DeviceSpec {
  const device = DEVICES.find((item) => item.id === id);
  if (!device) return DEVICES[0];
  return device;
}

export function isFoldOpen(apertura: number) {
  return apertura > FOLD_OPEN_AT;
}

export function contentSize(device: DeviceSpec) {
  return {
    width: device.width,
    height: Math.max(1, device.height - device.topInset - device.bottomInset),
  };
}

export function liveViewport(device: DeviceSpec, apertura: number) {
  if (device.id === "fold") {
    return {
      width: isFoldOpen(apertura) ? FOLD_OPEN_WIDTH : FOLD_PANEL_WIDTH,
      height: FOLD_HEIGHT,
    };
  }
  return contentSize(device);
}

function dsfFor(width: number, height: number) {
  return width * height > 600_000 ? 1 : 2;
}

export function profileForViewport(width: number, height: number): ViewportProfile | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;

  if (
    (width === FOLD_PANEL_WIDTH || width === FOLD_OPEN_WIDTH) &&
    height === FOLD_HEIGHT
  ) {
    return {
      width,
      height,
      userAgent: FOLD_UA,
      platform: "Linux armv8l",
      mobile: true,
      dsf: dsfFor(width, height),
      kind: "fold",
    };
  }

  for (const device of DEVICES) {
    if (device.id === "fold") continue;
    const content = contentSize(device);
    if (content.width !== width || content.height !== height) continue;
    const tablet = device.kind === "tablet";
    return {
      width,
      height,
      userAgent: tablet ? IPAD_UA : IPHONE_UA,
      platform: tablet ? "iPad" : "iPhone",
      mobile: !tablet,
      dsf: dsfFor(width, height),
      kind: device.kind,
    };
  }

  return null;
}
