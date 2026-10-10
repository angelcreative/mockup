"use client";

import { useRef, useState, type FormEvent } from "react";
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
import {
  BACKGROUNDS,
  DEVICES,
  deviceById,
  isDeviceId,
  type BackgroundId,
  type DeviceId,
  type ScreenState,
} from "@/lib/devices";
import { normalizeHttpUrl } from "@/lib/url";

const Scene = dynamic(() => import("@/components/scene"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-white" />,
});

const EMPTY_SCREEN: ScreenState = {
  status: "empty",
  message: "Pega una URL para capturar el sitio",
  image: null,
};

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagen"));
    };
    image.src = url;
  });
}

export function Studio() {
  const [url, setUrl] = useState("");
  const [deviceId, setDeviceId] = useState<DeviceId>("iphone-14");
  const [background, setBackground] = useState<BackgroundId>("blanco");
  const [light, setLight] = useState(1);
  const [apertura, setApertura] = useState(0);
  const [screen, setScreen] = useState<ScreenState>(EMPTY_SCREEN);
  const exportRef = useRef<(() => void) | null>(null);
  const requestId = useRef(0);
  const device = deviceById(deviceId);
  const loading = screen.status === "loading";

  async function capture(event: FormEvent) {
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
          image: null,
        });
        return;
      }
    } catch {
      setScreen({ status: "error", message: "URL no válida", image: null });
      return;
    }

    const id = requestId.current + 1;
    requestId.current = id;
    setScreen({ status: "loading", message: "Capturando…", image: null });

    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: normalized,
          width: device.width,
          height: device.height,
        }),
      });

      if (!response.ok) {
        let message = "No se pudo capturar esta página";
        try {
          const data = (await response.json()) as { error?: unknown };
          if (typeof data.error === "string" && data.error) message = data.error;
        } catch {
          message = "No se pudo capturar esta página";
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      if (blob.size < 32) throw new Error("No se pudo capturar esta página");
      const image = await loadImage(blob);
      if (requestId.current !== id) return;
      setScreen({ status: "ready", message: "", image });
    } catch (error) {
      if (requestId.current !== id) return;
      setScreen({
        status: "error",
        message: error instanceof Error ? error.message : "No se pudo capturar esta página",
        image: null,
      });
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-neutral-950">
      <header className="z-20 flex flex-col gap-4 border-b border-[#ebebeb] bg-white px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:gap-10">
        <div className="text-[15px] font-medium tracking-tight">Mockup</div>
        <form
          onSubmit={capture}
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
                className="h-9 w-[168px] border-[#ebebeb] bg-white shadow-none"
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
              {loading ? "Capturando…" : "Capturar"}
            </Button>
          </div>
        </form>
      </header>

      <main className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <Scene
            device={device}
            screen={screen}
            apertura={apertura}
            light={light}
            background={background}
            exportRef={exportRef}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div className="pointer-events-auto w-full max-w-[248px] rounded-xl border border-[#ebebeb] bg-white p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-neutral-500">Fondo</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {BACKGROUNDS.map((item) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant={background === item.id ? "default" : "outline"}
                      className="h-8 border-[#ebebeb] px-2 text-[13px]"
                      onClick={() => setBackground(item.id)}
                    >
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
              {deviceId === "fold" ? (
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
