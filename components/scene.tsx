"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type { BackgroundId, DeviceSpec, FinishSpec, Orientation, ScreenState } from "@/lib/devices";
import { BACKGROUNDS, duoScreen, isComputer, isDuoOpen, liveViewport } from "@/lib/devices";
import { DeviceModel, deviceFoot, deviceScreenSize, deviceSpan } from "@/components/devices";
import { paintDesign, paintScreen } from "@/components/chrome";
import { uvToCss, type ScreenPanel } from "@/lib/pointer";

export type ScreenInput =
  | { action: "move" | "down" | "up"; x: number; y: number; button: number }
  | { action: "wheel"; x: number; y: number; button: number; deltaX: number; deltaY: number };

export type ShotMode = "png" | "transparent" | "square" | "story";

export type CinematicId = "pull-back" | "push-in" | "orbit" | "reveal" | "settle";

export type CinematicShot = { id: CinematicId; token: number };

export type ViewTool = "orbit" | "move";

export type ViewState = { zoom: number; home: boolean };

export type ViewApi = {
  zoomBy: (factor: number) => void;
  panBy: (x: number, y: number) => void;
  reset: () => void;
  read: () => ViewState;
  subscribe: (listener: () => void) => () => void;
};

function makeCanvasTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // CanvasTexture marks itself dirty immediately. The default canvas is 300×150, so drop that
  // version and upload only after the canvas matches the frame.
  texture.version = 0;
  texture.source.version = 0;
  return texture;
}

function publishTexture(texture: THREE.CanvasTexture, canvas: HTMLCanvasElement) {
  const width = canvas.width;
  const height = canvas.height;
  if (width < 1 || height < 1) return;
  const uploaded = texture.userData as { glWidth?: number; glHeight?: number };
  if (uploaded.glWidth !== width || uploaded.glHeight !== height) {
    // texStorage2D cannot grow. A later texSubImage2D of a larger JPEG overflows.
    if (uploaded.glWidth !== undefined) texture.dispose();
    uploaded.glWidth = width;
    uploaded.glHeight = height;
  }
  texture.needsUpdate = true;
}

function copyPanel(source: HTMLCanvasElement, target: HTMLCanvasElement, mode: "full" | "left" | "right") {
  const sw = mode === "full" ? source.width : Math.max(1, Math.floor(source.width / 2));
  const sx = mode === "right" ? source.width - sw : 0;
  if (target.width !== sw) target.width = sw;
  if (target.height !== source.height) target.height = source.height;
  const context = target.getContext("2d");
  if (!context) return;
  context.drawImage(source, sx, 0, sw, source.height, 0, 0, sw, source.height);
}

function useDeviceTexture(
  device: DeviceSpec,
  frame: ImageBitmap | null,
  status: ScreenState["status"],
  message: string,
  detail: string,
  time: string,
  apertura: number,
  orientation: Orientation,
  designImage: HTMLImageElement | null,
  designHold: boolean,
  designPending: boolean,
) {
  const canvas = useState(() => document.createElement("canvas"))[0];
  const leftCanvas = useState(() => document.createElement("canvas"))[0];
  const rightCanvas = useState(() => document.createElement("canvas"))[0];
  const texture = useMemo(() => makeCanvasTexture(canvas), [canvas]);
  const leftTexture = useMemo(() => makeCanvasTexture(leftCanvas), [leftCanvas]);
  const rightTexture = useMemo(() => makeCanvasTexture(rightCanvas), [rightCanvas]);
  const invalidate = useThree((state) => state.invalidate);
  const bounds = device.id === "iphone-duo" ? duoScreen(apertura) : { width: device.width, height: device.height, split: false as const };
  const reveal = useRef(0);
  const spin = useRef(0);
  const fadeStart = useRef<number | null>(null);
  const paintRef = useRef<(revealValue: number, spinValue: number) => void>(() => undefined);
  const designRef = useRef(designImage);
  const designHoldRef = useRef(designHold);
  const designPendingRef = useRef(designPending);
  const sourceKeyRef = useRef("");
  designRef.current = designImage;
  designHoldRef.current = designHold;
  designPendingRef.current = designPending;
  const sourceKey = !designHold
    ? "live"
    : designImage
      ? `ready:${designImage.src}`
      : designPending
        ? "loading"
        : "empty";

  const paint = (revealValue: number, spinValue: number) => {
    const design = designRef.current;
    if (designHoldRef.current) {
      const ready = design && design.naturalWidth > 0 && design.naturalHeight > 0 ? design : null;
      paintDesign(
        canvas,
        bounds.width,
        bounds.height,
        ready,
        ready?.naturalWidth ?? 0,
        ready?.naturalHeight ?? 0,
        designPendingRef.current && !ready ? 0 : revealValue,
        spinValue,
      );
    } else {
      if (frame && (frame.width < 1 || frame.height < 1)) return;
      paintScreen(
        canvas,
        device,
        frame,
        frame?.width ?? 0,
        frame?.height ?? 0,
        status,
        message,
        detail,
        bounds.width,
        bounds.height,
        isComputer(device) ? "portrait" : orientation,
        time,
        revealValue,
        spinValue,
      );
    }
    if (bounds.split) {
      copyPanel(canvas, leftCanvas, "left");
      copyPanel(canvas, rightCanvas, "right");
      publishTexture(leftTexture, leftCanvas);
      publishTexture(rightTexture, rightCanvas);
    } else {
      publishTexture(texture, canvas);
    }
  };
  paintRef.current = paint;

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const showing = Boolean(frame && frame.width >= 1 && frame.height >= 1);
    if (!sourceKeyRef.current) {
      sourceKeyRef.current = sourceKey;
    } else if (sourceKeyRef.current !== sourceKey) {
      sourceKeyRef.current = sourceKey;
      const waiting = sourceKey === "loading" || (sourceKey === "live" && !showing);
      if (waiting) {
        reveal.current = 0;
        fadeStart.current = null;
      } else if (reduce) {
        reveal.current = 1;
        fadeStart.current = null;
      } else {
        reveal.current = 0;
        fadeStart.current = performance.now();
      }
    } else if (!designHold) {
      if (!showing) {
        reveal.current = 0;
        fadeStart.current = null;
      } else if (reveal.current < 1 && fadeStart.current === null) {
        if (reduce) {
          reveal.current = 1;
        } else {
          fadeStart.current = performance.now();
          reveal.current = 0;
        }
      }
    }
    paint(reveal.current, spin.current);
    invalidate();
  }, [
    bounds.height,
    bounds.split,
    bounds.width,
    canvas,
    time,
    device,
    frame,
    invalidate,
    leftCanvas,
    leftTexture,
    detail,
    message,
    orientation,
    rightCanvas,
    rightTexture,
    designHold,
    designImage,
    designPending,
    sourceKey,
    status,
    texture,
  ]);

  useFrame((_, delta) => {
    if (reveal.current >= 1 && fadeStart.current === null) return;
    if (!designHoldRef.current && (status === "error" || status === "paused" || status === "empty")) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) spin.current = (spin.current + delta * 3.4) % (Math.PI * 2);
    if (fadeStart.current !== null) {
      const t = Math.min(1, (performance.now() - fadeStart.current) / 300);
      reveal.current = reduce ? 1 : 1 - (1 - t) ** 3;
      if (t >= 1 || reduce) fadeStart.current = null;
    } else if (reduce) {
      return;
    }
    paintRef.current(reveal.current, spin.current);
    invalidate();
  });

  useEffect(
    () => () => {
      texture.dispose();
      leftTexture.dispose();
      rightTexture.dispose();
    },
    [leftTexture, rightTexture, texture],
  );

  return { texture, leftTexture, rightTexture };
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const last = value.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function parseStop(value: string) {
  const match = value.trim().match(/^(.*)\s+([\d.]+)%$/);
  if (!match) return { color: value.trim(), offset: 0 };
  return { color: match[1].trim(), offset: Number(match[2]) / 100 };
}

function paintCssField(context: CanvasRenderingContext2D, css: string, width: number, height: number) {
  const layers = splitTopLevel(css);
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    const open = layer.indexOf("(");
    const close = layer.lastIndexOf(")");
    if (open < 0 || close < 0) continue;
    const kind = layer.slice(0, open);
    const args = splitTopLevel(layer.slice(open + 1, close));
    if (kind === "linear-gradient") {
      const angle = (Number.parseFloat(args[0]) * Math.PI) / 180;
      const dx = Math.sin(angle);
      const dy = -Math.cos(angle);
      const half = Math.abs((width / 2) * dx) + Math.abs((height / 2) * dy);
      const gradient = context.createLinearGradient(
        width / 2 - dx * half,
        height / 2 - dy * half,
        width / 2 + dx * half,
        height / 2 + dy * half,
      );
      for (const stop of args.slice(1).map(parseStop)) gradient.addColorStop(stop.offset, stop.color);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      continue;
    }
    if (kind !== "radial-gradient") continue;
    const head = args[0]?.match(/([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%/);
    if (!head) continue;
    const rx = (Number(head[1]) / 100) * width;
    const ry = (Number(head[2]) / 100) * height;
    const cx = (Number(head[3]) / 100) * width;
    const cy = (Number(head[4]) / 100) * height;
    if (rx < 0.5 || ry < 0.5) continue;
    context.save();
    context.translate(cx, cy);
    context.scale(rx, ry);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const stop of args.slice(1).map(parseStop)) {
      gradient.addColorStop(Math.min(1, Math.max(0, stop.offset)), stop.color);
    }
    context.fillStyle = gradient;
    context.fillRect(-cx / rx, -cy / ry, width / rx, height / ry);
    context.restore();
  }
}

const FIELD_WIDTH = 256;
const FIELD_HEIGHT = 144;
const BACKDROP_FADE_MS = 500;

const SRGB_TO_LINEAR = new Float32Array(256);
for (let index = 0; index < 256; index += 1) {
  const encoded = index / 255;
  SRGB_TO_LINEAR[index] =
    encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(linear: number) {
  const clamped = linear < 0 ? 0 : linear > 1 ? 1 : linear;
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

function makeFieldTexture(canvas: HTMLCanvasElement, solid = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  if (solid) texture.userData.solid = true;
  return texture;
}

const solidTextures = new Map<string, THREE.Texture>();

function solidTexture(hex: string) {
  const cached = solidTextures.get(hex);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = hex;
    context.fillRect(0, 0, 4, 4);
  }
  const texture = makeFieldTexture(canvas, true);
  solidTextures.set(hex, texture);
  return texture;
}

function cssBackgroundTexture(css: string) {
  const canvas = document.createElement("canvas");
  canvas.width = FIELD_WIDTH;
  canvas.height = FIELD_HEIGHT;
  const context = canvas.getContext("2d");
  const texture = makeFieldTexture(canvas);
  if (!context) return texture;
  paintCssField(context, css, FIELD_WIDTH, FIELD_HEIGHT);
  texture.needsUpdate = true;
  return texture;
}

function holdTexture(texture: THREE.Texture) {
  const data = texture.userData as { holds?: number; solid?: boolean };
  if (data.solid) return;
  data.holds = (data.holds ?? 0) + 1;
}

function dropTexture(texture: THREE.Texture | null) {
  if (!texture) return;
  const data = texture.userData as { holds?: number; solid?: boolean; gone?: boolean };
  const holds = data.holds ?? 0;
  if (data.solid || data.gone || holds <= 0) return;
  data.holds = holds - 1;
  if (data.holds > 0) return;
  data.gone = true;
  texture.dispose();
}

function syncHolds(
  prevFrom: THREE.Texture | null,
  prevTo: THREE.Texture | null,
  nextFrom: THREE.Texture,
  nextTo: THREE.Texture,
) {
  const previous = new Set<THREE.Texture>();
  if (prevFrom) previous.add(prevFrom);
  if (prevTo) previous.add(prevTo);
  const next = new Set<THREE.Texture>([nextFrom, nextTo]);
  for (const texture of next) {
    if (!previous.has(texture)) holdTexture(texture);
  }
  for (const texture of previous) {
    if (!next.has(texture)) dropTexture(texture);
  }
}

function textureSource(texture: THREE.Texture) {
  const image = texture.image as CanvasImageSource | undefined;
  if (!image) return null;
  if (image instanceof HTMLCanvasElement) return image.width > 0 ? image : null;
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    return image.naturalWidth > 0 ? image : null;
  }
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return image.width > 0 ? image : null;
  }
  return null;
}

function snapshotBlend(from: THREE.Texture, to: THREE.Texture, amount: number) {
  const fromSource = textureSource(from);
  const toSource = textureSource(to);
  if (!fromSource || !toSource) return null;
  const scratch = document.createElement("canvas");
  scratch.width = FIELD_WIDTH;
  scratch.height = FIELD_HEIGHT;
  const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
  if (!scratchContext) return null;
  const read = (source: CanvasImageSource) => {
    scratchContext.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    scratchContext.drawImage(source, 0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    return scratchContext.getImageData(0, 0, FIELD_WIDTH, FIELD_HEIGHT).data;
  };
  const before = read(fromSource);
  const after = read(toSource);
  const canvas = document.createElement("canvas");
  canvas.width = FIELD_WIDTH;
  canvas.height = FIELD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(FIELD_WIDTH, FIELD_HEIGHT);
  const output = image.data;
  const keep = 1 - amount;
  for (let index = 0; index < output.length; index += 4) {
    output[index] = linearToSrgbByte(SRGB_TO_LINEAR[before[index]] * keep + SRGB_TO_LINEAR[after[index]] * amount);
    output[index + 1] = linearToSrgbByte(
      SRGB_TO_LINEAR[before[index + 1]] * keep + SRGB_TO_LINEAR[after[index + 1]] * amount,
    );
    output[index + 2] = linearToSrgbByte(
      SRGB_TO_LINEAR[before[index + 2]] * keep + SRGB_TO_LINEAR[after[index + 2]] * amount,
    );
    output[index + 3] = Math.round(before[index + 3] * keep + after[index + 3] * amount);
  }
  context.putImageData(image, 0, 0);
  return makeFieldTexture(canvas);
}

const BACKDROP_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const BACKDROP_FRAGMENT = /* glsl */ `
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uMix;
varying vec2 vUv;
void main() {
  vec4 fromColor = texture2D(uFrom, vUv);
  vec4 toColor = texture2D(uTo, vUv);
  gl_FragColor = mix(fromColor, toColor, uMix);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function createBackdropMaterial(initial: THREE.Texture) {
  return new THREE.ShaderMaterial({
    name: "stage-backdrop",
    uniforms: {
      uFrom: { value: initial },
      uTo: { value: initial },
      uMix: { value: 1 },
    },
    vertexShader: BACKDROP_VERTEX,
    fragmentShader: BACKDROP_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
}

function useUploadedBackground(image: string | null) {
  const [photo, setPhoto] = useState<{ url: string; texture: THREE.Texture } | null>(null);
  const photoRef = useRef(photo);
  const hookHeld = useRef<THREE.Texture | null>(null);

  function hookHold(texture: THREE.Texture | null) {
    if (hookHeld.current === texture) return;
    dropTexture(hookHeld.current);
    hookHeld.current = texture;
    if (texture) holdTexture(texture);
  }

  useEffect(() => {
    const current = photoRef.current;
    if (!image) {
      hookHold(null);
      return;
    }
    if (current?.url === image) return;
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.load(image, (next) => {
      next.colorSpace = THREE.SRGBColorSpace;
      next.magFilter = THREE.LinearFilter;
      next.minFilter = THREE.LinearFilter;
      next.generateMipmaps = false;
      next.needsUpdate = true;
      if (!alive) {
        next.dispose();
        return;
      }
      const record = { url: image, texture: next };
      photoRef.current = record;
      hookHold(next);
      setPhoto(record);
    });
    return () => {
      alive = false;
    };
  }, [image]);

  useEffect(() => () => hookHold(null), []);

  if (!image || photo?.url !== image) return null;
  return photo.texture;
}

function SceneBackground({
  background,
  image,
}: {
  background: BackgroundId;
  image: string | null;
}) {
  const spec = BACKGROUNDS.find((item) => item.id === background) ?? BACKGROUNDS[0];
  const painted = !image && spec.color === null ? spec.css : null;
  const cssTexture = useMemo(() => (painted ? cssBackgroundTexture(painted) : null), [painted]);
  const photo = useUploadedBackground(image);
  const target = image ? photo : (cssTexture ?? solidTexture(spec.color ?? "#ffffff"));
  const invalidate = useThree((state) => state.invalidate);
  const scene = useThree((state) => state.scene);
  const geometry = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  const material = useMemo(() => createBackdropMaterial(solidTexture("#ffffff")), []);
  const fromTex = useRef<THREE.Texture | null>(null);
  const toTex = useRef<THREE.Texture | null>(null);
  const mix = useRef(1);
  const fading = useRef(false);
  const started = useRef(0);

  useLayoutEffect(() => {
    scene.background = null;
  }, [scene]);

  useLayoutEffect(() => {
    if (!target) return;
    const previousFrom = fromTex.current;
    const previousTo = toTex.current;
    const amount = mix.current;
    if (previousTo === target && amount >= 0.999) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let departing = previousTo;
    if (previousFrom && previousTo && previousFrom !== previousTo && amount <= 0.001) {
      departing = previousFrom;
    } else if (
      !reduced &&
      previousFrom &&
      previousTo &&
      previousFrom !== previousTo &&
      amount < 0.999
    ) {
      departing = snapshotBlend(previousFrom, previousTo, amount) ?? previousTo;
    }
    if (!departing || reduced) departing = target;

    syncHolds(previousFrom, previousTo, departing, target);
    fromTex.current = departing;
    toTex.current = target;
    if (reduced || departing === target || !previousTo) {
      mix.current = 1;
      fading.current = false;
    } else {
      mix.current = 0;
      fading.current = true;
      started.current = performance.now();
    }
    material.uniforms.uFrom.value = departing;
    material.uniforms.uTo.value = target;
    material.uniforms.uMix.value = mix.current;
    invalidate();
  }, [invalidate, material, target]);

  useFrame(() => {
    if (!fading.current) return;
    const t = Math.min(1, (performance.now() - started.current) / BACKDROP_FADE_MS);
    const eased = 1 - (1 - t) ** 3;
    mix.current = eased;
    material.uniforms.uMix.value = eased;
    if (t < 1) {
      invalidate();
      return;
    }
    fading.current = false;
    const from = fromTex.current;
    const to = toTex.current;
    if (from && to && from !== to) {
      syncHolds(from, to, to, to);
      fromTex.current = to;
      material.uniforms.uFrom.value = to;
    }
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      const from = fromTex.current;
      const to = toTex.current;
      fromTex.current = null;
      toTex.current = null;
      dropTexture(from);
      if (to !== from) dropTexture(to);
    },
    [geometry, material],
  );

  return (
    <mesh
      name="stage-backdrop"
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-1000}
      raycast={() => {}}
    />
  );
}

function downloadPng(href: string, name: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function frameShot(source: HTMLCanvasElement, aspect: number) {
  const sw = source.width;
  const sh = source.height;
  const srcAspect = sw / Math.max(1, sh);
  const tw = srcAspect > aspect ? sw : Math.round(sh * aspect);
  const th = srcAspect > aspect ? Math.round(sw / aspect) : sh;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, tw);
  canvas.height = Math.max(1, th);
  const context = canvas.getContext("2d");
  if (!context) return source.toDataURL("image/png");
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const probeContext = probe.getContext("2d", { willReadFrequently: true });
  if (probeContext) {
    probeContext.drawImage(source, 0, 0, 1, 1, 0, 0, 1, 1);
    const pixel = probeContext.getImageData(0, 0, 1, 1).data;
    context.fillStyle = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
  } else {
    context.fillStyle = "#ffffff";
  }
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / sw, canvas.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  context.drawImage(source, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  return canvas.toDataURL("image/png");
}

function SoftShadow({ y, strength, width }: { y: number; strength: number; width: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    const map = new THREE.CanvasTexture(canvas);
    if (!context) return map;
    const gradient = context.createRadialGradient(256, 256, 30, 256, 256, 250);
    gradient.addColorStop(0, "rgba(0,0,0,0.5)");
    gradient.addColorStop(0.32, "rgba(0,0,0,0.2)");
    gradient.addColorStop(0.68, "rgba(0,0,0,0.05)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 512);
    map.needsUpdate = true;
    return map;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0.05]}>
      <planeGeometry args={[Math.max(3.2, width), 1.55]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        opacity={Math.min(Math.max(strength, 0), 1)}
        toneMapped={false}
      />
    </mesh>
  );
}

function ExportBridge({
  exportRef,
}: {
  exportRef: MutableRefObject<((mode: ShotMode) => void) | null>;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    exportRef.current = (mode: ShotMode) => {
      const previous = scene.background;
      const clear = new THREE.Color();
      gl.getClearColor(clear);
      const clearAlpha = gl.getClearAlpha();
      const backdrop = scene.getObjectByName("stage-backdrop");
      const backdropVisible = backdrop?.visible ?? true;
      if (mode === "transparent") {
        scene.background = null;
        if (backdrop) backdrop.visible = false;
        gl.setClearColor(0x000000, 0);
      }
      gl.render(scene, camera);
      const source = gl.domElement;
      if (mode === "square" || mode === "story") {
        downloadPng(frameShot(source, mode === "square" ? 1 : 9 / 16), mode === "square" ? "mockup-square.png" : "mockup-story.png");
      } else {
        downloadPng(source.toDataURL("image/png"), mode === "transparent" ? "mockup-transparent.png" : "mockup.png");
      }
      if (mode === "transparent") {
        scene.background = previous;
        if (backdrop) backdrop.visible = backdropVisible;
        gl.setClearColor(clear, clearAlpha);
        gl.render(scene, camera);
      }
    };
    return () => {
      exportRef.current = null;
    };
  }, [camera, exportRef, gl, scene]);

  return null;
}

function FrameCamera({ span, insetLeft }: { span: number; insetLeft: number }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const controls = useThree((state) => state.controls) as
    | { target: THREE.Vector3; update: () => void; maxDistance?: number }
    | null;

  useEffect(() => {
    const shift = size.width < 900 ? Math.min(insetLeft, size.width * 0.5) : 0;
    const gutter = shift > 120 ? 24 : 8;
    const room = Math.max(150, size.width - shift - (shift > 0 ? gutter : 0));
    const distance = Math.max(13.6, span * 2.75) * (shift > 0 ? size.width / room : 1);
    const azimuth = 0.62;
    camera.position.set(Math.sin(azimuth) * distance, distance * 0.2, Math.cos(azimuth) * distance);
    camera.lookAt(0, 0, 0);
    Object.assign(camera.userData, { home: camera.position.clone() });
    if (shift > 0 && size.height > 0) {
      camera.setViewOffset(size.width, size.height, -shift, 0, size.width, size.height);
    } else {
      camera.clearViewOffset();
    }
    if (controls) {
      controls.maxDistance = Math.max(26, distance + 2);
      controls.target.set(0, 0, 0);
      controls.update();
    }
    invalidate();
  }, [camera, controls, insetLeft, invalidate, size.height, size.width, span]);

  return null;
}

function readHit(object: THREE.Object3D) {
  const data = object.userData as {
    screen?: boolean;
    panel?: ScreenPanel;
    screenWidth?: number;
    screenHeight?: number;
    topInset?: number;
    bottomInset?: number;
    glassWidth?: number;
    cutout?: "notch" | "island" | "hole" | "none";
    landscapeStatus?: number;
  };
  if (!data.screen || !data.panel) return null;
  if (
    typeof data.screenWidth !== "number" ||
    typeof data.screenHeight !== "number" ||
    typeof data.topInset !== "number" ||
    typeof data.bottomInset !== "number"
  ) {
    return null;
  }
  return data;
}

function ScreenPointer({
  viewportWidth,
  viewportHeight,
  orientation,
  interactive,
  onInput,
}: {
  viewportWidth: number;
  viewportHeight: number;
  orientation: Orientation;
  interactive: boolean;
  onInput: (input: ScreenInput) => void;
}) {
  const { camera, gl, scene, controls } = useThree();
  const onInputRef = useRef(onInput);
  const sizeRef = useRef({ viewportWidth, viewportHeight, orientation });
  const interactiveRef = useRef(interactive);

  useEffect(() => {
    onInputRef.current = onInput;
    sizeRef.current = { viewportWidth, viewportHeight, orientation };
    interactiveRef.current = interactive;
  });

  useEffect(() => {
    const dom = gl.domElement;
    dom.style.touchAction = "none";
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoverFrame = 0;
    let wheelFrame = 0;
    let wheelX = 0;
    let wheelY = 0;
    let wheelCssX = 0;
    let wheelCssY = 0;
    type GlassDrag = {
      id: number;
      startClientX: number;
      startClientY: number;
      lastClientX: number;
      lastClientY: number;
      cssX: number;
      cssY: number;
      mxX: number;
      mxY: number;
      myX: number;
      myY: number;
      moved: boolean;
    };
    let drag: GlassDrag | null = null;

    const orbit = () => controls as { enabled?: boolean } | null;

    function pickClient(clientX: number, clientY: number) {
      const rect = dom.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const targets: THREE.Object3D[] = [];
      scene.traverse((object) => {
        if (object.userData?.screen) targets.push(object);
      });
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (!hit?.uv || !hit.object) return null;
      const data = readHit(hit.object);
      if (!data || !data.panel) return null;
      const css = uvToCss(
        {
          u: hit.uv.x,
          v: hit.uv.y,
          panel: data.panel,
          screenWidth: data.screenWidth ?? 0,
          screenHeight: data.screenHeight ?? 0,
          topInset: data.topInset ?? 0,
          bottomInset: data.bottomInset ?? 0,
          glassWidth: data.glassWidth,
          cutout: data.cutout,
          landscapeStatus: data.landscapeStatus,
        },
        sizeRef.current.viewportWidth,
        sizeRef.current.viewportHeight,
        sizeRef.current.orientation,
      );
      return { css, onGlass: true as const };
    }

    function pick(event: PointerEvent | WheelEvent) {
      return pickClient(event.clientX, event.clientY);
    }

    function pageScale(clientX: number, clientY: number, css: { x: number; y: number }) {
      const sample = 18;
      const right = pickClient(clientX + sample, clientY)?.css;
      const down = pickClient(clientX, clientY + sample)?.css;
      const mxX = right ? (right.x - css.x) / sample : 1;
      const mxY = right ? (right.y - css.y) / sample : 0;
      const myX = down ? (down.x - css.x) / sample : 0;
      const myY = down ? (down.y - css.y) / sample : 1;
      const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
      return {
        mxX: finite(mxX, 1),
        mxY: finite(mxY, 0),
        myX: finite(myX, 0),
        myY: finite(myY, 1),
      };
    }

    function queueWheel(x: number, y: number, deltaX: number, deltaY: number) {
      wheelCssX = x;
      wheelCssY = y;
      wheelX += deltaX;
      wheelY += deltaY;
      if (wheelFrame) return;
      wheelFrame = requestAnimationFrame(() => {
        wheelFrame = 0;
        const deltaX = wheelX;
        const deltaY = wheelY;
        wheelX = 0;
        wheelY = 0;
        if (Math.abs(deltaX) < 0.2 && Math.abs(deltaY) < 0.2) return;
        onInputRef.current({
          action: "wheel",
          x: wheelCssX,
          y: wheelCssY,
          button: 0,
          deltaX,
          deltaY,
        });
      });
    }

    function endDrag(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return;
      event.preventDefault();
      if (!drag.moved) {
        onInputRef.current({ action: "down", x: drag.cssX, y: drag.cssY, button: 0 });
        onInputRef.current({ action: "up", x: drag.cssX, y: drag.cssY, button: 0 });
      }
      drag = null;
      if (dom.hasPointerCapture(event.pointerId)) dom.releasePointerCapture(event.pointerId);
      const current = orbit();
      if (current) current.enabled = true;
    }

    function onPointerDown(event: PointerEvent) {
      if (!interactiveRef.current) return;
      if (drag || !event.isPrimary) return;
      if (event.pointerType !== "touch" && event.button !== 0) return;
      const hit = pick(event);
      if (!hit?.css) {
        const current = orbit();
        if (current) current.enabled = true;
        return;
      }
      event.preventDefault();
      const current = orbit();
      if (current) current.enabled = false;
      const scale = pageScale(event.clientX, event.clientY, hit.css);
      drag = {
        id: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        cssX: hit.css.x,
        cssY: hit.css.y,
        ...scale,
        moved: false,
      };
      dom.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (drag && event.pointerId === drag.id) {
        event.preventDefault();
        const dx = event.clientX - drag.lastClientX;
        const dy = event.clientY - drag.lastClientY;
        drag.lastClientX = event.clientX;
        drag.lastClientY = event.clientY;
        const travel = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
        if (!drag.moved) {
          if (travel < 8) return;
          drag.moved = true;
        }
        const deltaCssX = dx * drag.mxX + dy * drag.myX;
        const deltaCssY = dx * drag.mxY + dy * drag.myY;
        const width = sizeRef.current.viewportWidth;
        const height = sizeRef.current.viewportHeight;
        drag.cssX = Math.min(width - 0.01, Math.max(0, drag.cssX + deltaCssX));
        drag.cssY = Math.min(height - 0.01, Math.max(0, drag.cssY + deltaCssY));
        queueWheel(drag.cssX, drag.cssY, -deltaCssX, -deltaCssY);
        return;
      }
      if (!interactiveRef.current) {
        // Move mode grabs the device itself, so the glass hands every pointer back to the controls.
        const current = orbit();
        if (current) current.enabled = true;
        return;
      }
      if (event.buttons > 0) return;
      const hit = pick(event);
      const current = orbit();
      if (!hit) {
        if (current) current.enabled = true;
        return;
      }
      if (current) current.enabled = false;
      if (!hit.css) return;
      const now = performance.now();
      if (now - hoverFrame < 32) return;
      hoverFrame = now;
      onInputRef.current({
        action: "move",
        x: hit.css.x,
        y: hit.css.y,
        button: event.button,
      });
    }

    function onWheel(event: WheelEvent) {
      if (!interactiveRef.current) return;
      const hit = pick(event);
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!hit.css) return;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
      onInputRef.current({
        action: "wheel",
        x: hit.css.x,
        y: hit.css.y,
        button: 0,
        deltaX: event.deltaX * scale,
        deltaY: event.deltaY * scale,
      });
    }

    function onTouchMove(event: TouchEvent) {
      event.preventDefault();
    }

    dom.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
    dom.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    dom.addEventListener("pointerup", endDrag, { capture: true, passive: false });
    dom.addEventListener("pointercancel", endDrag, { capture: true, passive: false });
    dom.addEventListener("wheel", onWheel, { capture: true, passive: false });
    dom.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      if (wheelFrame) cancelAnimationFrame(wheelFrame);
      dom.removeEventListener("pointerdown", onPointerDown, true);
      dom.removeEventListener("pointermove", onPointerMove, true);
      dom.removeEventListener("pointerup", endDrag, true);
      dom.removeEventListener("pointercancel", endDrag, true);
      dom.removeEventListener("wheel", onWheel, true);
      dom.removeEventListener("touchmove", onTouchMove);
    };
  }, [camera, controls, gl, scene]);

  return null;
}

const SHOT_SECONDS = 5;
const RADIUS_MIN = 7.15;
const RADIUS_MAX = 25.6;

type CameraPose = { theta: number; phi: number; radius: number };

type OrbitState = {
  target: THREE.Vector3;
  enableDamping: boolean;
  autoRotate: boolean;
};

function easeInOut(amount: number) {
  const t = Math.min(1, Math.max(0, amount));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function fitDistance(width: number, height: number, fov: number, aspect: number, margin: number) {
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * Math.max(aspect, 0.6);
  const vertical = (height * margin) / (2 * tanV);
  const horizontal = (width * margin) / (2 * tanH);
  return Math.max(vertical, horizontal);
}

function clampRadius(radius: number) {
  return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, radius));
}

function shotPoses(id: CinematicId, close: number, wide: number): { from: CameraPose; to: CameraPose } {
  const front: CameraPose = { theta: 0.04, phi: 1.5, radius: close };
  const hero: CameraPose = { theta: 0.66, phi: 1.3, radius: wide };
  if (id === "pull-back") return { from: front, to: hero };
  if (id === "push-in") return { from: hero, to: front };
  if (id === "orbit") {
    return {
      from: { theta: 0.04, phi: 1.28, radius: wide },
      to: { theta: 0.04 + Math.PI, phi: 1.28, radius: wide },
    };
  }
  if (id === "reveal") {
    return {
      from: { theta: Math.PI, phi: 1.16, radius: clampRadius(Math.min(wide, close * 1.55)) },
      to: { theta: 0.04, phi: 1.48, radius: clampRadius(Math.min(wide * 0.82, close * 1.16)) },
    };
  }
  return {
    from: { theta: 0.18, phi: 1.52, radius: clampRadius(wide * 0.94) },
    to: hero,
  };
}

function lerpPose(from: CameraPose, to: CameraPose, amount: number): CameraPose {
  return {
    theta: from.theta + (to.theta - from.theta) * amount,
    phi: from.phi + (to.phi - from.phi) * amount,
    radius: from.radius + (to.radius - from.radius) * amount,
  };
}

function placeCamera(camera: THREE.Camera, controls: OrbitState | null, pose: CameraPose) {
  const target = controls?.target ?? new THREE.Vector3();
  target.set(0, 0, 0);
  const sinPhi = Math.sin(pose.phi);
  camera.position.set(
    pose.radius * sinPhi * Math.sin(pose.theta),
    pose.radius * Math.cos(pose.phi),
    pose.radius * sinPhi * Math.cos(pose.theta),
  );
  camera.lookAt(target);
}

function Cinematic({
  shot,
  device,
  apertura,
  orientation,
  onEnd,
}: {
  shot: CinematicShot | null;
  device: DeviceSpec;
  apertura: number;
  orientation: Orientation;
  onEnd: () => void;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const controls = useThree((state) => state.controls) as OrbitState | null;
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const run = useRef<{ from: CameraPose; to: CameraPose; elapsed: number } | null>(null);
  const controlsRef = useRef(controls);
  const onEndRef = useRef(onEnd);
  const framingRef = useRef({ device, orientation, apertura, width: size.width, height: size.height });
  controlsRef.current = controls;
  onEndRef.current = onEnd;
  framingRef.current = { device, orientation, apertura, width: size.width, height: size.height };

  useEffect(() => {
    if (!shot) {
      run.current = null;
      if (controlsRef.current) controlsRef.current.enableDamping = true;
      return;
    }
    const framing = framingRef.current;
    const screen = deviceScreenSize(framing.device, framing.orientation, framing.apertura);
    const aspect = framing.height > 0 ? framing.width / framing.height : 1.4;
    const close = clampRadius(fitDistance(screen.width, screen.height, camera.fov, aspect, 1.05));
    const wide = clampRadius(Math.max(close + 3.4, close * 1.7, Math.max(screen.width, screen.height) * 2.7));
    const poses = shotPoses(shot.id, close, wide);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      placeCamera(camera, controlsRef.current, poses.to);
      run.current = null;
      if (controlsRef.current) controlsRef.current.enableDamping = true;
      invalidate();
      onEndRef.current();
      return;
    }
    run.current = { from: poses.from, to: poses.to, elapsed: 0 };
    placeCamera(camera, controlsRef.current, poses.from);
    invalidate();
  }, [camera, invalidate, shot]);

  useEffect(() => {
    const dom = gl.domElement;
    const grab = () => {
      if (!run.current) return;
      run.current = null;
      if (controlsRef.current) controlsRef.current.enableDamping = true;
      onEndRef.current();
    };
    dom.addEventListener("pointerdown", grab);
    return () => dom.removeEventListener("pointerdown", grab);
  }, [gl]);

  useEffect(() => {
    return () => {
      if (controlsRef.current) controlsRef.current.enableDamping = true;
    };
  }, []);

  useFrame((_, delta) => {
    const current = run.current;
    const orbit = controlsRef.current;
    if (!current || !orbit) return;
    orbit.enableDamping = false;
    orbit.autoRotate = false;
    current.elapsed += Math.min(delta, 0.05);
    const done = current.elapsed >= SHOT_SECONDS;
    const amount = done ? 1 : easeInOut(current.elapsed / SHOT_SECONDS);
    placeCamera(camera, orbit, lerpPose(current.from, current.to, amount));
    invalidate();
    if (!done) return;
    run.current = null;
    orbit.enableDamping = true;
    onEndRef.current();
  });

  return null;
}

function Turntable({ enabled }: { enabled: boolean }) {
  const controls = useThree((state) => state.controls) as {
    autoRotate: boolean;
    autoRotateSpeed: number;
  } | null;
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const speed = useRef(0);
  const pointers = useRef(0);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
    invalidate();
  }, [enabled, invalidate]);

  useEffect(() => {
    const dom = gl.domElement;
    const down = () => {
      pointers.current += 1;
      invalidate();
    };
    const up = () => {
      pointers.current = Math.max(0, pointers.current - 1);
      invalidate();
    };
    dom.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      dom.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [gl, invalidate]);

  useFrame((_, delta) => {
    if (!controls) return;
    const target = enabledRef.current && pointers.current === 0 ? 1 : 0;
    const next = speed.current + (target - speed.current) * (1 - Math.exp(-2.8 * delta));
    const settled = Math.abs(target - next) < 0.003;
    speed.current = settled ? target : next;
    controls.autoRotate = speed.current > 0.003;
    controls.autoRotateSpeed = 1.6 * speed.current;
    if (!settled || speed.current > 0.003) invalidate();
  }, -2);

  return null;
}

const VIEW_SECONDS = 0.32;
// How far from the centre the device may travel, as a share of the visible half-frame.
const PAN_REACH = 0.42;

type ViewControls = {
  target: THREE.Vector3;
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
};

function clampFocus(camera: THREE.PerspectiveCamera, focus: THREE.Vector3, distance: number, depth: number) {
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
  const halfHeight = distance * Math.tan((camera.fov * Math.PI) / 360) * PAN_REACH;
  const halfWidth = halfHeight * camera.aspect;
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));
  return new THREE.Vector3()
    .addScaledVector(right, clamp(focus.dot(right), halfWidth))
    .addScaledVector(up, clamp(focus.dot(up), halfHeight))
    .addScaledVector(forward, clamp(focus.dot(forward), depth));
}

function homePosition(camera: THREE.Camera) {
  const home = camera.userData.home;
  return home instanceof THREE.Vector3 ? home : new THREE.Vector3();
}

function ViewRig({
  span,
  viewRef,
}: {
  span: number;
  viewRef: MutableRefObject<ViewApi | null>;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const controls = useThree((state) => state.controls) as ViewControls | null;
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const tween = useRef<{
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    elapsed: number;
  } | null>(null);
  const listeners = useRef(new Set<() => void>());
  const last = useRef<ViewState>({ zoom: 1, home: true });
  const limit = Math.max(2, span * 0.8);
  const limitRef = useRef(limit);

  useEffect(() => {
    limitRef.current = limit;
  }, [limit]);

  useEffect(() => {
    const target = () => controls?.target ?? new THREE.Vector3();


    function move(toPosition: THREE.Vector3, toTarget: THREE.Vector3) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        tween.current = null;
        target().copy(toTarget);
        camera.position.copy(toPosition);
        camera.lookAt(toTarget);
      } else {
        tween.current = {
          fromPosition: camera.position.clone(),
          toPosition,
          fromTarget: target().clone(),
          toTarget,
          elapsed: 0,
        };
      }
      invalidate();
    }

    function settled() {
      const current = tween.current;
      return current
        ? { position: current.toPosition.clone(), target: current.toTarget.clone() }
        : { position: camera.position.clone(), target: target().clone() };
    }

    viewRef.current = {
      zoomBy(factor) {
        const { position, target: focus } = settled();
        const offset = position.clone().sub(focus);
        const min = controls?.minDistance ?? RADIUS_MIN;
        const max = controls?.maxDistance ?? RADIUS_MAX;
        const distance = Math.min(max, Math.max(min, offset.length() / factor));
        move(focus.clone().add(offset.setLength(distance)), focus);
      },
      panBy(x, y) {
        const { position, target: focus } = settled();
        const height = 2 * position.distanceTo(focus) * Math.tan((camera.fov * Math.PI) / 360);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const wanted = focus
          .clone()
          .addScaledVector(right, -x * height)
          .addScaledVector(up, -y * height);
        const next = clampFocus(camera, wanted, position.distanceTo(focus), limitRef.current);
        move(position.clone().add(next.clone().sub(focus)), next);
      },
      reset() {
        move(homePosition(camera).clone(), new THREE.Vector3());
      },
      read: () => last.current,
      subscribe(listener) {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    };
    return () => {
      viewRef.current = null;
    };
  }, [camera, controls, invalidate, viewRef]);

  useEffect(() => {
    // Grabbing the scene takes over from a running zoom or reset.
    const dom = gl.domElement;
    const stop = () => {
      tween.current = null;
    };
    dom.addEventListener("pointerdown", stop);
    dom.addEventListener("wheel", stop, { passive: true });
    return () => {
      dom.removeEventListener("pointerdown", stop);
      dom.removeEventListener("wheel", stop);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const focus = controls?.target;
    if (!focus) return;
    const current = tween.current;
    if (current) {
      current.elapsed += Math.min(delta, 0.05);
      const amount = easeInOut(current.elapsed / VIEW_SECONDS);
      focus.lerpVectors(current.fromTarget, current.toTarget, amount);
      camera.position.lerpVectors(current.fromPosition, current.toPosition, amount);
      camera.lookAt(focus);
      if (current.elapsed >= VIEW_SECONDS) tween.current = null;
      invalidate();
    } else if (focus.lengthSq() > 1e-8) {
      // Panning stops before the device leaves the frame.
      const kept = clampFocus(camera, focus, camera.position.distanceTo(focus), limitRef.current);
      if (kept.distanceToSquared(focus) > 1e-8) {
        camera.position.add(kept.clone().sub(focus));
        focus.copy(kept);
        camera.lookAt(focus);
      }
    }

    const home = homePosition(camera);
    const homeDistance = home.length();
    const distance = camera.position.distanceTo(focus);
    const next: ViewState = {
      zoom: homeDistance > 0 && distance > 0 ? Math.round((homeDistance / distance) * 100) / 100 : 1,
      home: focus.length() < 0.01 && camera.position.distanceTo(home) < 0.05,
    };
    if (next.zoom === last.current.zoom && next.home === last.current.home) return;
    last.current = next;
    listeners.current.forEach((listener) => listener());
  });

  return null;
}

const ORBIT_MOUSE = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
const MOVE_MOUSE = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
const ORBIT_TOUCH = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
const MOVE_TOUCH = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

function Stage({
  device,
  screen,
  frame,
  apertura,
  orientation,
  light,
  background,
  backgroundImage,
  finish,
  time,
  autoRotate,
  logoLight,
  cinematic,
  onCinematicEnd,
  exportRef,
  onInput,
  insetLeft,
  designImage,
  designHold,
  designPending,
  tool,
  viewRef,
}: {
  device: DeviceSpec;
  screen: ScreenState;
  frame: ImageBitmap | null;
  apertura: number;
  orientation: Orientation;
  light: number;
  background: BackgroundId;
  backgroundImage: string | null;
  finish: FinishSpec;
  time: string;
  autoRotate: boolean;
  logoLight: boolean;
  cinematic: CinematicShot | null;
  onCinematicEnd: () => void;
  exportRef: MutableRefObject<((mode: ShotMode) => void) | null>;
  onInput: (input: ScreenInput) => void;
  insetLeft: number;
  designImage: HTMLImageElement | null;
  designHold: boolean;
  designPending: boolean;
  tool: ViewTool;
  viewRef: MutableRefObject<ViewApi | null>;
}) {
  const { texture, leftTexture, rightTexture } = useDeviceTexture(
    device,
    frame,
    screen.status,
    screen.message,
    screen.detail ?? "",
    time,
    apertura,
    orientation,
    designImage,
    designHold,
    designPending,
  );
  const viewport = liveViewport(device, apertura, orientation);
  const span = deviceSpan(device, apertura);
  const foot = deviceFoot(device, orientation, apertura);
  const turned = orientation === "landscape" && !isComputer(device) && device.kind !== "watch";
  const shadowWidth = isComputer(device)
    ? Math.max(4.4, span * 0.9)
    : device.id === "iphone-duo" && isDuoOpen(apertura)
      ? 6.2
      : 3.6;

  return (
    <>
      <SceneBackground background={background} image={backgroundImage} />
      <ExportBridge exportRef={exportRef} />
      <FrameCamera span={span} insetLeft={insetLeft} />
      <ambientLight intensity={0.55 * light} />
      <hemisphereLight args={["#f4f4f2", "#d5d5d2", 0.4 * light]} />
      <directionalLight position={[3.4, 5.2, 4.2]} intensity={1.25 * light} />
      <directionalLight position={[-3.2, 2.4, 2.2]} intensity={0.38 * light} />
      <directionalLight position={[-1.6, 3.2, -5.4]} intensity={0.9 * light} />
      <group rotation={[0, 0, turned ? Math.PI / 2 : 0]}>
        <DeviceModel
          device={device}
          texture={texture}
          leftTexture={leftTexture}
          rightTexture={rightTexture}
          status={screen.status}
          apertura={apertura}
          finish={finish}
          logoLight={logoLight}
        />
      </group>
      <SoftShadow
        y={-foot / 2 - 0.012}
        strength={0.9 * Math.min(Math.max(light, 0), 1.3)}
        width={shadowWidth}
      />
      <OrbitControls
        makeDefault
        enablePan
        screenSpacePanning
        mouseButtons={tool === "move" ? MOVE_MOUSE : ORBIT_MOUSE}
        touches={tool === "move" ? MOVE_TOUCH : ORBIT_TOUCH}
        enableDamping
        dampingFactor={0.08}
        minDistance={7}
        maxDistance={26}
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
        minAzimuthAngle={-Infinity}
        maxAzimuthAngle={Infinity}
      />
      <ViewRig span={span} viewRef={viewRef} />
      <Turntable enabled={autoRotate && !cinematic} />
      <Cinematic
        shot={cinematic}
        device={device}
        apertura={apertura}
        orientation={orientation}
        onEnd={onCinematicEnd}
      />
      <ScreenPointer
        viewportWidth={viewport.width}
        viewportHeight={viewport.height}
        orientation={turned ? "landscape" : "portrait"}
        interactive={tool === "orbit"}
        onInput={onInput}
      />
    </>
  );
}

export default function Scene({
  device,
  screen,
  frame,
  apertura,
  orientation,
  light,
  background,
  backgroundImage,
  finish,
  time,
  autoRotate,
  logoLight,
  cinematic,
  onCinematicEnd,
  exportRef,
  onInput,
  insetLeft,
  designImage,
  designHold,
  designPending,
  tool,
  viewRef,
}: {
  device: DeviceSpec;
  screen: ScreenState;
  frame: ImageBitmap | null;
  apertura: number;
  orientation: Orientation;
  light: number;
  background: BackgroundId;
  backgroundImage: string | null;
  finish: FinishSpec;
  time: string;
  autoRotate: boolean;
  logoLight: boolean;
  cinematic: CinematicShot | null;
  onCinematicEnd: () => void;
  exportRef: MutableRefObject<((mode: ShotMode) => void) | null>;
  onInput: (input: ScreenInput) => void;
  insetLeft: number;
  designImage: HTMLImageElement | null;
  designHold: boolean;
  designPending: boolean;
  tool: ViewTool;
  viewRef: MutableRefObject<ViewApi | null>;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop="demand"
      camera={{ position: [7.6, 2.6, 10.4], fov: 28 }}
      gl={{
        preserveDrawingBuffer: true,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.domElement.style.touchAction = "none";
      }}
    >
      <Suspense fallback={null}>
        <Stage
          device={device}
          screen={screen}
          frame={frame}
          apertura={apertura}
          orientation={orientation}
          light={light}
          background={background}
          backgroundImage={backgroundImage}
          finish={finish}
          time={time}
          autoRotate={autoRotate}
          logoLight={logoLight}
          cinematic={cinematic}
          onCinematicEnd={onCinematicEnd}
          exportRef={exportRef}
          onInput={onInput}
          insetLeft={insetLeft}
          designImage={designImage}
          designHold={designHold}
          designPending={designPending}
          tool={tool}
          viewRef={viewRef}
        />
      </Suspense>
    </Canvas>
  );
}
