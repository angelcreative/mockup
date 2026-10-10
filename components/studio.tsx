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
import type { ScreenInput, ShotMode } from "@/components/scene";
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

const DEFAULT_URL = "https://www.apple.com";

const SOLID_BACKGROUNDS = BACKGROUNDS.filter(
  (item) => item.id === "blanco" || item.id === "niebla" || item.id === "negro",
);
const GRADIENT_GROUPS = [
  { label: "Kiln", items: BACKGROUNDS.filter((item) => item.id.startsWith("vibrant-vista-")) },
  { label: "Laurel", items: BACKGROUNDS.filter((item) => item.id.startsWith("green-glory-")) },
  { label: "Velvet", items: BACKGROUNDS.filter((item) => item.id.startsWith("deep-dusk-")) },
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
  const [apertura, setApertura] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [time, setTime] = useState("9:41");
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
  const loading = screen.status === "loading";
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
            <Button type="submit" disabled={loading} className="h-9 px-3.5">
              {loading ? "Opening…" : "Open"}
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
            time={time || "9:41"}
            exportRef={exportRef}
            onInput={sendInput}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div className="pointer-events-auto max-h-[min(72vh,640px)] w-full max-w-[280px] overflow-y-auto rounded-xl border border-[#ebebeb] bg-white p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-neutral-500">
                  Finish <span className="text-neutral-950">· {finish.label}</span>
                </span>
                <div className="flex flex-wrap gap-2 p-0.5" role="listbox" aria-label="Finish">
                  {device.finishes.map((item) => {
                    const selected = item.id === finish.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-label={item.label}
                        onClick={() => setFinishId(item.id)}
                        className={`size-6 shrink-0 rounded-full border border-black/15 ${
                          selected ? "ring-2 ring-neutral-950 ring-offset-2" : ""
                        }`}
                        style={{ backgroundColor: item.color }}
                      />
                    );
                  })}
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
                <div className="flex flex-wrap gap-2 p-0.5" role="listbox" aria-label="Solid backgrounds">
                  {SOLID_BACKGROUNDS.map((item) => {
                    const selected = !useCustom && background === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-label={item.label}
                        onClick={() => {
                          setUseCustom(false);
                          setOpenGroup(null);
                          setBackground(item.id);
                        }}
                        className={`size-6 shrink-0 rounded-full border border-black/15 ${
                          selected ? "ring-2 ring-neutral-950 ring-offset-2" : ""
                        }`}
                        style={{ background: item.css }}
                      />
                    );
                  })}
                </div>
                {GRADIENT_GROUPS.map((group) => {
                  const open = openGroup === group.label;
                  return (
                    <div key={group.label} className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        className="flex w-full items-center justify-between text-left text-[12px] text-neutral-500"
                        onClick={() => setOpenGroup(open ? null : group.label)}
                      >
                        {group.label}
                        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                      {open ? (
                        <div className="flex flex-wrap gap-1.5 p-0.5" role="listbox" aria-label={group.label}>
                          {group.items.map((item) => {
                            const selected = !useCustom && background === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                aria-label={group.label}
                                onClick={() => {
                                  setUseCustom(false);
                                  setOpenGroup(group.label);
                                  setBackground(item.id);
                                }}
                                className={`size-5 shrink-0 rounded-full border border-black/10 ${
                                  selected ? "ring-2 ring-neutral-950 ring-offset-2" : ""
                                }`}
                                style={{ background: item.css }}
                              />
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {handheld ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] text-neutral-500">Orientation</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      type="button"
                      variant={orientation === "portrait" ? "default" : "outline"}
                      className="h-8 border-[#ebebeb] px-2 text-[13px]"
                      onClick={() => setOrientation("portrait")}
                    >
                      Portrait
                    </Button>
                    <Button
                      type="button"
                      variant={orientation === "landscape" ? "default" : "outline"}
                      className="h-8 border-[#ebebeb] px-2 text-[13px]"
                      onClick={() => setOrientation("landscape")}
                    >
                      Landscape
                    </Button>
                  </div>
                </div>
              ) : null}
              <label className="flex flex-col gap-2">
                <span className="text-[13px] text-neutral-500">Time</span>
                <Input
                  value={time}
                  onChange={(event) => setTime(event.target.value.slice(0, 8))}
                  aria-label="Time"
                  className="h-8 border-[#ebebeb] bg-white text-[13px] shadow-none"
                />
              </label>
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
