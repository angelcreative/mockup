"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";

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
import type { ScreenInput } from "@/components/scene";
import {
  BACKGROUNDS,
  DEVICES,
  deviceById,
  isDeviceId,
  liveViewport,
  type BackgroundId,
  type DeviceId,
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
  message: "Pega una URL para abrir el sitio",
};

function socketUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/live`;
}

export function Studio() {
  const [url, setUrl] = useState("");
  const [deviceId, setDeviceId] = useState<DeviceId>("iphone-14");
  const [background, setBackground] = useState<BackgroundId>("blanco");
  const [finishId, setFinishId] = useState(DEVICES[0].finishes[0].id);
  const [light, setLight] = useState(1);
  const [apertura, setApertura] = useState(0);
  const [screen, setScreen] = useState<ScreenState>(EMPTY_SCREEN);
  const [frame, setFrame] = useState<ImageBitmap | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const openedRef = useRef("");
  const sentSize = useRef("");
  const device = deviceById(deviceId);
  const finish = device.finishes.find((item) => item.id === finishId) ?? device.finishes[0];
  const viewport = liveViewport(device, apertura);
  const loading = screen.status === "loading";

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
          setScreen({ status: "error", message: "La sesión se cerró por inactividad" });
          rememberFrame(null);
        } else if (message.type === "status" && message.state === "loading") {
          setScreen({ status: "loading", message: "Abriendo…" });
        }
        return;
      }
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
          ? { status: "error", message: "La sesión se cerró" }
          : current.status === "loading"
            ? { status: "error", message: "La sesión se cerró" }
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
          message: "Solo se permiten direcciones http o https",
        });
        return;
      }
    } catch {
      setScreen({ status: "error", message: "URL no válida" });
      return;
    }

    rememberFrame(null);
    setScreen({ status: "loading", message: "Abriendo…" });
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
            placeholder="https://elpais.es"
            aria-label="URL del sitio"
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
                if (value && isDeviceId(value)) setDeviceId(value);
              }}
            >
              <SelectTrigger
                aria-label="Dispositivo"
                className="h-9 w-[168px] border-[#ebebeb] bg-white shadow-none sm:w-[188px]"
              >
                <SelectValue>
                  {(value: DeviceId | null) =>
                    DEVICES.find((item) => item.id === value)?.label ?? "Dispositivo"
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
              {loading ? "Abriendo…" : "Abrir"}
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
            light={light}
            background={background}
            finish={finish}
            exportRef={exportRef}
            onInput={sendInput}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div className="pointer-events-auto w-full max-w-[280px] rounded-xl border border-[#ebebeb] bg-white p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-neutral-500">Acabado</span>
                <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Acabado">
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
                        className={`flex items-center gap-1.5 rounded-full border px-1.5 py-1 text-left text-[12px] leading-none ${
                          selected
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-[#ebebeb] bg-white text-neutral-800"
                        }`}
                      >
                        <span
                          className="size-3.5 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-neutral-500">Fondo</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {BACKGROUNDS.map((item) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant={background === item.id ? "default" : "outline"}
                      className="h-8 justify-start gap-1.5 border-[#ebebeb] px-2 text-[13px]"
                      onClick={() => setBackground(item.id)}
                    >
                      <span
                        className="size-3.5 shrink-0 rounded-full border border-black/10"
                        style={{ background: item.css }}
                      />
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-2">
                <span className="flex items-center justify-between text-[13px]">
                  <span className="text-neutral-500">Luz</span>
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
                  aria-label="Luz"
                />
              </label>
              {deviceId === "iphone-duo" ? (
                <label className="flex flex-col gap-2">
                  <span className="flex items-center justify-between text-[13px]">
                    <span className="text-neutral-500">Apertura</span>
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
                    aria-label="Apertura"
                  />
                </label>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            className="pointer-events-auto h-9 px-3.5"
            onClick={() => exportRef.current?.()}
          >
            Guardar imagen
          </Button>
        </div>
      </main>
    </div>
  );
}
