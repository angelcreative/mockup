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
  {
    id: "vibrant-vista",
    label: "Vibrant vista",
    color: null,
    css: "radial-gradient(90% 70% at 8% 58%, #ff2f86 0%, rgba(255,47,134,0) 58%), radial-gradient(80% 70% at 96% 42%, #ffb15c 0%, rgba(255,177,92,0) 55%), radial-gradient(70% 60% at 92% 6%, #d7f3ff 0%, rgba(215,243,255,0) 52%), radial-gradient(80% 60% at 38% 108%, #2a1570 0%, rgba(42,21,112,0) 62%), linear-gradient(128deg, #1480ff 0%, #3a4de8 30%, #ff4d6a 62%, #ffb15a 100%)",
  },
  {
    id: "green-glory",
    label: "Green glory",
    color: null,
    css: "radial-gradient(80% 70% at 0% 28%, #b6ff3c 0%, rgba(182,255,60,0) 46%), radial-gradient(90% 70% at 12% 58%, #00e85a 0%, rgba(0,232,90,0) 50%), radial-gradient(70% 60% at 100% 8%, #063a58 0%, rgba(6,58,88,0) 55%), radial-gradient(80% 70% at 78% 110%, #01080c 0%, rgba(1,8,12,0) 58%), radial-gradient(40% 50% at 100% 52%, #19d8ff 0%, rgba(25,216,255,0) 60%), linear-gradient(150deg, #00f0a0 0%, #00a878 42%, #02141c 100%)",
  },
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
