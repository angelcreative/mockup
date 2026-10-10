export type DeviceId =
  | "iphone-14"
  | "iphone-15"
  | "iphone-16"
  | "iphone-16-pro"
  | "iphone-duo"
  | "ipad-pro-13"
  | "ipad-pro-11"
  | "ipad-air-13"
  | "ipad-air-11"
  | "ipad"
  | "ipad-mini";

export type Cutout = "notch" | "island" | "none";

export type Finish = "midnight" | "black" | "graphite" | "titanium" | "silver" | "starlight" | "cielo";

export type DeviceKind = "phone" | "tablet" | "duo";

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

/** CSS points. Apple lists 1.398×2.034 px at 460 ppi and 1.878×2.670 px at 430 ppi. */
export const DUO_OUTER_WIDTH = 466;
export const DUO_OUTER_HEIGHT = 678;
export const DUO_INNER_WIDTH = 890;
export const DUO_INNER_HEIGHT = 626;
export const DUO_TOP_INSET = 59;
export const DUO_BOTTOM_INSET = 34;
export const DUO_OPEN_AT = 0.02;
/** Centimetres from apple.com/es/iphone-duo/specs, used to proportion the mesh. */
export const DUO_CM = 0.325;
export const DUO_BODY = {
  closedWidth: 8.41,
  openWidth: 16.46,
  height: 11.78,
  closedDepth: 1.13,
  openDepth: 0.52,
} as const;

export const ISLAND_POINTS = { width: 126, height: 37, top: 11 };
export const NOTCH_POINTS = { width: 162, height: 33 };

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

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
    id: "iphone-duo",
    label: "iPhone Duo",
    width: DUO_OUTER_WIDTH,
    height: DUO_OUTER_HEIGHT,
    cutout: "island",
    finish: "cielo",
    kind: "duo",
    topInset: DUO_TOP_INSET,
    bottomInset: DUO_BOTTOM_INSET,
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

export function isDuoOpen(apertura: number) {
  return apertura > DUO_OPEN_AT;
}

export function duoScreen(apertura: number) {
  if (isDuoOpen(apertura)) {
    return { width: DUO_INNER_WIDTH, height: DUO_INNER_HEIGHT, split: true as const };
  }
  return { width: DUO_OUTER_WIDTH, height: DUO_OUTER_HEIGHT, split: false as const };
}

export function contentSize(device: DeviceSpec) {
  return {
    width: device.width,
    height: Math.max(1, device.height - device.topInset - device.bottomInset),
  };
}

export function liveViewport(device: DeviceSpec, apertura: number) {
  if (device.id === "iphone-duo") {
    const screen = duoScreen(apertura);
    return {
      width: screen.width,
      height: Math.max(1, screen.height - device.topInset - device.bottomInset),
    };
  }
  return contentSize(device);
}

function dsfFor(width: number, height: number) {
  return width * height > 600_000 ? 1 : 2;
}

export function profileForViewport(width: number, height: number): ViewportProfile | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;

  for (const device of DEVICES) {
    if (device.id === "iphone-duo") {
      const closed = liveViewport(device, 0);
      const open = liveViewport(device, 1);
      const match =
        (width === closed.width && height === closed.height) ||
        (width === open.width && height === open.height);
      if (!match) continue;
      return {
        width,
        height,
        userAgent: IPHONE_UA,
        platform: "iPhone",
        mobile: true,
        dsf: dsfFor(width, height),
        kind: "duo",
      };
    }
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
