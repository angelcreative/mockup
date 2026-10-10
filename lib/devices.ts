import { WALLPAPER_BACKGROUNDS } from "./wallpapers";

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

export type DeviceKind = "phone" | "tablet" | "duo";

export type CameraEdge = "none" | "top" | "right";

/** Rear module from that model's current Apple layout. Not one shared bump. */
export type RearLayout =
  | "iphone-14"
  | "iphone-15"
  | "iphone-16"
  | "iphone-16-pro"
  | "iphone-duo"
  | "ipad-pro"
  | "ipad-air"
  | "ipad"
  | "ipad-mini";

export type ButtonLayout = "switch" | "action" | "duo" | "ipad" | "mini";

export type FinishSpec = {
  id: string;
  label: string;
  color: string;
  metalness: number;
  roughness: number;
};

export type DeviceSpec = {
  id: DeviceId;
  label: string;
  width: number;
  height: number;
  cutout: Cutout;
  finishes: readonly FinishSpec[];
  kind: DeviceKind;
  topInset: number;
  bottomInset: number;
  camera: CameraEdge;
  rear: RearLayout;
  buttons: ButtonLayout;
};

/** CSS points. Apple lists 1.398×2.034 px at 460 ppi and 1.878×2.670 px at 430 ppi. */
export const DUO_OUTER_WIDTH = 466;
export const DUO_OUTER_HEIGHT = 678;
export const DUO_INNER_WIDTH = 890;
export const DUO_INNER_HEIGHT = 626;
export const DUO_TOP_INSET = 59;
export const DUO_BOTTOM_INSET = 34;
/** Past this, the live page is the inner display. Below it, the cover stays on. */
export const DUO_OPEN_AT = 0.48;
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

const aluminum = { metalness: 0.5, roughness: 0.38 };
const glassBack = { metalness: 0.32, roughness: 0.46 };
const titanium = { metalness: 0.74, roughness: 0.32 };

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
    finishes: [
      { id: "medianoche", label: "Medianoche", color: "#1c1d21", ...aluminum },
      { id: "purpura", label: "Púrpura", color: "#5c4e72", ...aluminum },
      { id: "blanco-estelar", label: "Blanco estelar", color: "#f1ece3", ...aluminum },
      { id: "product-red", label: "(PRODUCT)RED", color: "#c4122f", ...aluminum },
      { id: "azul", label: "Azul", color: "#2f6d94", ...aluminum },
      { id: "amarillo", label: "Amarillo", color: "#f0d56a", ...aluminum },
    ],
    kind: "phone",
    topInset: 47,
    bottomInset: 34,
    camera: "none",
    rear: "iphone-14",
    buttons: "switch",
  },
  {
    id: "iphone-15",
    label: "iPhone 15",
    width: 393,
    height: 852,
    cutout: "island",
    finishes: [
      { id: "negro", label: "Negro", color: "#2a2a2e", ...glassBack },
      { id: "azul", label: "Azul", color: "#c5d4e4", ...glassBack },
      { id: "verde", label: "Verde", color: "#d4e3c6", ...glassBack },
      { id: "amarillo", label: "Amarillo", color: "#f3e4bc", ...glassBack },
      { id: "rosa", label: "Rosa", color: "#f3d2d6", ...glassBack },
    ],
    kind: "phone",
    topInset: 59,
    bottomInset: 34,
    camera: "none",
    rear: "iphone-15",
    buttons: "switch",
  },
  {
    id: "iphone-16",
    label: "iPhone 16",
    width: 393,
    height: 852,
    cutout: "island",
    finishes: [
      { id: "negro", label: "Negro", color: "#3a3a3c", ...glassBack },
      { id: "blanco", label: "Blanco", color: "#f4f4f6", ...glassBack },
      { id: "rosa", label: "Rosa", color: "#f2b7c4", ...glassBack },
      { id: "verde-azulado", label: "Verde azulado", color: "#62b8ae", ...glassBack },
      { id: "ultramarino", label: "Ultramarino", color: "#3a4fd0", ...glassBack },
    ],
    kind: "phone",
    topInset: 59,
    bottomInset: 34,
    camera: "none",
    rear: "iphone-16",
    buttons: "action",
  },
  {
    id: "iphone-16-pro",
    label: "iPhone 16 Pro",
    width: 402,
    height: 874,
    cutout: "island",
    finishes: [
      { id: "titanio-negro", label: "Titanio negro", color: "#3a3a3c", ...titanium },
      { id: "titanio-blanco", label: "Titanio blanco", color: "#f1f0ec", ...titanium },
      { id: "titanio-natural", label: "Titanio natural", color: "#c4bbae", ...titanium },
      { id: "titanio-desierto", label: "Titanio del desierto", color: "#c4a27a", ...titanium },
    ],
    kind: "phone",
    topInset: 59,
    bottomInset: 34,
    camera: "none",
    rear: "iphone-16-pro",
    buttons: "action",
  },
  {
    id: "iphone-duo",
    label: "iPhone Duo",
    width: DUO_OUTER_WIDTH,
    height: DUO_OUTER_HEIGHT,
    cutout: "island",
    finishes: [
      { id: "cielo-nocturno", label: "Cielo nocturno", color: "#1a2433", metalness: 0.72, roughness: 0.34 },
      { id: "blanco-estelar", label: "Blanco estelar", color: "#f3efe4", metalness: 0.46, roughness: 0.4 },
    ],
    kind: "duo",
    topInset: DUO_TOP_INSET,
    bottomInset: DUO_BOTTOM_INSET,
    camera: "none",
    rear: "iphone-duo",
    buttons: "duo",
  },
  {
    id: "ipad-pro-13",
    label: "iPad Pro 13\"",
    width: 1032,
    height: 1376,
    cutout: "none",
    finishes: [
      { id: "plata", label: "Plata", color: "#e4e5e8", ...aluminum },
      { id: "negro-espacial", label: "Negro espacial", color: "#1c1c1e", ...aluminum },
    ],
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
    rear: "ipad-pro",
    buttons: "ipad",
  },
  {
    id: "ipad-pro-11",
    label: "iPad Pro 11\"",
    width: 834,
    height: 1210,
    cutout: "none",
    finishes: [
      { id: "plata", label: "Plata", color: "#e4e5e8", ...aluminum },
      { id: "negro-espacial", label: "Negro espacial", color: "#1c1c1e", ...aluminum },
    ],
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
    rear: "ipad-pro",
    buttons: "ipad",
  },
  {
    id: "ipad-air-13",
    label: "iPad Air 13\"",
    width: 1024,
    height: 1366,
    cutout: "none",
    finishes: [
      { id: "azul", label: "Azul", color: "#6e93b8", ...aluminum },
      { id: "purpura", label: "Púrpura", color: "#a394c2", ...aluminum },
      { id: "blanco-estelar", label: "Blanco estelar", color: "#f1ece3", ...aluminum },
      { id: "gris-espacial", label: "Gris espacial", color: "#7a7c80", ...aluminum },
    ],
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
    rear: "ipad-air",
    buttons: "ipad",
  },
  {
    id: "ipad-air-11",
    label: "iPad Air 11\"",
    width: 820,
    height: 1180,
    cutout: "none",
    finishes: [
      { id: "azul", label: "Azul", color: "#6e93b8", ...aluminum },
      { id: "purpura", label: "Púrpura", color: "#a394c2", ...aluminum },
      { id: "blanco-estelar", label: "Blanco estelar", color: "#f1ece3", ...aluminum },
      { id: "gris-espacial", label: "Gris espacial", color: "#7a7c80", ...aluminum },
    ],
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
    rear: "ipad-air",
    buttons: "ipad",
  },
  {
    id: "ipad",
    label: "iPad",
    width: 820,
    height: 1180,
    cutout: "none",
    finishes: [
      { id: "plata", label: "Plata", color: "#e6e7ea", ...aluminum },
      { id: "azul", label: "Azul", color: "#2f78c4", ...aluminum },
      { id: "rosa", label: "Rosa", color: "#f0a8b8", ...aluminum },
      { id: "amarillo", label: "Amarillo", color: "#f2d15a", ...aluminum },
    ],
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "right",
    rear: "ipad",
    buttons: "ipad",
  },
  {
    id: "ipad-mini",
    label: "iPad mini",
    width: 744,
    height: 1133,
    cutout: "none",
    finishes: [
      { id: "azul", label: "Azul", color: "#7f9bb5", ...aluminum },
      { id: "purpura", label: "Púrpura", color: "#9a8cb4", ...aluminum },
      { id: "blanco-estelar", label: "Blanco estelar", color: "#f0ebe2", ...aluminum },
      { id: "gris-espacial", label: "Gris espacial", color: "#6e7074", ...aluminum },
    ],
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "top",
    rear: "ipad-mini",
    buttons: "mini",
  },
];

export const BACKGROUNDS = [
  { id: "blanco", label: "Blanco", color: "#ffffff", css: "#ffffff" },
  { id: "niebla", label: "Niebla", color: "#e8e8e8", css: "#e8e8e8" },
  { id: "negro", label: "Negro", color: "#111111", css: "#111111" },
  ...WALLPAPER_BACKGROUNDS,
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

export type Orientation = "portrait" | "landscape";

export function liveViewport(
  device: DeviceSpec,
  apertura: number,
  orientation: Orientation = "portrait",
) {
  const portrait =
    device.id === "iphone-duo"
      ? {
          width: duoScreen(apertura).width,
          height: Math.max(1, duoScreen(apertura).height - device.topInset - device.bottomInset),
        }
      : contentSize(device);
  if (orientation === "landscape") {
    return { width: portrait.height, height: portrait.width };
  }
  return portrait;
}

function dsfFor(width: number, height: number) {
  return width * height > 600_000 ? 1 : 2;
}

function sameViewport(width: number, height: number, portraitW: number, portraitH: number) {
  return (
    (width === portraitW && height === portraitH) || (width === portraitH && height === portraitW)
  );
}

export function profileForViewport(width: number, height: number): ViewportProfile | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;

  for (const device of DEVICES) {
    if (device.id === "iphone-duo") {
      const closed = liveViewport(device, 0);
      const open = liveViewport(device, 1);
      const match =
        sameViewport(width, height, closed.width, closed.height) ||
        sameViewport(width, height, open.width, open.height);
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
    if (!sameViewport(width, height, content.width, content.height)) continue;
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
