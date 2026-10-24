"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const MASK_SRC = "/apple-logo.png";
/** Lit, the mark is a flat light grey, like the printed logo on the real back glass. */
const LIT_COLOR = "#a3a3a3";

type LogoMaps = {
  mask: THREE.Texture;
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

function drawApple(image: HTMLImageElement) {
  const canvas = canvasFor(image);
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
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

function shapeAlpha(source: HTMLCanvasElement, peak: number) {
  const context = source.getContext("2d");
  if (!context) return source;
  const pixels = context.getImageData(0, 0, source.width, source.height);
  const alphas = new Float32Array(pixels.data.length / 4);
  let max = 1;
  for (let index = 0; index < alphas.length; index += 1) {
    const alpha = pixels.data[index * 4 + 3];
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
        const mask = shapeAlpha(blurPass(drawApple(image), 1.4), 255);
        cached = {
          mask: textureFromCanvas(mask),
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
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const amount = useRef(lit ? 1 : 0);
  const litRef = useRef(lit);
  const invalidate = useThree((state) => state.invalidate);
  const dark = cutoutColor(finish);
  const darkColor = useRef(new THREE.Color(dark));
  const litColor = useRef(new THREE.Color(LIT_COLOR));

  useEffect(() => {
    darkColor.current.set(dark);
    invalidate();
  }, [dark, invalidate]);

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
    material.current?.color.copy(darkColor.current).lerp(litColor.current, amount.current);
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
          ref={material}
          map={maps.mask}
          color={lit ? LIT_COLOR : dark}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
