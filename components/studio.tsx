"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown,
  Clapperboard,
  Copy,
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
  Upload,
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
import type {
  CinematicId,
  CinematicShot,
  RecordFormat,
  Recorder,
  ScreenInput,
  ShotMode,
  TakeShot,
  ViewApi,
  ViewTool,
} from "@/components/scene";
import { ViewDock } from "@/components/view-dock";
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
import { createFrameStore } from "@/lib/frame-store";
import { defaultOpen, hasHinge, isHttpUrl, LINK_DEFAULTS, readLink, writeLink } from "@/lib/link";
import { CaptureFailed, captureKey, fetchCapture, type PageCapture } from "@/lib/page-capture";
import { PageScroller } from "@/lib/page-scroller";
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
  watch: null,
};

function isDesignFile(file: File) {
  if (file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp") return true;
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

/** Captured in the background after the first one, so switching device family is instant. */
const PREFETCH = DESIGN_ROWS.filter((row) => row.id !== "watch" && row.id !== "desktop").map((row) =>
  liveViewport(deviceById(row.defaultId), 0, "portrait"),
);

/** The cached capture closest in size, shown while the exact one is on its way. */
function nearestCapture(captures: Iterable<PageCapture>, width: number, height: number) {
  let best: PageCapture | null = null;
  let bestScore = Infinity;
  for (const capture of captures) {
    const score = Math.abs(Math.log(capture.width / width)) * 4 + Math.abs(Math.log(capture.viewportHeight / height));
    if (score < bestScore) {
      best = capture;
      bestScore = score;
    }
  }
  return best;
}

const DEFAULT_URL = LINK_DEFAULTS.url;

const TYPING = "input, textarea, select, [contenteditable='true'], [role='combobox'], [role='listbox'], [role='option'], [role='slider']";

function isTyping(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(TYPING));
}

function imageFile(files: FileList | File[] | undefined | null) {
  return Array.from(files ?? []).find(isDesignFile) ?? null;
}

const QUIET = "duration-200 ease-out motion-reduce:transition-none";
const MOTION = "duration-[240ms] ease-out motion-reduce:transition-none";
const MARK_MOTION = "duration-[400ms] ease-out motion-reduce:transition-none";
const MARK_FADE = "duration-500 ease-out motion-reduce:transition-none";

function imageIsDark(image: HTMLImageElement) {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || image.naturalWidth < 1 || image.naturalHeight < 1) return false;
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  let sum = 0;
  let weight = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha < 0.08) continue;
    const channel = (value: number) => {
      const unit = value / 255;
      return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(data[index]) + 0.7152 * channel(data[index + 1]) + 0.0722 * channel(data[index + 2]);
    sum += luminance * alpha;
    weight += alpha;
  }
  return weight > 0 && sum / weight < 0.5;
}
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
  { id: "loop", label: "Loop 360°" },
];
// The scene module loads lazily with three.js, so the shapes are listed here too.
const RECORD_FORMATS: { id: RecordFormat; label: string; aspect?: number }[] = [
  { id: "current", label: "Current" },
  { id: "square", label: "1:1", aspect: 1 },
  { id: "story", label: "9:16", aspect: 9 / 16 },
];
// Mirrors the shot lengths in the scene: every shot runs 5 s, the loop 8 s.
const shotLength = (id: CinematicId) => (id === "loop" ? 8 : 5);

function canRecordVideo() {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") return false;
  return ["video/mp4", "video/webm"].some((type) => MediaRecorder.isTypeSupported(type));
}

export function Studio() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [deviceId, setDeviceId] = useState<DeviceId>("iphone-14");
  const [background, setBackground] = useState<BackgroundId>("blanco");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [customDark, setCustomDark] = useState<boolean | null>(null);
  const [finishId, setFinishId] = useState(DEVICES[0].finishes[0].id);
  const [light, setLight] = useState(1);
  const [autoRotate, setAutoRotate] = useState(false);
  const [logoLight, setLogoLight] = useState(false);
  const [cinematic, setCinematic] = useState<CinematicShot | null>(null);
  const cinematicToken = useRef(0);
  const [viewTool, setViewTool] = useState<ViewTool>("orbit");
  const [holdingMove, setHoldingMove] = useState(false);
  const viewRef = useRef<ViewApi | null>(null);
  const stopCinematic = useCallback(() => setCinematic(null), []);
  const [selectedShot, setSelectedShot] = useState<CinematicId>("orbit");
  const [recordFormat, setRecordFormat] = useState<RecordFormat>("current");
  const [recording, setRecording] = useState<{ id: CinematicId } | null>(null);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);
  const shotEnded = useRef(false);
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
  const frames = useState(createFrameStore)[0];
  const scrollerRef = useRef<PageScroller | null>(null);
  const capturesRef = useRef(new Map<string, PageCapture>());
  const requestRef = useRef(0);
  const freshRef = useRef(false);
  const prefetchedRef = useRef("");
  const [loadToken, setLoadToken] = useState(0);
  const exportRef = useRef<TakeShot | null>(null);
  const [pageUrl, setPageUrl] = useState(DEFAULT_URL);
  const linkReady = useRef(false);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const toastTimer = useRef(0);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const beforeWatch = useRef<{ source: "live" | "design"; orientation: Orientation } | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
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
  const markRef = useRef<HTMLDivElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const groupRefs = useRef<Partial<Record<GroupId, HTMLButtonElement>>>({});
  const device = deviceById(deviceId);
  const finish = device.finishes.find((item) => item.id === finishId) ?? device.finishes[0];
  const viewport = liveViewport(device, apertura, orientation);
  const opening = screen.status === "loading" && screen.message === "Opening…";
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

  function scroller() {
    scrollerRef.current ??= new PageScroller((canvas) => frames.set(canvas));
    return scrollerRef.current;
  }

  function markReady() {
    setScreen((current) =>
      current.status === "ready" && current.message === "" ? current : { status: "ready", message: "" },
    );
  }

  /**
   * Puts the page on the glass at the device's exact size. A cached capture of that size
   * shows at once; otherwise the nearest one stands in while the exact one is captured.
   */
  function showPage() {
    if (!linkReady.current || device.kind === "watch") return;
    const url = pageUrl;
    const { width, height } = viewport;
    const store = capturesRef.current;
    const fresh = freshRef.current;
    freshRef.current = false;
    for (const [key, capture] of store) {
      if (fresh || capture.url !== url) store.delete(key);
    }
    if (scroller().current && scroller().current?.url !== url) scroller().clear();
    const key = captureKey(url, width, height);
    const request = ++requestRef.current;
    const exact = store.get(key);
    if (exact) {
      void scroller().show(exact, width, height).then((shown) => shown && markReady());
      return;
    }
    const near = nearestCapture(store.values(), width, height);
    if (near) {
      void scroller().show(near, width, height).then((shown) => shown && markReady());
    } else {
      scroller().clear();
      setScreen({ status: "loading", message: "Opening…" });
    }
    fetchCapture(url, width, height, { urgent: true, fresh })
      .then(async (capture) => {
        store.set(key, capture);
        if (request !== requestRef.current) return;
        if (await scroller().show(capture, width, height)) markReady();
        void prefetch(url);
      })
      .catch((error: unknown) => {
        if (request !== requestRef.current) return;
        const message = error instanceof CaptureFailed ? error.message : "Could not open this page";
        if (near) showToast(message);
        else setScreen({ status: "error", message });
      });
  }

  /** One after another, so the server's queue keeps serving whoever is waiting in front. */
  async function prefetch(url: string) {
    if (prefetchedRef.current === url) return;
    prefetchedRef.current = url;
    for (const size of PREFETCH) {
      const key = captureKey(url, size.width, size.height);
      // A capture within a few pixels already covers this family until its exact size is asked for.
      const near = nearestCapture(capturesRef.current.values(), size.width, size.height);
      if (near && Math.abs(near.width - size.width) <= size.width * 0.05) continue;
      try {
        const capture = await fetchCapture(url, size.width, size.height, { urgent: false });
        if (prefetchedRef.current !== url) return;
        capturesRef.current.set(key, capture);
      } catch {
        // A missing prefetch only means that family captures on demand.
      }
    }
  }

  useEffect(() => () => cancelAnimationFrame(foldRef.current), []);

  useEffect(() => {
    showPage();
    // showPage reads the page, the viewport and the device; these are what change them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageUrl, loadToken, viewport.width, viewport.height, device.kind]);

  useEffect(() => {
    if (!linkReady.current) return;
    // The address bar always holds a link to this exact mockup.
    const query = writeLink({
      url: pageUrl,
      device,
      finish: finish.id,
      background: useCustom ? null : background,
      orientation,
      open: hingeOpen,
    });
    const next = `${window.location.pathname}${query}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [background, device, finish.id, hingeOpen, orientation, pageUrl, useCustom]);

  const actions = useRef<{
    copyImage: () => void;
    openLink: (text: string) => boolean;
    placeDesign: (file: File) => void;
  } | null>(null);

  useEffect(() => {
    // Cmd/Ctrl+C copies the mockup unless text is selected or a field has focus.
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key !== "c" && event.key !== "C") return;
      if (isTyping(event.target) || (window.getSelection()?.toString() ?? "") !== "") return;
      event.preventDefault();
      actions.current?.copyImage();
    };
    // Pasting an image places it on the screen; pasting an address opens it.
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const data = event.clipboardData;
      if (!data) return;
      const file = imageFile(data.files);
      if (file) {
        event.preventDefault();
        actions.current?.placeDesign(file);
        return;
      }
      if (actions.current?.openLink(data.getData("text/plain"))) event.preventDefault();
    };
    let depth = 0;
    const carries = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? []);
      return types.includes("Files") || types.includes("text/uri-list") || types.includes("text/plain");
    };
    const onDragEnter = (event: DragEvent) => {
      if (!carries(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!carries(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      const data = event.dataTransfer;
      if (!data) return;
      event.preventDefault();
      const file = imageFile(data.files);
      if (file) {
        actions.current?.placeDesign(file);
        return;
      }
      if (data.files.length > 0) return;
      const text = data.getData("text/uri-list").split("\n").find((line) => line && !line.startsWith("#")) ?? data.getData("text/plain");
      actions.current?.openLink(text);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!recording) return;
    const startedAt = performance.now();
    const tick = window.setInterval(() => setRecordElapsed(performance.now() - startedAt), 200);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCinematic(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("keydown", onKey);
    };
  }, [recording]);

  useEffect(() => {
    return () => {
      if (customBg) URL.revokeObjectURL(customBg);
    };
  }, [customBg]);

  useEffect(() => {
    if (!useCustom || !customBg) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setCustomDark(imageIsDark(image));
    };
    image.onerror = () => {
      if (!cancelled) setCustomDark(false);
    };
    image.src = customBg;
    return () => {
      cancelled = true;
    };
  }, [customBg, useCustom]);

  useEffect(() => {
    setCinematic(null);
  }, [apertura, deviceId, orientation]);

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

  /** Scrolling on the glass moves the captured page; a tap on an error tries again. */
  function sendInput(input: ScreenInput) {
    if (screenSource === "design") return;
    if (screenRef.current.status === "error") {
      if (input.action === "up") openAgain();
      return;
    }
    if (input.action === "wheel") scroller().scrollBy(input.deltaY, Boolean(input.drag));
    else if (input.action === "release") scroller().release();
  }

  function presentUrl(nextUrl: string) {
    const normalized = normalizeHttpUrl(nextUrl);
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

    // Opening a page on purpose takes a new capture rather than one from a few minutes ago.
    freshRef.current = true;
    prefetchedRef.current = "";
    setPageUrl(normalized);
    setLoadToken((token) => token + 1);
    setScreenSource("live");
  }

  function openAgain() {
    if (screenRef.current.status === "loading") return;
    presentUrl(pageUrl);
  }

  function openPage(event: FormEvent) {
    event.preventDefault();
    presentUrl(url);
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
    if (next.kind === "watch") {
      if (device.kind !== "watch") {
        beforeWatch.current = { source: screenSource, orientation };
      }
      setScreenSource("design");
      setOrientation("portrait");
    } else if (device.kind === "watch" && beforeWatch.current) {
      setScreenSource(beforeWatch.current.source);
      setOrientation(beforeWatch.current.orientation);
      beforeWatch.current = null;
    }
    setDeviceId(value);
  }

  function takeShot(mode: ShotMode, target: "download" | "clipboard" = "download") {
    const mark = markRef.current;
    if (mark) mark.style.visibility = "hidden";
    try {
      return exportRef.current?.(mode, target) ?? Promise.resolve(false);
    } finally {
      if (mark) mark.style.visibility = "";
    }
  }

  function showToast(text: string) {
    window.clearTimeout(toastTimer.current);
    setToast((current) => ({ text, key: (current?.key ?? 0) + 1 }));
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }

  function copyImage() {
    void takeShot("png", "clipboard").then((copied) =>
      showToast(copied ? "Image copied" : "This browser can't copy images. Use Export instead."),
    );
  }

  function copyLink() {
    const href = window.location.href;
    if (!navigator.clipboard?.writeText) {
      showToast("Copy the address bar to share this mockup");
      return;
    }
    navigator.clipboard.writeText(href).then(
      () => showToast("Link copied"),
      () => showToast("Copy the address bar to share this mockup"),
    );
  }

  /** Auto-rotate would drift away from the shot's last frame, so a shot switches it off. */
  function playShot(id: CinematicId, record = false, aspect?: number) {
    setAutoRotate(false);
    setSelectedShot(id);
    cinematicToken.current += 1;
    setCinematic({ id, token: cinematicToken.current, record, aspect });
  }

  function startRecording() {
    if (recording) return;
    if (!canRecordVideo()) {
      showToast("This browser can't record video");
      return;
    }
    shotEnded.current = false;
    setFlyout(null);
    setRecordElapsed(0);
    setRecording({ id: selectedShot });
    playShot(selectedShot, true, RECORD_FORMATS.find((item) => item.id === recordFormat)?.aspect);
  }

  /** Runs once the shot stops: saves the video if it played to the end, else drops it. */
  function finishRecording(current: { id: CinematicId }) {
    const recorder = recorderRef.current;
    const ended = shotEnded.current;
    shotEnded.current = false;
    if (!ended || !recorder) {
      recorder?.cancel();
      setRecording(null);
      showToast("Recording cancelled");
      return;
    }
    void recorder.stop().then((blob) => {
      setRecording(null);
      if (!blob) {
        showToast("The video could not be recorded");
        return;
      }
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `mockup-${current.id}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      showToast("Video saved");
    });
  }

  useEffect(() => {
    if (!recording || cinematic) return;
    finishRecording(recording);
    // finishRecording reads refs and the recorder; it only needs to run when the shot stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinematic, recording]);

  /** Opens a pasted or dropped address. Returns false when the text isn't one. */
  function openLink(text: string) {
    const value = text.trim().split(/\s+/)[0] ?? "";
    if (!value || !isHttpUrl(value)) return false;
    if (device.kind === "watch") {
      showToast("Apple Watch shows designs only. Drop an image instead.");
      return true;
    }
    const normalized = normalizeHttpUrl(value);
    setUrl(normalized);
    presentUrl(normalized);
    return true;
  }

  function placeDesign(file: File) {
    chooseDesign(designFamily(device), file);
    showToast(`Design placed on the ${device.label}`);
  }

  function bootFromLink() {
    const link = readLink(window.location.search);
    const next = deviceById(link.device ?? LINK_DEFAULTS.device);
    const open = hasHinge(next) ? (link.open ?? defaultOpen(next)) : false;
    const turn = next.kind === "watch" || next.kind === "laptop" || next.kind === "desktop" ? "portrait" : (link.orientation ?? "portrait");
    const target = link.url ?? DEFAULT_URL;
    setDeviceId(next.id);
    deviceIdRef.current = next.id;
    if (link.finish) setFinishId(link.finish);
    if (link.background) setBackground(link.background);
    setOrientation(turn);
    setHingeOpen(open);
    aperturaRef.current = open ? 1 : 0;
    setApertura(open ? 1 : 0);
    if (next.kind === "watch") {
      beforeWatch.current = { source: "live", orientation: "portrait" };
      setScreenSource("design");
    }
    setUrl(target);
    setPageUrl(target);
    linkReady.current = true;
    setLoadToken((token) => token + 1);
  }

  useEffect(() => {
    // Boot once, from the shared link or the default page. The link is only readable in the
    // browser, so it is applied after the first render instead of during it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    bootFromLink();
  }, []);

  useLayoutEffect(() => {
    actions.current = { copyImage, openLink, placeDesign };
  });

  const markOnLight = useCustom ? customDark !== true : background === "blanco" || background === "niebla";
  const expanded = shellMode === "expanded";
  const glassClearance = stageWidth < 900 && shellMode !== "icon" ? 72 : 0;
  const hinge = deviceId === "iphone-duo" || device.kind === "laptop";
  const flyoutLabel = flyout === "finish" ? `Finish · ${finish.label}` : GROUPS.find((item) => item.id === flyout)?.label;

  return (
    <div className="relative h-dvh overflow-hidden bg-white text-neutral-950">
      <div
        className={`absolute inset-0 touch-none ${holdingMove || viewTool === "move" ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <Scene
          device={device}
          screen={screen}
          frames={frames}
          recordFormat={recording ? recordFormat : null}
          recorderRef={recorderRef}
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
          onCinematicEnd={() => {
            if (recording) shotEnded.current = true;
            setCinematic(null);
          }}
          exportRef={exportRef}
          onInput={sendInput}
          insetLeft={glassClearance}
          designImage={designReady ? designImage : null}
          designHold={screenSource === "design"}
          designPending={
            screenSource === "design" && Boolean(designUrl) && !designReady && designFailed !== designUrl
          }
          tool={holdingMove ? "move" : viewTool}
          viewRef={viewRef}
        />
      </div>

      {shellMode ? (
        <ViewDock
          tool={viewTool}
          holding={holdingMove}
          hidden={shellMode === "icon"}
          viewRef={viewRef}
          onTool={setViewTool}
          onHold={setHoldingMove}
          onUse={stopCinematic}
        />
      ) : null}

      <div aria-live="polite" className="pointer-events-none absolute bottom-[84px] left-1/2 z-30 -translate-x-1/2">
        {toast ? (
          <p
            key={toast.key}
            className="rounded-full bg-white px-3 py-1.5 text-[12px] whitespace-nowrap text-neutral-950 shadow-[0_8px_24px_rgba(23,23,23,0.12)] ring-1 ring-black/5"
          >
            {toast.text}
          </p>
        ) : null}
      </div>

      {recording ? (
        <div className="absolute inset-0 z-50 cursor-wait" aria-live="polite">
          <div className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] text-neutral-950 shadow-[0_8px_24px_rgba(23,23,23,0.12)] ring-1 ring-black/5">
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-red-500" />
            <span className="tabular-nums">
              REC {Math.min(shotLength(recording.id), recordElapsed / 1000).toFixed(1)} / {shotLength(recording.id)} s
            </span>
            <span className="text-neutral-400">· Esc to cancel</span>
          </div>
        </div>
      ) : null}

      {dragging ? (
        <div className="pointer-events-none absolute inset-3 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-neutral-950/30 bg-white/40 backdrop-blur-[2px]">
          <p className="rounded-full bg-neutral-950 px-4 py-2 text-[13px] text-white">
            Drop an image to place it on the {device.label}, or a link to open it
          </p>
        </div>
      ) : null}

      <div
        ref={markRef}
        tabIndex={0}
        className="group absolute top-4 left-4 z-40 flex h-9 items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        <span className="relative size-5 shrink-0">
          <img
            src="/icons/positivo.svg"
            alt=""
            className={`absolute inset-0 size-5 transition-opacity ${MARK_FADE} ${markOnLight ? "opacity-100" : "opacity-0"}`}
          />
          <img
            src="/icons/negativo.svg"
            alt=""
            className={`absolute inset-0 size-5 transition-opacity ${MARK_FADE} ${markOnLight ? "opacity-0" : "opacity-100"}`}
          />
        </span>
        <span
          className={`overflow-hidden text-[13px] whitespace-nowrap transition-[max-width,opacity] ${MARK_MOTION} max-w-0 opacity-0 group-hover:max-w-40 group-hover:opacity-100 group-focus-visible:max-w-40 group-focus-visible:opacity-100`}
        >
          <span className={`pl-2 transition-colors ${MARK_FADE} ${markOnLight ? "text-neutral-950" : "text-white"}`}>
            Live Mockup
          </span>
        </span>
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
                    {device.kind === "watch" ? null : (
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
                    )}
                    {device.kind === "watch" || screenSource === "design" ? (
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
                    ) : (
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
                    )}
                    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-neutral-500">
                      <Upload className="mt-px size-3.5 shrink-0" aria-hidden />
                      <span>
                        Or drag and drop {device.kind === "watch" ? "an image" : "a link or an image"} anywhere on the page.
                        Pasting works too.
                      </span>
                    </p>
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
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      {CINEMATICS.map((item) => {
                        const playing = cinematic?.id === item.id;
                        const selected = selectedShot === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => playShot(item.id)}
                            className={`flex h-8 items-center justify-between rounded-md px-2.5 text-left text-[13px] transition-colors outline-none ${QUIET} focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                              playing || selected ? "bg-neutral-950 text-white" : "text-neutral-950 hover:bg-neutral-100"
                            }`}
                          >
                            {item.label}
                            <span className={playing || selected ? "text-white/60" : "text-neutral-400"}>
                              {shotLength(item.id)} s
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-2 border-t border-[#ebebeb] pt-3">
                      <div className="grid grid-cols-3 rounded-lg border border-[#ebebeb] p-0.5" role="group" aria-label="Video format">
                        {RECORD_FORMATS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={recordFormat === item.id}
                            onClick={() => setRecordFormat(item.id)}
                            className={`h-7 rounded-md text-[12px] transition-colors outline-none ${QUIET} focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                              recordFormat === item.id ? "bg-neutral-950 text-white" : "text-neutral-950 hover:bg-neutral-50"
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                      <Button type="button" className="h-9 gap-2 text-[13px]" onClick={startRecording}>
                        <span aria-hidden className="size-2 rounded-full bg-red-500" />
                        Record {CINEMATICS.find((item) => item.id === selectedShot)?.label}
                      </Button>
                      <p className="text-[11px] text-neutral-400">
                        Plays the selected shot and saves it as a video. Loop 360° repeats seamlessly.
                      </p>
                    </div>
                  </div>
                ) : null}
                {flyout === "export" ? (
                  <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button type="button" className="h-8 px-2 text-[13px]" onClick={() => takeShot("png")}>
                      PNG
                    </Button>
                    <Button type="button" variant="outline" className="h-8 border-[#ebebeb] px-2 text-[13px]" onClick={() => takeShot("transparent")}>
                      Transparent
                    </Button>
                    <Button type="button" variant="outline" className="h-8 border-[#ebebeb] px-2 text-[13px]" onClick={() => takeShot("square")}>
                      Square
                    </Button>
                    <Button type="button" variant="outline" className="h-8 border-[#ebebeb] px-2 text-[13px]" onClick={() => takeShot("story")}>
                      Story
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 border-t border-[#ebebeb] pt-2">
                    <Button type="button" variant="outline" className="h-8 gap-1.5 border-[#ebebeb] px-2 text-[13px]" onClick={copyImage}>
                      <Copy className="size-3.5" />
                      Copy image
                    </Button>
                    <Button type="button" variant="outline" className="h-8 gap-1.5 border-[#ebebeb] px-2 text-[13px]" onClick={copyLink}>
                      <Link2 className="size-3.5" />
                      Copy link
                    </Button>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    {/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘C" : "Ctrl+C"} copies the image. Paste or drop an image or a link anywhere.
                  </p>
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
