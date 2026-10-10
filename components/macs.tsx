"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { DeviceSpec, FinishSpec, ScreenStatus } from "@/lib/devices";
import { roundedBodyGeometry, roundedRectGeometry, topNotchGeometry } from "@/components/geometry";

const LAPTOP_SCALE = 0.2;
const IMAC_SCALE = 0.15;
const LID_OPEN = 1.95;

function useDisposable<T extends { dispose: () => void }>(geometry: T) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function luminance(hex: string) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

type BodyCm = { width: number; depth: number; thick: number };

const LAPTOP_CM: Record<string, BodyCm> = {
  "macbook-air-13": { width: 30.41, depth: 21.5, thick: 1.13 },
  "macbook-air-15": { width: 34.04, depth: 23.76, thick: 1.15 },
  "macbook-pro-14": { width: 31.26, depth: 22.12, thick: 1.55 },
  "macbook-pro-16": { width: 35.57, depth: 24.81, thick: 1.68 },
};

function rotX(y: number, z: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { y: y * c - z * s, z: y * s + z * c };
}

export function macLayout(device: DeviceSpec, apertura: number) {
  if (device.kind === "desktop") return imacLayout(device);
  const body = LAPTOP_CM[device.id] ?? LAPTOP_CM["macbook-air-13"];
  const w = body.width * LAPTOP_SCALE;
  const d = body.depth * LAPTOP_SCALE;
  const thick = body.thick * LAPTOP_SCALE;
  const deck = thick * 0.62;
  const lid = Math.max(0.045, thick * 0.38);
  const radius = Math.min(w, d) * 0.055;
  const gap = 0.012;
  const angle = -LID_OPEN * Math.min(1, Math.max(0, apertura));
  const hingeY = deck + gap;
  const corners = [
    rotX(0, d, angle),
    rotX(lid, d, angle),
    rotX(0, 0, angle),
    rotX(lid, 0, angle),
  ];
  let maxY = hingeY + lid;
  let minY = 0;
  let minZ = -d / 2;
  let maxZ = d / 2;
  for (const corner of corners) {
    maxY = Math.max(maxY, hingeY + corner.y);
    minY = Math.min(minY, hingeY + corner.y);
    minZ = Math.min(minZ, -d / 2 + corner.z);
    maxZ = Math.max(maxZ, -d / 2 + corner.z);
  }
  const height = maxY - minY;
  const span = Math.max(w, height, maxZ - minZ);
  return {
    kind: "laptop" as const,
    w,
    d,
    deck,
    lid,
    radius,
    gap,
    angle,
    hingeY,
    height,
    span,
    centerZ: (minZ + maxZ) / 2,
    lift: -minY,
  };
}

function imacLayout(device: DeviceSpec) {
  const aspect = device.width / device.height;
  const screenW = 53.15 * IMAC_SCALE;
  const screenH = screenW / aspect;
  const sideBezel = 0.72 * IMAC_SCALE;
  const topBezel = 1.05 * IMAC_SCALE;
  const chin = 3.55 * IMAC_SCALE;
  const panelW = screenW + sideBezel * 2;
  const panelH = screenH + topBezel + chin;
  const thick = 1.05 * IMAC_SCALE;
  const neckH = 4.15 * IMAC_SCALE;
  const footH = 0.32 * IMAC_SCALE;
  const footW = panelW * 0.36;
  const footD = 14.7 * IMAC_SCALE;
  const height = panelH + neckH + footH;
  const span = Math.max(panelW, height, footD);
  return {
    kind: "desktop" as const,
    w: panelW,
    d: footD,
    deck: 0,
    lid: 0,
    radius: panelW * 0.045,
    gap: 0,
    angle: 0,
    hingeY: 0,
    height,
    span,
    centerZ: 0,
    lift: 0,
    screenW,
    screenH,
    sideBezel,
    topBezel,
    chin,
    panelW,
    panelH,
    thick,
    neckH,
    footH,
    footW,
    footD,
  };
}

export function macSpan(device: DeviceSpec, apertura: number) {
  return macLayout(device, apertura).span;
}

export function macFoot(device: DeviceSpec, apertura: number) {
  return macLayout(device, apertura).height;
}

function screenData(device: DeviceSpec) {
  return {
    screen: true,
    panel: "single" as const,
    screenWidth: device.width,
    screenHeight: device.height,
    glassWidth: device.width,
    topInset: device.topInset,
    bottomInset: device.bottomInset,
    cutout: device.cutout,
    landscapeStatus: 0,
  };
}

function Keys({
  width,
  depth,
  y,
  dark,
}: {
  width: number;
  depth: number;
  y: number;
  dark: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cols = Math.max(12, Math.round(width / 0.34));
  const rows = 5;
  const count = cols * rows;
  const marginX = width * 0.08;
  const keyW = ((width - marginX * 2) / cols) * 0.78;
  const keyD = (depth * 0.46) / rows * 0.72;
  const geometry = useDisposable(useMemo(() => new THREE.BoxGeometry(keyW, 0.014, keyD), [keyD, keyW]));

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const x0 = -width / 2 + marginX + (width - marginX * 2) / cols / 2;
    const z0 = -depth / 2 + depth * 0.16;
    const zStep = (depth * 0.46) / rows;
    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        dummy.position.set(x0 + col * ((width - marginX * 2) / cols), y, z0 + row * zStep);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [cols, count, depth, marginX, rows, width, y]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]}>
      <meshStandardMaterial color={dark ? "#3e4046" : "#1c1d21"} roughness={0.55} metalness={0.22} />
    </instancedMesh>
  );
}

export function LaptopMesh({
  device,
  texture,
  apertura,
  finish,
}: {
  device: DeviceSpec;
  texture: THREE.Texture;
  status: ScreenStatus;
  apertura: number;
  finish: FinishSpec;
}) {
  const layout = macLayout(device, Math.min(1, Math.max(0, apertura)));
  const dark = luminance(finish.color) < 140;
  const deckGeo = useDisposable(
    useMemo(
      () => roundedBodyGeometry(layout.w, layout.d, layout.deck, layout.radius),
      [layout.deck, layout.d, layout.radius, layout.w],
    ),
  );
  const lidGeo = useDisposable(
    useMemo(
      () => roundedBodyGeometry(layout.w * 0.992, layout.d * 0.992, layout.lid, layout.radius * 0.92),
      [layout.d, layout.lid, layout.radius, layout.w],
    ),
  );
  const bezel = Math.min(layout.w, layout.d) * 0.028;
  const aspect = device.width / device.height;
  let screenW = layout.w - bezel * 2;
  let screenH = screenW / aspect;
  const maxH = layout.d - bezel * 2.6;
  if (screenH > maxH) {
    screenH = maxH;
    screenW = screenH * aspect;
  }
  const screenGeo = useDisposable(
    useMemo(() => roundedRectGeometry(screenW, screenH, Math.max(0.04, layout.radius * 0.45)), [layout.radius, screenH, screenW]),
  );
  const bezelGeo = useDisposable(
    useMemo(
      () => roundedRectGeometry(screenW + bezel * 1.15, screenH + bezel * 1.15, Math.max(0.05, layout.radius * 0.5)),
      [bezel, layout.radius, screenH, screenW],
    ),
  );
  const notchW = screenW * 0.15;
  const notchH = Math.min(screenH * (30 / device.height), screenH * (device.topInset / device.height) * 0.82);
  const notchGeo = useDisposable(
    useMemo(() => topNotchGeometry(notchW, notchH, notchH * 0.42), [notchH, notchW]),
  );
  const deckWell = useDisposable(
    useMemo(
      () => roundedRectGeometry(layout.w * 0.9, layout.d * 0.5, 0.06),
      [layout.d, layout.w],
    ),
  );
  const trackW = layout.w * 0.36;
  const trackD = layout.d * 0.24;
  const trackGeo = useDisposable(useMemo(() => roundedRectGeometry(trackW, trackD, 0.08), [trackD, trackW]));

  const screenZ = layout.d / 2;
  const notchZ = screenZ + screenH / 2 - notchH / 2;

  return (
    <group position={[0, -layout.height / 2 + layout.lift, -layout.centerZ]}>
      <mesh geometry={deckGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, layout.deck / 2, 0]}>
        <meshStandardMaterial color={finish.color} metalness={finish.metalness} roughness={finish.roughness} />
      </mesh>
      <mesh geometry={deckWell} rotation={[-Math.PI / 2, 0, 0]} position={[0, layout.deck + 0.004, -layout.d * 0.08]}>
        <meshStandardMaterial color={dark ? "#101114" : "#d7d8dc"} roughness={0.55} metalness={0.2} />
      </mesh>
      <Keys width={layout.w} depth={layout.d} y={layout.deck + 0.012} dark={dark} />
      <mesh
        geometry={trackGeo}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, layout.deck + 0.008, layout.d * 0.28]}
      >
        <meshStandardMaterial color={dark ? "#2c2d32" : "#c5c6ca"} roughness={0.4} metalness={0.28} />
      </mesh>
      <mesh position={[0, layout.hingeY - 0.01, -layout.d / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[layout.lid * 0.55, layout.lid * 0.55, layout.w * 0.72, 20]} />
        <meshStandardMaterial color={dark ? "#3a3b40" : "#b7b8bc"} metalness={0.8} roughness={0.28} />
      </mesh>
      <group position={[0, layout.hingeY, -layout.d / 2]} rotation={[layout.angle, 0, 0]}>
        <mesh
          geometry={lidGeo}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, layout.lid / 2, (layout.d * 0.992) / 2]}
        >
          <meshStandardMaterial color={finish.color} metalness={finish.metalness} roughness={finish.roughness} />
        </mesh>
        <mesh geometry={bezelGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.001, screenZ]}>
          <meshStandardMaterial color="#0c0c0e" roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh
          geometry={screenGeo}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, -0.004, screenZ]}
          userData={screenData(device)}
        >
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        <mesh geometry={notchGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.008, notchZ]}>
          <meshBasicMaterial color="#0a0a0c" />
        </mesh>
        <group position={[0, -0.012, notchZ]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.045, 24]} />
            <meshStandardMaterial color="#050506" metalness={0.7} roughness={0.18} />
          </mesh>
          <mesh position={[0.012, -0.002, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.012, 12]} />
            <meshBasicMaterial color="#9fd0ff" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function ImacMesh({
  device,
  texture,
  finish,
}: {
  device: DeviceSpec;
  texture: THREE.Texture;
  status: ScreenStatus;
  finish: FinishSpec;
}) {
  const layout = imacLayout(device);
  const body = useDisposable(
    useMemo(
      () => roundedBodyGeometry(layout.panelW, layout.panelH, layout.thick, layout.radius),
      [layout.panelH, layout.panelW, layout.radius, layout.thick],
    ),
  );
  const screen = useDisposable(
    useMemo(
      () => roundedRectGeometry(layout.screenW, layout.screenH, layout.radius * 0.35),
      [layout.radius, layout.screenH, layout.screenW],
    ),
  );
  const bezel = useDisposable(
    useMemo(
      () =>
        roundedRectGeometry(
          layout.screenW + layout.sideBezel * 1.1,
          layout.screenH + layout.topBezel * 0.85,
          layout.radius * 0.4,
        ),
      [layout.radius, layout.screenH, layout.screenW, layout.sideBezel, layout.topBezel],
    ),
  );
  const foot = useDisposable(
    useMemo(
      () => roundedBodyGeometry(layout.footW, layout.footD, layout.footH, layout.footW * 0.45),
      [layout.footD, layout.footH, layout.footW],
    ),
  );
  const panelY = layout.footH + layout.neckH + layout.panelH / 2;
  const screenY = layout.chin + layout.screenH / 2 - layout.panelH / 2;
  const bezelY = screenY + layout.topBezel * 0.2;
  const zFront = layout.thick / 2 + 0.012;

  return (
    <group position={[0, -layout.height / 2, 0]}>
      <mesh geometry={foot} rotation={[Math.PI / 2, 0, 0]} position={[0, layout.footH / 2, layout.footD * 0.08]}>
        <meshStandardMaterial color={finish.color} metalness={finish.metalness} roughness={finish.roughness} />
      </mesh>
      <mesh position={[0, layout.footH + layout.neckH / 2, -layout.thick * 0.15]}>
        <boxGeometry args={[layout.panelW * 0.045, layout.neckH, layout.thick * 0.72]} />
        <meshStandardMaterial color={finish.color} metalness={finish.metalness} roughness={finish.roughness} />
      </mesh>
      <mesh geometry={body} position={[0, panelY, 0]}>
        <meshStandardMaterial color={finish.color} metalness={finish.metalness} roughness={finish.roughness} />
      </mesh>
      <mesh geometry={bezel} position={[0, panelY + bezelY, zFront]}>
        <meshStandardMaterial color="#0c0c0e" roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh geometry={screen} position={[0, panelY + screenY, zFront + 0.006]} userData={screenData(device)}>
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <group position={[0, panelY + screenY + layout.screenH / 2 + layout.topBezel * 0.38, zFront + 0.01]}>
        <mesh>
          <circleGeometry args={[0.055, 24]} />
          <meshStandardMaterial color="#121316" metalness={0.55} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0, 0.004]}>
          <circleGeometry args={[0.028, 20]} />
          <meshStandardMaterial color="#050506" metalness={0.7} roughness={0.16} />
        </mesh>
        <mesh position={[0.012, 0.012, 0.008]}>
          <circleGeometry args={[0.008, 12]} />
          <meshBasicMaterial color="#9fd0ff" />
        </mesh>
      </group>
    </group>
  );
}
