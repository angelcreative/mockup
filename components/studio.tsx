"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { ChevronDown } from "lucide-react";

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
  DEVICES,
  deviceById,
  isDeviceId,
  liveViewport,
  type BackgroundId,
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

function bitmapFitsViewport(bitmap: ImageBitmap, width: number, height: number) {
  const scales = width * height > 600_000 ? [1] : [1, 2];
  return scales.some(
    (scale) => Math.abs(bitmap.width - width * scale) <= 4 && Math.abs(bitmap.height - height * scale) <= 4,
  );
}

const DEFAULT_URL = "https://www.apple.com";

const QUIET = "duration-200 ease-out motion-reduce:transition-none";

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

  function sendInput(input: ScreenInput) {
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
    setScreen({ status: "loading", message: "Opening…" });
    attachSocket(normalized, viewport.width, viewport.height);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-neutral-950">
      <header className="z-20 flex flex-col gap-4 border-b border-[#ebebeb] bg-white px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:gap-10">
        <div className="text-[15px] font-medium tracking-tight">Mockup</div>
        <form
          onSubmit={openPage}
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
        >
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
          <div className="flex items-center gap-2">
            <Select
              value={deviceId}
              items={DEVICES.map((item) => ({ value: item.id, label: item.label }))}
              onValueChange={(value) => {
                if (!value || !isDeviceId(value)) return;
                const next = deviceById(value);
                if (next.kind === "laptop" && device.kind !== "laptop") setApertura(1);
                if (next.id === "iphone-duo" && device.id !== "iphone-duo") setApertura(0);
                setDeviceId(value);
              }}
            >
              <SelectTrigger
                aria-label="Device"
                className="h-9 w-[168px] border-[#ebebeb] bg-white shadow-none sm:w-[210px]"
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
            <Button type="submit" disabled={opening} className="h-9 px-3.5">
              {opening ? "Opening…" : "Open"}
            </Button>
          </div>
        </form>
      </header>

      <main className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
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
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div className="pointer-events-auto flex max-h-[min(72vh,640px)] w-full max-w-[280px] flex-col rounded-xl border border-[#ebebeb] bg-white">
            <div className="flex flex-col gap-4 overflow-y-auto p-4">
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-neutral-500">
                  Finish <span className="text-neutral-950">· {finish.label}</span>
                </span>
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
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="text-[13px] text-neutral-500">Background</span>
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
              <ToggleRow label="Auto-rotate" checked={autoRotate} onChange={setAutoRotate} />
              <ToggleRow label="Logo light" checked={logoLight} onChange={setLogoLight} />
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-neutral-500">Cinematics</span>
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
              </div>
              {handheld ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] text-neutral-500">Orientation</span>
                  <div className="relative grid grid-cols-2 rounded-lg border border-[#ebebeb] p-0.5">
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
                </div>
              ) : null}
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
              {deviceId === "iphone-duo" ? (
                <label className="flex flex-col gap-2">
                  <span className="flex items-center justify-between text-[13px]">
                    <span className="text-neutral-500">Opening</span>
                    <span className="tabular-nums">{apertura.toFixed(1)}</span>
                  </span>
                  <Slider
                    value={[apertura]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(value) => {
                      const next = Array.isArray(value) ? value[0] : value;
                      setApertura(next);
                    }}
                    aria-label="Opening"
                  />
                </label>
              ) : null}
              {device.kind === "laptop" ? (
                <label className="flex flex-col gap-2">
                  <span className="flex items-center justify-between text-[13px]">
                    <span className="text-neutral-500">Lid</span>
                    <span className="tabular-nums">{apertura.toFixed(1)}</span>
                  </span>
                  <Slider
                    value={[apertura]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(value) => {
                      const next = Array.isArray(value) ? value[0] : value;
                      setApertura(next);
                    }}
                    aria-label="Lid"
                  />
                </label>
              ) : null}
            </div>
            <p className="px-4 pb-3 text-[11px] text-neutral-400">
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
          </div>
          <div className="pointer-events-auto w-full max-w-[220px] rounded-xl border border-[#ebebeb] bg-white p-3">
            <span className="text-[13px] text-neutral-500">Save image</span>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
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
          </div>
        </div>
      </main>
    </div>
  );
}
