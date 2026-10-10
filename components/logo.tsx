"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const MASK_SRC = "/apple-logo.png";
const CORE_SCALE = 1.62;
const HALO_SCALE = 3.05;

type LogoMaps = {
  mask: THREE.Texture;
  core: THREE.Texture;
  halo: THREE.Texture;
  aspect: number;
};

let cached: LogoMaps | null = null;
let loading: Promise<LogoMaps> | null = null;

function textureFromCanvas(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function canvasFor(image: HTMLImageElement, width = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width * (image.height / image.width)));
  return canvas;
}

function drawApple(image: HTMLImageElement, scale: number) {
  const canvas = canvasFor(image);
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const markW = canvas.width / scale;
  const markH = markW * (image.height / image.width);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, (canvas.width - markW) / 2, (canvas.height - markH) / 2, markW, markH);
  return canvas;
}

function blurPass(source: HTMLCanvasElement, radius: number) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.filter = `blur(${radius}px)`;
  context.drawImage(source, 0, 0);
  context.filter = "none";
  return canvas;
}

function shapeAlpha(source: HTMLCanvasElement, peak: number, knockout: HTMLCanvasElement | null) {
  const context = source.getContext("2d");
  if (!context) return source;
  const pixels = context.getImageData(0, 0, source.width, source.height);
  const mask = knockout?.getContext("2d")?.getImageData(0, 0, source.width, source.height) ?? null;
  const alphas = new Float32Array(pixels.data.length / 4);
  let max = 1;
  for (let index = 0; index < alphas.length; index += 1) {
    let alpha = pixels.data[index * 4 + 3];
    if (mask) {
      const cover = mask.data[index * 4 + 3] / 255;
      alpha *= (1 - cover) ** 0.72;
    }
    alphas[index] = alpha;
    if (alpha > max) max = alpha;
  }
  for (let index = 0; index < alphas.length; index += 1) {
    const alpha = Math.round((alphas[index] / max) * peak);
    const offset = index * 4;
    pixels.data[offset] = 255;
    pixels.data[offset + 1] = 255;
    pixels.data[offset + 2] = 255;
    pixels.data[offset + 3] = alpha < 3 ? 0 : alpha;
  }
  context.putImageData(pixels, 0, 0);
  return source;
}

function loadLogoMaps() {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const mask = shapeAlpha(blurPass(drawApple(image, 1), 1.4), 255, null);
        const core = shapeAlpha(blurPass(drawApple(image, CORE_SCALE), 12), 158, null);
        const haloMark = drawApple(image, HALO_SCALE);
        const halo = shapeAlpha(blurPass(haloMark, 34), 104, blurPass(haloMark, 2));
        cached = {
          mask: textureFromCanvas(mask),
          core: textureFromCanvas(core),
          halo: textureFromCanvas(halo),
          aspect: image.width / image.height,
        };
        resolve(cached);
      };
      image.onerror = () => reject(new Error("logo"));
      image.src = MASK_SRC;
    });
  }
  return loading;
}

function cutoutColor(hex: string) {
  const color = new THREE.Color(hex);
  color.multiplyScalar(0.08);
  return `#${color.getHexString()}`;
}

export function AppleLogo({
  size,
  position,
  rotation = [0, Math.PI, 0],
  lit,
  finish,
}: {
  size: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  lit: boolean;
  finish: string;
}) {
  const [maps, setMaps] = useState<LogoMaps | null>(cached);
  const cutout = useRef<THREE.MeshBasicMaterial>(null);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const amount = useRef(lit ? 1 : 0);
  const litRef = useRef(lit);
  const invalidate = useThree((state) => state.invalidate);
  const dark = cutoutColor(finish);

  useEffect(() => {
    litRef.current = lit;
    invalidate();
  }, [invalidate, lit]);

  useEffect(() => {
    let alive = true;
    void loadLogoMaps().then((next) => {
      if (!alive) return;
      setMaps(next);
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [invalidate]);

  useFrame((_, delta) => {
    const target = litRef.current ? 1 : 0;
    const next = amount.current + (target - amount.current) * (1 - Math.exp(-3.1 * delta));
    const settled = Math.abs(target - next) < 0.004;
    amount.current = settled ? target : next;
    const level = amount.current;
    if (cutout.current) cutout.current.opacity = 1 - level * 0.94;
    if (core.current) core.current.opacity = level;
    if (halo.current) halo.current.opacity = level;
    if (!settled) invalidate();
  });

  if (!maps) return null;
  const width = size * maps.aspect;
  const height = size;

  return (
    <group position={position} rotation={rotation}>
      <mesh renderOrder={2}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          ref={cutout}
          map={maps.mask}
          color={dark}
          transparent
          depthWrite={false}
          opacity={lit ? 0.06 : 1}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.001]} renderOrder={3}>
        <planeGeometry args={[width * HALO_SCALE, height * HALO_SCALE]} />
        <meshBasicMaterial
          ref={halo}
          map={maps.halo}
          color="#ffffff"
          transparent
          depthWrite={false}
          opacity={lit ? 1 : 0}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.002]} renderOrder={4}>
        <planeGeometry args={[width * CORE_SCALE, height * CORE_SCALE]} />
        <meshBasicMaterial
          ref={core}
          map={maps.core}
          color="#ffffff"
          transparent
          depthWrite={false}
          opacity={lit ? 1 : 0}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
