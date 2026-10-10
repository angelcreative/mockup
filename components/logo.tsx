"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const SIZE = 256;

function appleCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.translate(SIZE / 2, SIZE * 0.54);
  const s = SIZE;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.3);
  ctx.bezierCurveTo(-s * 0.2, -s * 0.46, -s * 0.46, -s * 0.2, -s * 0.38, s * 0.02);
  ctx.bezierCurveTo(-s * 0.48, s * 0.28, -s * 0.22, s * 0.44, 0, s * 0.34);
  ctx.bezierCurveTo(s * 0.22, s * 0.44, s * 0.48, s * 0.28, s * 0.38, s * 0.02);
  ctx.bezierCurveTo(s * 0.46, -s * 0.2, s * 0.2, -s * 0.46, 0, -s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(s * 0.2, -s * 0.02, s * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-s * 0.06, -s * 0.36, s * 0.11, s * 0.042, -0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.012, -s * 0.28);
  ctx.quadraticCurveTo(s * 0.01, -s * 0.42, s * 0.055, -s * 0.4);
  ctx.lineTo(s * 0.04, -s * 0.36);
  ctx.quadraticCurveTo(s * 0.012, -s * 0.34, s * 0.02, -s * 0.26);
  ctx.closePath();
  ctx.fill();
  return canvas;
}

function haloCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const gradient = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.08, SIZE / 2, SIZE / 2, SIZE * 0.48);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.28, "rgba(255,255,255,0.45)");
  gradient.addColorStop(0.62, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return canvas;
}

function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

let maps: { apple: THREE.Texture; halo: THREE.Texture } | null = null;

function logoMaps() {
  if (maps) return maps;
  if (typeof document === "undefined") return null;
  maps = { apple: canvasTexture(appleCanvas()), halo: canvasTexture(haloCanvas()) };
  return maps;
}

function luminance(hex: string) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
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
  const textures = useMemo(() => logoMaps(), []);
  const mark = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useRef(lit ? 1 : 0);
  const litRef = useRef(lit);
  const invalidate = useThree((state) => state.invalidate);
  const unlit = luminance(finish) < 150 ? "#ececee" : "#2a2a2e";

  useLayoutEffect(() => {
    litRef.current = lit;
  }, [lit]);

  useFrame((_, delta) => {
    const target = litRef.current ? 1 : 0;
    const next = glow.current + (target - glow.current) * (1 - Math.exp(-3.1 * delta));
    const settled = Math.abs(target - next) < 0.004;
    glow.current = settled ? target : next;
    const amount = glow.current;
    const rest = new THREE.Color(unlit);
    const hot = new THREE.Color("#ffffff");
    if (mark.current) {
      mark.current.color.copy(rest).lerp(hot, amount);
      mark.current.opacity = 0.92;
    }
    if (halo.current) halo.current.opacity = amount * 0.95;
    if (!settled) invalidate();
  });

  if (!textures) return null;

  return (
    <group position={position} rotation={rotation}>
      <mesh renderOrder={2}>
        <planeGeometry args={[size * 2.6, size * 2.6]} />
        <meshBasicMaterial
          ref={halo}
          map={textures.halo}
          transparent
          depthWrite={false}
          opacity={0}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.002]} renderOrder={3}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          ref={mark}
          map={textures.apple}
          color={unlit}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
