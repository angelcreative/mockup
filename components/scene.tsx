"use client";

import { Suspense, useEffect, useMemo, type MutableRefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type { BackgroundId, DeviceSpec, ScreenState } from "@/lib/devices";
import { BACKGROUNDS } from "@/lib/devices";
import { DeviceModel, deviceBodyHeight } from "@/components/devices";

function createStatusTexture(status: ScreenState["status"], message: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 804;
  canvas.height = 1748;
  const context = canvas.getContext("2d");
  if (!context) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    return fallback;
  }

  context.fillStyle = "#f3f3f3";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = status === "error" ? "#9f1239" : "#5c5c5c";
  const family = getComputedStyle(document.body).fontFamily || "Inter, sans-serif";
  context.font = `500 46px ${family}`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const words = message.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const maxWidth = 640;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  const anchor = status === "loading" ? canvas.height * 0.58 : canvas.height * 0.5;
  const lineHeight = 64;
  const start = anchor - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((value, index) => {
    context.fillText(value, canvas.width / 2, start + index * lineHeight);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createGradientTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#f4f4f5");
  gradient.addColorStop(0.42, "#ffffff");
  gradient.addColorStop(1, "#d4d4d8");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function SceneBackground({ background }: { background: BackgroundId }) {
  const texture = useMemo(
    () => (background === "gradiente" ? createGradientTexture() : null),
    [background],
  );

  useEffect(() => () => texture?.dispose(), [texture]);

  if (texture) {
    return <primitive attach="background" object={texture} />;
  }

  const color = BACKGROUNDS.find((item) => item.id === background)?.color ?? "#ffffff";
  return <color attach="background" args={[color]} />;
}

function SoftShadow({ y, strength }: { y: number; strength: number }) {
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
      <planeGeometry args={[3.4, 1.5]} />
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
  exportRef: MutableRefObject<(() => void) | null>;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    exportRef.current = () => {
      gl.render(scene, camera);
      const href = gl.domElement.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = href;
      link.download = "mockup.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    return () => {
      exportRef.current = null;
    };
  }, [camera, exportRef, gl, scene]);

  return null;
}

function Stage({
  device,
  screen,
  apertura,
  light,
  background,
  exportRef,
}: {
  device: DeviceSpec;
  screen: ScreenState;
  apertura: number;
  light: number;
  background: BackgroundId;
  exportRef: MutableRefObject<(() => void) | null>;
}) {
  const texture = useMemo(() => {
    if (screen.status === "ready" && screen.image) {
      const next = new THREE.Texture(screen.image);
      next.colorSpace = THREE.SRGBColorSpace;
      next.anisotropy = 8;
      next.needsUpdate = true;
      return next;
    }
    return createStatusTexture(screen.status, screen.message);
  }, [screen.image, screen.message, screen.status]);

  useEffect(() => () => texture.dispose(), [texture]);

  const bodyH = deviceBodyHeight(device);

  return (
    <>
      <SceneBackground background={background} />
      <ExportBridge exportRef={exportRef} />
      <ambientLight intensity={0.55 * light} />
      <directionalLight position={[3.4, 5.2, 4.2]} intensity={1.25 * light} />
      <directionalLight position={[-3.2, 2.4, 2.2]} intensity={0.38 * light} />
      <DeviceModel
        device={device}
        texture={texture}
        image={screen.status === "ready" ? screen.image : null}
        status={screen.status}
        apertura={apertura}
      />
      <SoftShadow y={-bodyH / 2 - 0.012} strength={0.9 * Math.min(Math.max(light, 0), 1.3)} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={7}
        maxDistance={18}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI * 0.82}
      />
    </>
  );
}

export default function Scene({
  device,
  screen,
  apertura,
  light,
  background,
  exportRef,
}: {
  device: DeviceSpec;
  screen: ScreenState;
  apertura: number;
  light: number;
  background: BackgroundId;
  exportRef: MutableRefObject<(() => void) | null>;
}) {
  return (
    <Canvas
      dpr={2}
      camera={{ position: [1.05, 0.18, 12.2], fov: 28 }}
      gl={{
        preserveDrawingBuffer: true,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <Suspense fallback={null}>
        <Stage
          device={device}
          screen={screen}
          apertura={apertura}
          light={light}
          background={background}
          exportRef={exportRef}
        />
      </Suspense>
    </Canvas>
  );
}
