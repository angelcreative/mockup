"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const MASK_SRC = "/apple-logo.png";
const BLOOM_SCALE = 6.4;

type LogoMaps = {
  mask: THREE.Texture;
  bloom: THREE.Texture;
  aspect: number;
};

let cached: LogoMaps | null = null;
let loading: Promise<LogoMaps> | null = null;

function maskFrom(image: HTMLImageElement) {
  const width = 512;
  const height = Math.max(1, Math.round(width * (image.height / image.width)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return textureFromCanvas(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const source = context.getImageData(0, 0, width, height);
  const out = context.createImageData(width, height);
  const radius = 7;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let count = 0;
      for (let ky = -radius; ky <= radius; ky += 1) {
        const sy = y + ky;
        if (sy < 0 || sy >= height) continue;
        for (let kx = -radius; kx <= radius; kx += 1) {
          const sx = x + kx;
          if (sx < 0 || sx >= width) continue;
          total += source.data[(sy * width + sx) * 4 + 3];
          count += 1;
        }
      }
      const offset = (y * width + x) * 4;
      out.data[offset] = 255;
      out.data[offset + 1] = 255;
      out.data[offset + 2] = 255;
      out.data[offset + 3] = Math.round(total / count);
    }
  }
  context.putImageData(out, 0, 0);
  return textureFromCanvas(canvas);
}

function textureFromCanvas(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
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

function bloomFrom(image: HTMLImageElement) {
  const width = 512;
  const height = Math.max(1, Math.round(width * (image.height / image.width)));
  const mark = document.createElement("canvas");
  mark.width = width;
  mark.height = height;
  const markContext = mark.getContext("2d");
  if (!markContext) return textureFromCanvas(mark);
  const markW = width / BLOOM_SCALE;
  const markH = markW * (image.height / image.width);
  markContext.clearRect(0, 0, width, height);
  markContext.drawImage(image, (width - markW) / 2, (height - markH) / 2, markW, markH);
  const tight = blurPass(mark, Math.round(Math.min(width, height) * 0.07));
  const wide = blurPass(mark, Math.round(Math.min(width, height) * 0.12));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return textureFromCanvas(canvas);
  context.drawImage(wide, 0, 0);
  context.globalAlpha = 0.72;
  context.drawImage(tight, 0, 0);
  const pixels = context.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const alpha = Math.round(pixels.data[index + 3] * 0.26);
    pixels.data[index] = 255;
    pixels.data[index + 1] = 255;
    pixels.data[index + 2] = 255;
    pixels.data[index + 3] = alpha < 3 ? 0 : alpha;
  }
  context.putImageData(pixels, 0, 0);
  return textureFromCanvas(canvas);
}

function loadLogoMaps() {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        cached = {
          mask: maskFrom(image),
          bloom: bloomFrom(image),
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
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const bloom = useRef<THREE.MeshBasicMaterial>(null);
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
    if (cutout.current) cutout.current.opacity = 1 - level * 0.92;
    if (glow.current) glow.current.opacity = level;
    if (bloom.current) bloom.current.opacity = level;
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
          opacity={lit ? 0.08 : 1}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.001]} renderOrder={3}>
        <planeGeometry args={[width * BLOOM_SCALE, height * BLOOM_SCALE]} />
        <meshBasicMaterial
          ref={bloom}
          map={maps.bloom}
          color="#ffffff"
          transparent
          depthWrite={false}
          opacity={lit ? 1 : 0}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.002]} renderOrder={4}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          ref={glow}
          map={maps.mask}
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
