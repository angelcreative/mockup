"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown,
  Clapperboard,
  Download,
  EyeOff,
  Image as ImageIcon,
  Link2,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
  SunMedium,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { CinematicId, CinematicShot, ScreenInput, ShotMode } from "@/components/scene";
import {
  BACKGROUNDS,
  DESIGN_ROWS,
  DEVICES,
  designFamily,
  deviceById,
  familyGlassSize,
  isDeviceId,
  liveViewport,
  type BackgroundId,
  type DesignFamily,
  type DeviceId,
  type Orientation,
  type ScreenState,
} from "@/lib/devices";
import type { LiveServerMessage } from "@/lib/live-protocol";
import { normalizeHttpUrl } from "@/lib/url";

const Scene = dynamic(() => import("@/components/scene"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-white" />,
});

const EMPTY_SCREEN: ScreenState = {
  status: "empty",
  message: "Paste a URL to open the site",
};

const EMPTY_DESIGNS: Record<DesignFamily, string | null> = {
  mobile: null,
  tablet: null,
  laptop: null,
  desktop: null,
};

function isDesignFile(file: File) {
  if (file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp") return true;
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

function bitmapFitsViewport(bitmap: ImageBitmap, width: number, height: number) {
  const scales = width * height > 600_000 ? [1] : [1, 2];
  return scales.some(
    (scale) => Math.abs(bitmap.width - width * scale) <= 4 && Math.abs(bitmap.height - height * scale) <= 4,
  );
}

const DEFAULT_URL = "https://www.apple.com";

const QUIET = "duration-200 ease-out motion-reduce:transition-none";
const MOTION = "duration-[240ms] ease-out motion-reduce:transition-none";
const SHELL_KEY = "mockup-shell";

type ShellMode = "icon" | "rail" | "expanded";
type GroupId = "page" | "device" | "finish" | "background" | "scene" | "cinematics" | "export";

const GROUPS: { id: GroupId; label: string; icon: LucideIcon }[] = [
  { id: "page", label: "Add page url", icon: Link2 },
  { id: "device", label: "Device", icon: Smartphone },
  { id: "finish", label: "Finish", icon: Palette },
  { id: "background", label: "Background", icon: ImageIcon },
  { id: "scene", label: "Scene", icon: SunMedium },
  { id: "cinematics", label: "Cinematics", icon: Clapperboard },
  { id: "export", label: "Export", icon: Download },
];

function readShellMode(): ShellMode {
  try {
    const stored = sessionStorage.getItem(SHELL_KEY);
    if (stored === "icon" || stored === "rail" || stored === "expanded") return stored;
  } catch {
    /* session storage can be blocked */
  }
  return "expanded";
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-neutral-500">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${QUIET} ${
          checked ? "bg-neutral-950" : "bg-neutral-200"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform ${QUIET} ${
            checked ? "translate-x-3.5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function ColorSwatch({
  selected,
  label,
  background,
  size = "md",
  onClick,
}: {
  selected: boolean;
  label: string;
  background: string;
  size?: "sm" | "md";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={label}
      onClick={onClick}
      className={`relative shrink-0 rounded-full outline-none ${size === "sm" ? "size-5" : "size-6"}`}
    >
      <span
        className={`absolute inset-0 rounded-full border border-black/15 transition-transform ${QUIET} ${
          selected ? "scale-[1.04]" : "scale-100"
        }`}
        style={{ background }}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute -inset-1 rounded-full border-2 border-neutral-950 transition-[opacity,scale] ${QUIET} ${
          selected ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      />
    </button>
  );
}

const SOLID_BACKGROUNDS = BACKGROUNDS.filter(
  (item) => item.id === "blanco" || item.id === "niebla" || item.id === "negro",
);
const GRADIENT_GROUPS = [
  { label: "Kiln", items: BACKGROUNDS.filter((item) => item.id.startsWith("vibrant-vista-")) },
  { label: "Laurel", items: BACKGROUNDS.filter((item) => item.id.startsWith("green-glory-")) },
  { label: "Velvet", items: BACKGROUNDS.filter((item) => item.id.startsWith("deep-dusk-")) },
];
const CINEMATICS: { id: CinematicId; label: string }[] = [
  { id: "pull-back", label: "Pull back" },
  { id: "push-in", label: "Push in" },
  { id: "orbit", label: "Orbit" },
  { id: "reveal", label: "Reveal" },
  { id: "settle", label: "Settle" },
];

function socketUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/live`;
}

export function Studio() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [deviceId, setDeviceId] = useState<DeviceId>("iphone-14");
  const [background, setBackground] = useState<BackgroundId>("blanco");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [finishId, setFinishId] = useState(DEVICES[0].finishes[0].id);
  const [light, setLight] = useState(1);
  const [autoRotate, setAutoRotate] = useState(false);
  const [logoLight, setLogoLight] = useState(false);
  const [cinematic, setCinematic] = useState<CinematicShot | null>(null);
  const cinematicToken = useRef(0);
  const [apertura, setApertura] = useState(0);
  const [hingeOpen, setHingeOpen] = useState(false);
  const aperturaRef = useRef(0);
  const foldRef = useRef(0);
  const deviceIdRef = useRef<DeviceId>("iphone-14");
  aperturaRef.current = apertura;
  deviceIdRef.current = deviceId;
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [screen, setScreen] = useState<ScreenState>({
    status: "loading",
    message: "Opening…",
  });
  const [frame, setFrame] = useState<ImageBitmap | null>(null);
  const exportRef = useRef<((mode: ShotMode) => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const openedRef = useRef("");
  const sentSize = useRef("");
  const [shellMode, setShellMode] = useState<ShellMode | null>(null);
  const [stageWidth, setStageWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  const [flyout, setFlyout] = useState<GroupId | null>(null);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const [hint, setHint] = useState<{ label: string; top: number } | null>(null);
  const [designs, setDesigns] = useState(EMPTY_DESIGNS);
  const [screenSource, setScreenSource] = useState<"live" | "design">("live");
  const [designImage, setDesignImage] = useState<HTMLImageElement | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [designFailed, setDesignFailed] = useState<string | null>(null);
  const designInputs = useRef<Partial<Record<DesignFamily, HTMLInputElement | null>>>({});
  const shellRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const groupRefs = useRef<Partial<Record<GroupId, HTMLButtonElement>>>({});
  const device = deviceById(deviceId);
  const finish = device.finishes.find((item) => item.id === finishId) ?? device.finishes[0];
  const viewport = liveViewport(device, apertura, orientation);
  const viewportKey = `${viewport.width}x${viewport.height}`;
  const [shownViewport, setShownViewport] = useState(viewportKey);
  const awaitingViewport = useRef<{ width: number; height: number } | null>(null);
  const opening = screen.status === "loading" && screen.message === "Opening…";
  if (shownViewport !== viewportKey) {
    setShownViewport(viewportKey);
    awaitingViewport.current = { width: viewport.width, height: viewport.height };
    rememberFrame(null);
    setScreen((current) => {
      if (current.status === "empty" || current.status === "error") return current;
      if (current.message === "Opening…") return { status: "loading", message: "Opening…" };
      return { status: "loading", message: "" };
    });
  }
  const handheld = device.kind === "phone" || device.kind === "tablet" || device.kind === "duo";

  function setHinge(open: boolean) {
    setHingeOpen(open);
    const target = open ? 1 : 0;
    cancelAnimationFrame(foldRef.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      aperturaRef.current = target;
      setApertura(target);
      return;
    }
    const from = aperturaRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const current = deviceById(deviceIdRef.current);
      if (current.id !== "iphone-duo" && current.kind !== "laptop") return;
      const t = Math.min(1, (now - start) / 500);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (target - from) * eased;
      aperturaRef.current = next;
      setApertura(next);
      if (t < 1) foldRef.current = requestAnimationFrame(tick);
    };
    foldRef.current = requestAnimationFrame(tick);
  }

  function rememberFrame(next: ImageBitmap | null) {
    setFrame((current) => {
      if (current && current !== next) {
        const stale = current;
        requestAnimationFrame(() => requestAnimationFrame(() => stale.close()));
      }
      return next;
    });
  }

  function closeSocket() {
    const socket = socketRef.current;
    socketRef.current = null;
    openedRef.current = "";
    sentSize.current = "";
    socket?.close();
  }

  useEffect(() => () => cancelAnimationFrame(foldRef.current), []);

  useEffect(() => {
    const syncStream = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: document.hidden ? "pause" : "resume" }));
    };
    document.addEventListener("visibilitychange", syncStream);
    return () => document.removeEventListener("visibilitychange", syncStream);
  }, []);

  useEffect(() => {
    const ping = window.setInterval(() => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
      }
    }, 45_000);
    return () => {
      window.clearInterval(ping);
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const first = deviceById("iphone-14");
    const size = liveViewport(first, 0, "portrait");
    attachSocket(DEFAULT_URL, size.width, size.height);
    // Boot once with the default page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (customBg) URL.revokeObjectURL(customBg);
    };
  }, [customBg]);

  useEffect(() => {
    setCinematic(null);
  }, [apertura, deviceId, orientation]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !openedRef.current) return;
    const key = `${viewport.width}x${viewport.height}`;
    if (sentSize.current === key) return;
    sentSize.current = key;
    socket.send(JSON.stringify({ type: "resize", width: viewport.width, height: viewport.height }));
  }, [viewport.width, viewport.height]);

  useEffect(() => {
    setShellMode(readShellMode());
  }, []);

  const designsRef = useRef(designs);
  designsRef.current = designs;
  useEffect(() => {
    return () => {
      for (const url of Object.values(designsRef.current)) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, []);

  const designUrl = screenSource === "design" ? designs[designFamily(device)] ?? null : null;
  const designReady = Boolean(
    designImage && designUrl && designImage.src === designUrl && designImage.naturalWidth > 0,
  );

  useEffect(() => {
    if (!designUrl) {
      setDesignImage(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setDesignImage(image);
    };
    image.onerror = () => {
      if (!cancelled) {
        setDesignImage(null);
        setDesignFailed(designUrl);
        setDesignError("That image could not be read.");
      }
    };
    image.src = designUrl;
    return () => {
      cancelled = true;
    };
  }, [designUrl]);

  useEffect(() => {
    const onResize = () => setStageWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!flyout) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (shellRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-slot='select-content']")) return;
      setFlyout(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFlyout(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [flyout]);

  useLayoutEffect(() => {
    const panel = flyoutRef.current;
    const shell = shellRef.current;
    const button = flyout ? groupRefs.current[flyout] : null;
    if (!panel || !shell || !button) return;
    const place = () => {
      const shellRect = shell.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const margin = 12;
      const available = Math.max(0, window.innerWidth - shellRect.right - margin - 10);
      panel.style.width = `${Math.min(280, available)}px`;
      const height = panel.offsetHeight;
      let top = buttonRect.top - shellRect.top;
      if (shellRect.top + top + height > window.innerHeight - margin) {
        top = window.innerHeight - margin - height - shellRect.top;
      }
      if (shellRect.top + top < margin) top = margin - shellRect.top;
      setFlyoutTop(top);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    observer.observe(shell);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [flyout, shellMode, openGroup, deviceId, orientation]);

  function chooseDesign(family: DesignFamily, file: File | undefined) {
    if (!file) return;
    if (!isDesignFile(file)) {
      setDesignError("Use a png, jpg, or webp.");
      return;
    }
    const next = URL.createObjectURL(file);
    setDesigns((current) => {
      const previous = current[family];
      if (previous) URL.revokeObjectURL(previous);
      return { ...current, [family]: next };
    });
    setDesignError(null);
    setScreenSource("design");
  }

  function sendInput(input: ScreenInput) {
    if (screenSource === "design") return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !openedRef.current) return;
    socket.send(JSON.stringify({ type: "input", ...input }));
  }

  function attachSocket(target: string, width: number, height: number) {
    closeSocket();
    const socket = new WebSocket(socketUrl());
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    const key = `${width}x${height}`;

    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      openedRef.current = target;
      sentSize.current = key;
      socket.send(JSON.stringify({ type: "open", url: target, width, height }));
      if (document.hidden) socket.send(JSON.stringify({ type: "pause" }));
    };

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) return;
      if (typeof event.data === "string") {
        let message: LiveServerMessage;
        try {
          message = JSON.parse(event.data) as LiveServerMessage;
        } catch {
          return;
        }
        if (message.type === "error") {
          setScreen({ status: "error", message: message.message });
        } else if (message.type === "idle") {
          setScreen({ status: "error", message: "The session closed after inactivity" });
          rememberFrame(null);
        } else if (message.type === "status" && message.state === "loading") {
          setScreen({ status: "loading", message: "Opening…" });
        }
        return;
      }
      if (document.hidden) return;
      const bytes = event.data as ArrayBuffer;
      createImageBitmap(new Blob([bytes], { type: "image/jpeg" }))
        .then((bitmap) => {
          if (bitmap.width < 1 || bitmap.height < 1) {
            bitmap.close();
            return;
          }
          if (socketRef.current !== socket) {
            bitmap.close();
            return;
          }
          const expected = awaitingViewport.current;
          if (expected && !bitmapFitsViewport(bitmap, expected.width, expected.height)) {
            bitmap.close();
            return;
          }
          awaitingViewport.current = null;
          rememberFrame(bitmap);
          setScreen({ status: "ready", message: "" });
        })
        .catch(() => undefined);
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      openedRef.current = "";
      setScreen((current) =>
        current.status === "ready"
          ? { status: "error", message: "The session closed" }
          : current.status === "loading"
            ? { status: "error", message: "The session closed" }
            : current,
      );
    };
  }

  function openPage(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeHttpUrl(url);
    if (!normalized) {
      setScreen({ ...EMPTY_SCREEN });
      return;
    }

    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setScreen({
          status: "error",
          message: "Only http or https addresses are allowed",
        });
        return;
      }
    } catch {
      setScreen({ status: "error", message: "Invalid URL" });
      return;
    }

    rememberFrame(null);
    setScreenSource("live");
    setScreen({ status: "loading", message: "Opening…" });
    attachSocket(normalized, viewport.width, viewport.height);
  }

  function chooseMode(next: ShellMode) {
    setShellMode(next);
    setHint(null);
    try {
      sessionStorage.setItem(SHELL_KEY, next);
    } catch {
      /* ignore */
    }
    if (next === "icon") {
      setFlyout(null);
      requestAnimationFrame(() => iconButtonRef.current?.focus());
    }
  }

  function showHint(element: HTMLElement, label: string) {
    if (shellMode !== "rail" || flyout) return;
    const shell = shellRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setHint({ label, top: rect.top - shellRect.top + rect.height / 2 });
  }

  function chooseDevice(value: string | null) {
    if (!value || !isDeviceId(value)) return;
    const next = deviceById(value);
    const wasHinge = device.id === "iphone-duo" || device.kind === "laptop";
    const nextHinge = next.id === "iphone-duo" || next.kind === "laptop";
    if (wasHinge && !nextHinge) cancelAnimationFrame(foldRef.current);
    if (next.kind === "laptop" && device.kind !== "laptop") {
      cancelAnimationFrame(foldRef.current);
      setHingeOpen(true);
      aperturaRef.current = 1;
      setApertura(1);
    }
    if (next.id === "iphone-duo" && device.id !== "iphone-duo") {
      cancelAnimationFrame(foldRef.current);
      setHingeOpen(false);
      aperturaRef.current = 0;
      setApertura(0);
    }
    setDeviceId(value);
  }

  const expanded = shellMode === "expanded";
  const glassClearance = stageWidth < 900 && shellMode !== "icon" ? 72 : 0;
  const hinge = deviceId === "iphone-duo" || device.kind === "laptop";
  const flyoutLabel = flyout === "finish" ? `Finish · ${finish.label}` : GROUPS.find((item) => item.id === flyout)?.label;

  return (
    <div className="relative h-dvh overflow-hidden bg-white text-neutral-950">
      <div className="absolute inset-0 touch-none">
        <Scene
          device={device}
          screen={screen}
          frame={frame}
          apertura={apertura}
          orientation={orientation}
          light={light}
          background={background}
          backgroundImage={useCustom ? customBg : null}
          finish={finish}
          time="9:41"
          autoRotate={autoRotate}
          logoLight={logoLight}
          cinematic={cinematic}
          onCinematicEnd={() => setCinematic(null)}
          exportRef={exportRef}
          onInput={sendInput}
          insetLeft={glassClearance}
          designImage={designReady ? designImage : null}
          designHold={screenSource === "design"}
          designPending={
            screenSource === "design" && Boolean(designUrl) && !designReady && designFailed !== designUrl
          }
        />
      </div>

      {shellMode ? (
        <>
          <button
            ref={iconButtonRef}
            type="button"
            aria-label="Show controls"
            tabIndex={shellMode === "icon" ? 0 : -1}
            aria-hidden={shellMode === "icon" ? undefined : true}
            onClick={() => chooseMode("rail")}
            className={`absolute bottom-5 left-5 z-20 grid size-10 place-items-center rounded-full bg-white text-neutral-950 shadow-[0_8px_24px_rgba(23,23,23,0.10)] ring-1 ring-black/5 transition-[opacity,translate] ${MOTION} focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              shellMode === "icon" ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
            }`}
          >
            <PanelLeft className="size-4" />
          </button>

          <div
            ref={shellRef}
            className={`absolute top-1/2 left-4 z-20 -translate-y-1/2 ${shellMode === "icon" ? "pointer-events-none" : ""}`}
            inert={shellMode === "icon" ? true : undefined}
            aria-hidden={shellMode === "icon" ? true : undefined}
          >
            <aside
              className={`overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(23,23,23,0.08)] ring-1 ring-black/5 transition-[width,opacity,translate] ${MOTION} ${
                expanded ? "w-[212px]" : "w-12"
              } ${shellMode === "icon" ? "-translate-x-2 opacity-0" : "translate-x-0 opacity-100"}`}
            >
              <div className="px-1.5 pt-1.5">
                <div className="flex h-9 items-center">
                  <span className="grid size-9 shrink-0 place-items-center">
                    <img src="/icons/positivo.svg" alt="" className="size-5" />
                  </span>
                </div>
              </div>
              <nav className="flex flex-col gap-0.5 p-1.5" aria-label="Controls">
                {GROUPS.map((group) => {
                  const open = flyout === group.id;
                  const Icon = group.icon;
                  return (
                    <button
                      key={group.id}
                      ref={(node) => {
                        if (node) groupRefs.current[group.id] = node;
                      }}
                      type="button"
                      aria-label={group.label}
                      aria-expanded={open}
                      aria-controls={open ? "shell-flyout" : undefined}
                      onClick={() => {
                        setHint(null);
                        setFlyout(open ? null : group.id);
                      }}
                      onMouseEnter={(event) => showHint(event.currentTarget, group.label)}
                      onMouseLeave={() => setHint(null)}
                      onFocus={(event) => showHint(event.currentTarget, group.label)}
                      onBlur={() => setHint(null)}
                      className={`flex h-9 w-full items-center rounded-lg outline-none transition-colors ${MOTION} focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                        open ? "bg-neutral-100 text-neutral-950" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950"
                      }`}
                    >
                      <span className="grid size-9 shrink-0 place-items-center">
                        <Icon className="size-4" />
                      </span>
                      <span
                        className={`overflow-hidden text-left text-[13px] whitespace-nowrap transition-[max-width,opacity] ${MOTION} ${
                          expanded ? "max-w-40 opacity-100" : "max-w-0 opacity-0"
                        }`}
                      >
                        {group.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
              <div className="flex flex-col gap-0.5 border-t border-[#ebebeb] p-1.5">
                <button
                  type="button"
                  aria-label="Hide UI"
                  onClick={() => chooseMode("icon")}
                  onMouseEnter={(event) => showHint(event.currentTarget, "Hide UI")}
                  onMouseLeave={() => setHint(null)}
                  onFocus={(event) => showHint(event.currentTarget, "Hide UI")}
                  onBlur={() => setHint(null)}
                  className="flex h-9 w-full items-center rounded-lg text-neutral-500 outline-none transition-colors hover:bg-neutral-50 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-400"
                >
                  <span className="grid size-9 shrink-0 place-items-center">
                    <EyeOff className="size-4" />
                  </span>
                  <span
                    className={`overflow-hidden text-left text-[13px] whitespace-nowrap transition-[max-width,opacity] ${MOTION} ${
                      expanded ? "max-w-40 opacity-100" : "max-w-0 opacity-0"
                    }`}
                  >
                    Hide UI
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={expanded ? "Contract" : "Expand"}
                  onClick={() => chooseMode(expanded ? "rail" : "expanded")}
                  onMouseEnter={(event) => showHint(event.currentTarget, expanded ? "Contract" : "Expand")}
                  onMouseLeave={() => setHint(null)}
                  onFocus={(event) => showHint(event.currentTarget, expanded ? "Contract" : "Expand")}
                  onBlur={() => setHint(null)}
                  className="flex h-9 w-full items-center rounded-lg text-neutral-500 outline-none transition-colors hover:bg-neutral-50 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-400"
                >
                  <span className="grid size-9 shrink-0 place-items-center">
                    {expanded ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                  </span>
                </button>
              </div>
              {expanded ? (
                <p className="px-3 pb-2.5 text-[11px] text-neutral-400">
                  By{" "}
                  <a
                    href="https://www.linkedin.com/in/angelsanchezcaceres/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-400 hover:text-neutral-500"
                  >
                    @angelcreative
                  </a>
                </p>
              ) : null}
            </aside>

            {flyout && shellMode !== "icon" ? (
              <div
                key={flyout}
                ref={flyoutRef}
                id="shell-flyout"
                role="region"
                aria-label={GROUPS.find((item) => item.id === flyout)?.label}
                className="shell-flyout absolute left-[calc(100%+10px)] z-30 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-white p-3 shadow-[0_10px_30px_rgba(23,23,23,0.08)] ring-1 ring-black/5"
                style={{ top: flyoutTop }}
              >
                <p className="mb-2.5 text-[13px] text-neutral-500">{flyoutLabel}</p>
                {flyout === "page" ? (
                  <div className="flex flex-col gap-3">
                    <div
                      className="relative grid grid-cols-2 rounded-lg border border-[#ebebeb] p-0.5"
                      role="group"
                      aria-label="Screen source"
                    >
                      <span
                        aria-hidden
                        className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-neutral-950 transition-transform ${QUIET} ${
                          screenSource === "design" ? "translate-x-full" : "translate-x-0"
                        }`}
                      />
                      {(
                        [
                          ["live", "Live URL"],
                          ["design", "Upload design"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={screenSource === value}
                          onClick={() => setScreenSource(value)}
                          className={`relative z-10 h-8 rounded-md text-[13px] transition-colors outline-none ${QUIET} focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                            screenSource === value ? "text-white" : "text-neutral-950"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {screenSource === "live" ? (
                      <form onSubmit={openPage} className="flex items-center gap-2">
                        <Input
                          value={url}
                          onChange={(event) => setUrl(event.target.value)}
                          placeholder={DEFAULT_URL}
                          aria-label="Site URL"
                          inputMode="url"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          className="h-9 min-w-0 flex-1 border-[#ebebeb] bg-white text-sm shadow-none"
                        />
                        <Button type="submit" disabled={opening} className="h-9 shrink-0 px-3.5">
                          {opening ? "Opening…" : "Open"}
                        </Button>
                      </form>
                    ) : (
                      <div>
                        <div className="flex flex-col gap-1">
                          {DESIGN_ROWS.map((row) => {
                            const size = familyGlassSize(row.id, device, apertura);
                            const fileUrl = designs[row.id];
                            const active = designFamily(device) === row.id;
                            return (
                              <div
                                key={row.id}
                                className={`flex items-center gap-2 rounded-lg px-1.5 py-1.5 ${active ? "bg-neutral-100" : ""}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-[13px] text-neutral-950">{row.label}</p>
                                  <p className="text-[12px] text-neutral-500">
                                    {size.width} × {size.height}
                                  </p>
                                  <p className="text-[11px] text-neutral-400">
                                    export {size.width * 2} × {size.height * 2}
                                  </p>
                                </div>
                                {fileUrl ? (
                                  <span className="size-8 shrink-0 overflow-hidden rounded-md bg-neutral-950">
                                    <img src={fileUrl} alt="" className="size-full object-contain" />
                                  </span>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  className="border-[#ebebeb] px-2"
                                  onClick={() => designInputs.current[row.id]?.click()}
                                >
                                  {fileUrl ? "Replace" : "Upload"}
                                </Button>
                                <input
                                  ref={(node) => {
                                    designInputs.current[row.id] = node;
                                  }}
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                                  aria-label={`Upload ${row.label} design`}
                                  className="sr-only"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    chooseDesign(row.id, file);
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {designError ? <p className="mt-2 text-[12px] text-neutral-500">{designError}</p> : null}
                      </div>
                    )}
                  </div>
                ) : null}
                {flyout === "device" ? (
                  <div className="flex flex-col gap-3">
                    <Select
                      value={deviceId}
                      items={DEVICES.map((item) => ({ value: item.id, label: item.label }))}
                      onValueChange={chooseDevice}
                    >
                      <SelectTrigger
                        aria-label="Device"
                        className="h-9 w-full border-[#ebebeb] bg-white shadow-none"
                      >
                        <SelectValue>
                          {(value: DeviceId | null) =>
                            DEVICES.find((item) => item.id === value)?.label ?? "Device"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {DEVICES.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {handheld ? (
                      <div className="relative grid grid-cols-2 rounded-lg border border-[#ebebeb] p-0.5" role="group" aria-label="Orientation">
                        <span
                          aria-hidden
                          className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-neutral-950 transition-transform ${QUIET} ${
                            orientation === "landscape" ? "translate-x-full" : "translate-x-0"
                          }`}
                        />
                        {(
                          [
                            ["portrait", "Portrait"],
                            ["landscape", "Landscape"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={orientation === value}
                            onClick={() => setOrientation(value)}
                            className={`relative z-10 h-8 rounded-md text-[13px] transition-colors outline-none ${QUIET} focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                              orientation === value ? "text-white" : "text-neutral-950"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {hinge ? (
                      <div
                        className="relative grid grid-cols-2 rounded-lg border border-[#ebebeb] p-0.5"
                        role="group"
                        aria-label={device.kind === "laptop" ? "Lid" : "Duo"}
                      >
                        <span
                          aria-hidden
                          className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-neutral-950 transition-transform ${QUIET} ${
                            hingeOpen ? "translate-x-full" : "translate-x-0"
                          }`}
                        />
                        {(
                          [
                            [false, "Close"],
                            [true, "Open"],
                          ] as const
                        ).map(([open, label]) => (
                          <button
                            key={label}
                            type="button"
                            aria-pressed={hingeOpen === open}
                            onClick={() => setHinge(open)}
                            className={`relative z-10 h-8 rounded-md text-[13px] transition-colors outline-none ${QUIET} focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                              hingeOpen === open ? "text-white" : "text-neutral-950"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {flyout === "finish" ? (
                  <div className="flex flex-wrap gap-2 p-1" role="listbox" aria-label="Finish">
                    {device.finishes.map((item) => (
                      <ColorSwatch
                        key={item.id}
                        selected={item.id === finish.id}
                        label={item.label}
                        background={item.color}
                        onClick={() => setFinishId(item.id)}
                      />
                    ))}
                  </div>
                ) : null}
                {flyout === "background" ? (
                  <div className="flex flex-col gap-2.5">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-label="Upload a background image"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file || !file.type.startsWith("image/")) return;
                        const next = URL.createObjectURL(file);
                        setCustomBg(next);
                        setUseCustom(true);
                        setOpenGroup(null);
                      }}
                    />
                    <Button
                      type="button"
                      variant={useCustom ? "default" : "outline"}
                      className="h-8 border-[#ebebeb] px-2 text-[13px]"
                      onClick={() => fileRef.current?.click()}
                    >
                      Upload image
                    </Button>
                    <div className="flex flex-wrap gap-2 p-1" role="listbox" aria-label="Solid backgrounds">
                      {SOLID_BACKGROUNDS.map((item) => (
                        <ColorSwatch
                          key={item.id}
                          selected={!useCustom && background === item.id}
                          label={item.label}
                          background={item.css}
                          onClick={() => {
                            setUseCustom(false);
                            setOpenGroup(null);
                            setBackground(item.id);
                          }}
                        />
                      ))}
                    </div>
                    {GRADIENT_GROUPS.map((group) => {
                      const open = openGroup === group.label;
                      return (
                        <div key={group.label}>
                          <button
                            type="button"
                            aria-expanded={open}
                            className="flex w-full items-center justify-between text-left text-[12px] text-neutral-500"
                            onClick={() => setOpenGroup(open ? null : group.label)}
                          >
                            {group.label}
                            <ChevronDown
                              className={`size-3.5 transition-transform ${QUIET} ${open ? "rotate-180" : ""}`}
                            />
                          </button>
                          <div
                            className={`grid transition-[grid-template-rows,opacity] ${QUIET} ${
                              open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                            }`}
                          >
                            <div className="overflow-hidden" inert={open ? undefined : true}>
                              <div className="flex flex-wrap gap-1.5 p-1 pt-1.5" role="listbox" aria-label={group.label}>
                                {group.items.map((item) => (
                                  <ColorSwatch
                                    key={item.id}
                                    size="sm"
                                    selected={!useCustom && background === item.id}
                                    label={group.label}
                                    background={item.css}
                                    onClick={() => {
                                      setUseCustom(false);
                                      setOpenGroup(group.label);
                                      setBackground(item.id);
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {flyout === "scene" ? (
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-2">
                      <span className="flex items-center justify-between text-[13px]">
                        <span className="text-neutral-500">Light</span>
                        <span className="tabular-nums">{light.toFixed(1)}</span>
                      </span>
                      <Slider
                        value={[light]}
                        min={0}
                        max={2}
                        step={0.01}
                        onValueChange={(value) => {
                          const next = Array.isArray(value) ? value[0] : value;
                          setLight(next);
                        }}
                        aria-label="Light"
                      />
                    </label>
                    <ToggleRow label="Logo light" checked={logoLight} onChange={setLogoLight} />
                    <ToggleRow label="Auto-rotate" checked={autoRotate} onChange={setAutoRotate} />
                  </div>
                ) : null}
                {flyout === "cinematics" ? (
                  <div className="flex flex-col gap-1">
                    {CINEMATICS.map((item) => {
                      const playing = cinematic?.id === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={playing}
                          onClick={() => {
                            cinematicToken.current += 1;
                            setCinematic({ id: item.id, token: cinematicToken.current });
                          }}
                          className={`h-8 rounded-md px-2.5 text-left text-[13px] transition-colors outline-none ${QUIET} focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                            playing ? "bg-neutral-950 text-white" : "text-neutral-950 hover:bg-neutral-100"
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {flyout === "export" ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button type="button" className="h-8 px-2 text-[13px]" onClick={() => exportRef.current?.("png")}>
                      PNG
                    </Button>
                    <Button type="button" variant="outline" className="h-8 border-[#ebebeb] px-2 text-[13px]" onClick={() => exportRef.current?.("transparent")}>
                      Transparent
                    </Button>
                    <Button type="button" variant="outline" className="h-8 border-[#ebebeb] px-2 text-[13px]" onClick={() => exportRef.current?.("square")}>
                      Square
                    </Button>
                    <Button type="button" variant="outline" className="h-8 border-[#ebebeb] px-2 text-[13px]" onClick={() => exportRef.current?.("story")}>
                      Story
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {hint && shellMode === "rail" && !flyout ? (
              <div
                role="tooltip"
                className="pointer-events-none absolute left-[calc(100%+8px)] z-30 -translate-y-1/2 rounded-md bg-neutral-950 px-2 py-1 text-[12px] whitespace-nowrap text-white"
                style={{ top: hint.top }}
              >
                {hint.label}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
