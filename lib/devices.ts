export type DeviceId =
  | "iphone-14"
  | "iphone-15"
  | "iphone-16"
  | "iphone-16-pro"
  | "fold";

export type Cutout = "notch" | "island" | "none";

export type Finish = "midnight" | "black" | "graphite" | "titanium";

export type DeviceSpec = {
  id: DeviceId;
  label: string;
  width: number;
  height: number;
  cutout: Cutout;
  finish: Finish;
};

export const DEVICES: readonly DeviceSpec[] = [
  {
    id: "iphone-14",
    label: "iPhone 14",
    width: 390,
    height: 844,
    cutout: "notch",
    finish: "midnight",
  },
  {
    id: "iphone-15",
    label: "iPhone 15",
    width: 393,
    height: 852,
    cutout: "island",
    finish: "black",
  },
  {
    id: "iphone-16",
    label: "iPhone 16",
    width: 393,
    height: 852,
    cutout: "island",
    finish: "graphite",
  },
  {
    id: "iphone-16-pro",
    label: "iPhone 16 Pro",
    width: 402,
    height: 874,
    cutout: "island",
    finish: "titanium",
  },
  {
    id: "fold",
    label: "Fold",
    width: 768,
    height: 874,
    cutout: "none",
    finish: "black",
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
  image: HTMLImageElement | null;
};

export function isDeviceId(value: string): value is DeviceId {
  return DEVICES.some((device) => device.id === value);
}

export function deviceById(id: DeviceId): DeviceSpec {
  const device = DEVICES.find((item) => item.id === id);
  if (!device) return DEVICES[0];
  return device;
}

export function isAllowedViewport(width: number, height: number): boolean {
  return DEVICES.some(
    (device) => device.width === width && device.height === height,
  );
}
