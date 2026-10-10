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
  | "ipad-mini"
  | "macbook-air-13"
  | "macbook-air-15"
  | "macbook-pro-14"
  | "macbook-pro-16"
  | "imac-24";

export type Cutout = "notch" | "island" | "none";

export type DeviceKind = "phone" | "tablet" | "duo" | "laptop" | "desktop";

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
  | "ipad-mini"
  | "none";

export type ButtonLayout = "switch" | "action" | "duo" | "ipad" | "mini" | "none";

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

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

/** Landscape status bar, in CSS px. Phones keep the island band on the side, so this is a normal bar. */
export const LANDSCAPE_STATUS = 32;

export const DEVICES: readonly DeviceSpec[] = [
  {
    id: "iphone-14",
    label: "iPhone 14",
    width: 390,
    height: 844,
    cutout: "notch",
    finishes: [
      { id: "medianoche", label: "Midnight", color: "#1c1d21", ...aluminum },
      { id: "purpura", label: "Purple", color: "#5c4e72", ...aluminum },
      { id: "blanco-estelar", label: "Starlight", color: "#f1ece3", ...aluminum },
      { id: "product-red", label: "(PRODUCT)RED", color: "#c4122f", ...aluminum },
      { id: "azul", label: "Blue", color: "#2f6d94", ...aluminum },
      { id: "amarillo", label: "Yellow", color: "#f0d56a", ...aluminum },
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
      { id: "negro", label: "Black", color: "#2a2a2e", ...glassBack },
      { id: "azul", label: "Blue", color: "#c5d4e4", ...glassBack },
      { id: "verde", label: "Green", color: "#d4e3c6", ...glassBack },
      { id: "amarillo", label: "Yellow", color: "#f3e4bc", ...glassBack },
      { id: "rosa", label: "Pink", color: "#f3d2d6", ...glassBack },
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
      { id: "negro", label: "Black", color: "#3a3a3c", ...glassBack },
      { id: "blanco", label: "White", color: "#f4f4f6", ...glassBack },
      { id: "rosa", label: "Pink", color: "#f2b7c4", ...glassBack },
      { id: "verde-azulado", label: "Teal", color: "#62b8ae", ...glassBack },
      { id: "ultramarino", label: "Ultramarine", color: "#3a4fd0", ...glassBack },
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
      { id: "titanio-negro", label: "Black titanium", color: "#3a3a3c", ...titanium },
      { id: "titanio-blanco", label: "White titanium", color: "#f1f0ec", ...titanium },
      { id: "titanio-natural", label: "Natural titanium", color: "#c4bbae", ...titanium },
      { id: "titanio-desierto", label: "Desert titanium", color: "#c4a27a", ...titanium },
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
      { id: "cielo-nocturno", label: "Night sky", color: "#1a2433", metalness: 0.72, roughness: 0.34 },
      { id: "blanco-estelar", label: "Star white", color: "#f3efe4", metalness: 0.46, roughness: 0.4 },
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
      { id: "plata", label: "Silver", color: "#e4e5e8", ...aluminum },
      { id: "negro-espacial", label: "Space black", color: "#1c1c1e", ...aluminum },
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
      { id: "plata", label: "Silver", color: "#e4e5e8", ...aluminum },
      { id: "negro-espacial", label: "Space black", color: "#1c1c1e", ...aluminum },
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
      { id: "azul", label: "Blue", color: "#6e93b8", ...aluminum },
      { id: "purpura", label: "Purple", color: "#a394c2", ...aluminum },
      { id: "blanco-estelar", label: "Starlight", color: "#f1ece3", ...aluminum },
      { id: "gris-espacial", label: "Space gray", color: "#7a7c80", ...aluminum },
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
      { id: "azul", label: "Blue", color: "#6e93b8", ...aluminum },
      { id: "purpura", label: "Purple", color: "#a394c2", ...aluminum },
      { id: "blanco-estelar", label: "Starlight", color: "#f1ece3", ...aluminum },
      { id: "gris-espacial", label: "Space gray", color: "#7a7c80", ...aluminum },
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
      { id: "plata", label: "Silver", color: "#e6e7ea", ...aluminum },
      { id: "azul", label: "Blue", color: "#2f78c4", ...aluminum },
      { id: "rosa", label: "Pink", color: "#f0a8b8", ...aluminum },
      { id: "amarillo", label: "Yellow", color: "#f2d15a", ...aluminum },
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
      { id: "azul", label: "Blue", color: "#7f9bb5", ...aluminum },
      { id: "purpura", label: "Purple", color: "#9a8cb4", ...aluminum },
      { id: "blanco-estelar", label: "Starlight", color: "#f0ebe2", ...aluminum },
      { id: "gris-espacial", label: "Space gray", color: "#6e7074", ...aluminum },
    ],
    kind: "tablet",
    topInset: 24,
    bottomInset: 20,
    camera: "top",
    rear: "ipad-mini",
    buttons: "mini",
  },
  {
    id: "macbook-air-13",
    label: "MacBook Air 13\"",
    width: 1280,
    height: 832,
    cutout: "notch",
    finishes: [
      { id: "azul-cielo", label: "Sky blue", color: "#9ec4d6", ...aluminum },
      { id: "plata", label: "Silver", color: "#e3e4e6", ...aluminum },
      { id: "blanco-estelar", label: "Starlight", color: "#f0ebe4", ...aluminum },
      { id: "medianoche", label: "Midnight", color: "#2c2e33", metalness: 0.55, roughness: 0.34 },
    ],
    kind: "laptop",
    topInset: 37,
    bottomInset: 0,
    camera: "top",
    rear: "none",
    buttons: "none",
  },
  {
    id: "macbook-air-15",
    label: "MacBook Air 15\"",
    width: 1440,
    height: 932,
    cutout: "notch",
    finishes: [
      { id: "azul-cielo", label: "Sky blue", color: "#9ec4d6", ...aluminum },
      { id: "plata", label: "Silver", color: "#e3e4e6", ...aluminum },
      { id: "blanco-estelar", label: "Starlight", color: "#f0ebe4", ...aluminum },
      { id: "medianoche", label: "Midnight", color: "#2c2e33", metalness: 0.55, roughness: 0.34 },
    ],
    kind: "laptop",
    topInset: 37,
    bottomInset: 0,
    camera: "top",
    rear: "none",
    buttons: "none",
  },
  {
    id: "macbook-pro-14",
    label: "MacBook Pro 14\"",
    width: 1512,
    height: 982,
    cutout: "notch",
    finishes: [
      { id: "negro-espacial", label: "Space black", color: "#2a2b2e", metalness: 0.58, roughness: 0.32 },
      { id: "plata", label: "Silver", color: "#e4e5e8", ...aluminum },
    ],
    kind: "laptop",
    topInset: 37,
    bottomInset: 0,
    camera: "top",
    rear: "none",
    buttons: "none",
  },
  {
    id: "macbook-pro-16",
    label: "MacBook Pro 16\"",
    width: 1728,
    height: 1117,
    cutout: "notch",
    finishes: [
      { id: "negro-espacial", label: "Space black", color: "#2a2b2e", metalness: 0.58, roughness: 0.32 },
      { id: "plata", label: "Silver", color: "#e4e5e8", ...aluminum },
    ],
    kind: "laptop",
    topInset: 37,
    bottomInset: 0,
    camera: "top",
    rear: "none",
    buttons: "none",
  },
  {
    id: "imac-24",
    label: "iMac 24\"",
    width: 2240,
    height: 1260,
    cutout: "none",
    finishes: [
      { id: "azul", label: "Blue", color: "#5b92c9", ...aluminum },
      { id: "verde", label: "Green", color: "#8eae7a", ...aluminum },
      { id: "rosa", label: "Pink", color: "#f0b3c2", ...aluminum },
      { id: "plata", label: "Silver", color: "#e3e4e6", ...aluminum },
      { id: "amarillo", label: "Yellow", color: "#f3d56a", ...aluminum },
      { id: "naranja", label: "Orange", color: "#f0a05a", ...aluminum },
      { id: "purpura", label: "Purple", color: "#a98bc4", ...aluminum },
    ],
    kind: "desktop",
    topInset: 24,
    bottomInset: 0,
    camera: "top",
    rear: "none",
    buttons: "none",
  },
];

export const BACKGROUNDS = [
  { id: "blanco", label: "White", color: "#ffffff", css: "#ffffff" },
  { id: "niebla", label: "Mist", color: "#e8e8e8", css: "#e8e8e8" },
  { id: "negro", label: "Black", color: "#111111", css: "#111111" },
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

export function isComputer(device: DeviceSpec) {
  return device.kind === "laptop" || device.kind === "desktop";
}

/** Phones and Duo keep the cutout band on the side. iPad's top inset was only the status bar. */
export function landscapeSideTop(device: DeviceSpec) {
  return device.cutout === "none" ? 0 : device.topInset;
}

export function landscapeStatusPx(device: DeviceSpec) {
  if (device.kind === "tablet") return device.topInset;
  if (device.kind === "phone" || device.kind === "duo") return LANDSCAPE_STATUS;
  return 0;
}

export type Orientation = "portrait" | "landscape";

export function liveViewport(
  device: DeviceSpec,
  apertura: number,
  orientation: Orientation = "portrait",
) {
  if (isComputer(device)) return contentSize(device);

  const glass =
    device.id === "iphone-duo"
      ? duoScreen(apertura)
      : { width: device.width, height: device.height };

  if (orientation !== "landscape") {
    return {
      width: glass.width,
      height: Math.max(1, glass.height - device.topInset - device.bottomInset),
    };
  }

  return {
    width: Math.max(1, glass.height - landscapeSideTop(device) - device.bottomInset),
    height: Math.max(1, glass.width - landscapeStatusPx(device)),
  };
}

function dsfFor(width: number, height: number) {
  return width * height > 600_000 ? 1 : 2;
}

function matchesViewport(device: DeviceSpec, width: number, height: number) {
  if (isComputer(device)) {
    const size = contentSize(device);
    return width === size.width && height === size.height;
  }
  const apertures = device.id === "iphone-duo" ? [0, 1] : [0];
  for (const apertura of apertures) {
    for (const orientation of ["portrait", "landscape"] as const) {
      const size = liveViewport(device, apertura, orientation);
      if (size.width === width && size.height === height) return true;
    }
  }
  return false;
}

export function profileForViewport(width: number, height: number): ViewportProfile | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;

  for (const device of DEVICES) {
    if (!matchesViewport(device, width, height)) continue;
    if (isComputer(device)) {
      return {
        width,
        height,
        userAgent: MAC_UA,
        platform: "MacIntel",
        mobile: false,
        dsf: dsfFor(width, height),
        kind: device.kind,
      };
    }
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
