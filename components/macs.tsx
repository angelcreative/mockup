"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { DeviceSpec, FinishSpec, ScreenStatus } from "@/lib/devices";
import { roundedBodyGeometry, roundedRectGeometry, roundedRectShape, topNotchGeometry } from "@/components/geometry";

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

type KeyRole = "key" | "space" | "id";

type PlacedKey = {
  x: number;
  z: number;
  w: number;
  d: number;
  role: KeyRole;
  label: string;
};

const KEY_ROWS: (number | null)[][] = [
  [1, null, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.15],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.25],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.85],
  [2.15, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.35, 1],
  [1.15, 1.15, 1.2, 1.3, 4.7, 1.3, 1.15, 1, 1, 1],
];

const KEY_LEGENDS: (string | null)[][] = [
  ["esc", null, "☀", "☾", "□", "⌕", "♪", "◐", "◀", "▶", "»", "○", "−", "+", ""],
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "del"],
  ["tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
  ["caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "return"],
  ["shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "shift", "↑"],
  ["fn", "ctrl", "opt", "cmd", "", "cmd", "opt", "←", "↓", "→"],
];

function makeLegendTexture(layout: ReturnType<typeof layoutKeys>, dark: boolean) {
  if (typeof document === "undefined") return null;
  const px = 1100;
  const width = Math.max(64, Math.ceil(layout.well.w * px));
  const height = Math.max(64, Math.ceil(layout.well.d * px));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = dark ? "rgba(236, 238, 242, 0.94)" : "rgba(210, 212, 216, 0.92)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const originX = layout.well.x - layout.well.w / 2;
  const originZ = layout.well.z - layout.well.d / 2;
  for (const key of layout.keys) {
    if (!key.label) continue;
    const cx = ((key.x - originX) / layout.well.w) * width;
    const cy = ((key.z - originZ) / layout.well.d) * height;
    const longest = key.label.length > 3;
    const size = Math.max(11, Math.min(key.w, key.d) * px * (longest ? 0.22 : 0.46));
    ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(key.label, cx, cy);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function keyCapGeometry(width: number, depth: number, height: number) {
  const radius = Math.min(width, depth) * 0.22;
  const bevel = Math.min(0.0032, height * 0.3);
  const geometry = new THREE.ExtrudeGeometry(roundedRectShape(width, depth, radius), {
    depth: Math.max(0.004, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: Math.min(bevel, radius * 0.45),
    bevelSegments: 1,
    curveSegments: 5,
  });
  geometry.translate(-width / 2, -depth / 2, -height / 2);
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box) {
    geometry.translate(
      -(box.min.x + box.max.x) / 2,
      -(box.min.y + box.max.y) / 2,
      -(box.min.z + box.max.z) / 2,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

function layoutKeys(width: number, depth: number, pro: boolean, wide: boolean) {
  const gapUnit = 0.5;
  const unitsOf = (row: (number | null)[]) => row.reduce<number>((sum, cell) => sum + (cell ?? gapUnit), 0);
  const boardW = width * (wide ? 0.8 : 0.86);
  const unit = boardW / Math.max(...KEY_ROWS.map(unitsOf));
  const gutter = unit * 0.15;
  const keyD = unit * 0.7;
  const rowPitch = unit * 0.9;
  const placed: PlacedKey[] = [];
  const rowOf: number[] = [];
  let z = -depth / 2 + depth * 0.07 + keyD / 2;

  KEY_ROWS.forEach((row, rowIndex) => {
    const total = unitsOf(row) * unit;
    let x = -total / 2;
    row.forEach((cell, index) => {
      const span = (cell ?? gapUnit) * unit;
      if (cell !== null) {
        const role: KeyRole =
          rowIndex === 5 && cell > 3 ? "space" : rowIndex === 0 && index === row.length - 1 ? "id" : "key";
        placed.push({
          x: x + span / 2,
          z,
          w: Math.max(0.02, span - gutter),
          d: keyD,
          role,
          label: KEY_LEGENDS[rowIndex]?.[index] ?? "",
        });
        rowOf.push(rowIndex);
      }
      x += span;
    });
    z += rowPitch + (rowIndex === 0 ? unit * 0.22 : 0);
  });

  const bottom = placed.filter((_, index) => rowOf[index] === 5);
  const shift = placed.filter((_, index) => rowOf[index] === 4);
  const down = bottom[bottom.length - 2];
  const upKey = shift[shift.length - 1];
  if (upKey && down) upKey.x = down.x;

  const regular = placed.filter((key) => key.role === "key");
  const space = placed.find((key) => key.role === "space") ?? null;
  const touchId = placed.find((key) => key.role === "id") ?? null;
  const minX = Math.min(...placed.map((key) => key.x - key.w / 2));
  const maxX = Math.max(...placed.map((key) => key.x + key.w / 2));
  const minZ = Math.min(...placed.map((key) => key.z - key.d / 2));
  const maxZ = Math.max(...placed.map((key) => key.z + key.d / 2));
  const trackD = depth * (pro ? 0.27 : 0.23);
  const trackW = width * (pro ? (wide ? 0.4 : 0.46) : wide ? 0.36 : 0.4);
  const palmStart = maxZ + unit * 0.28;
  const palmEnd = depth / 2 - depth * 0.055;
  const fittedD = Math.min(trackD, Math.max(0.4, (palmEnd - palmStart) * 0.78));
  const trackZ = palmStart + (palmEnd - palmStart) / 2;

  return {
    keys: placed,
    regular,
    space,
    touchId,
    unit,
    well: {
      w: maxX - minX + unit * 0.42,
      d: maxZ - minZ + unit * 0.34,
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
    },
    track: { w: trackW, d: fittedD, z: trackZ },
  };
}

function Keyboard({
  width,
  depth,
  deckTop,
  dark,
  finish,
  model,
}: {
  width: number;
  depth: number;
  deckTop: number;
  dark: boolean;
  finish: string;
  model: string;
}) {
  const keysRef = useRef<THREE.InstancedMesh>(null);
  const pro = model.includes("pro");
  const wide = model.endsWith("15") || model.endsWith("16");
  const layout = useMemo(() => layoutKeys(width, depth, pro, wide), [depth, pro, wide, width]);
  const { regular, space, touchId } = layout;
  const sample = regular[0];
  const keyH = 0.011;
  const keyY = deckTop + keyH / 2 + 0.002;
  const unitGeo = useDisposable(
    useMemo(
      () => keyCapGeometry(sample?.w ?? 0.2, sample?.d ?? 0.16, keyH),
      [sample?.d, sample?.w],
    ),
  );
  const spaceGeo = useDisposable(
    useMemo(() => (space ? keyCapGeometry(space.w, space.d, keyH) : new THREE.BoxGeometry(0.01, 0.01, 0.01)), [space]),
  );
  const idGeo = useDisposable(
    useMemo(
      () => (touchId ? keyCapGeometry(touchId.w, touchId.d, keyH) : new THREE.BoxGeometry(0.01, 0.01, 0.01)),
      [touchId],
    ),
  );
  const wellGeo = useDisposable(
    useMemo(
      () => roundedRectGeometry(layout.well.w, layout.well.d, Math.min(0.08, layout.unit * 0.22)),
      [layout.unit, layout.well.d, layout.well.w],
    ),
  );
  const trackGeo = useDisposable(
    useMemo(
      () => roundedRectGeometry(layout.track.w, layout.track.d, Math.min(layout.track.d, layout.track.w) * 0.16),
      [layout.track.d, layout.track.w],
    ),
  );
  const wellColor = useMemo(() => {
    const color = new THREE.Color(finish);
    color.multiplyScalar(dark ? 0.78 : 0.9);
    return `#${color.getHexString()}`;
  }, [dark, finish]);
  const padColor = useMemo(() => {
    const color = new THREE.Color(finish);
    color.multiplyScalar(dark ? 1.12 : 0.8);
    return `#${color.getHexString()}`;
  }, [dark, finish]);
  const legendMap = useMemo(() => makeLegendTexture(layout, dark), [dark, layout]);
  useEffect(() => () => legendMap?.dispose(), [legendMap]);

  useLayoutEffect(() => {
    const mesh = keysRef.current;
    if (!mesh || !sample) return;
    const dummy = new THREE.Object3D();
    regular.forEach((key, index) => {
      dummy.position.set(key.x, keyY, key.z);
      dummy.scale.set(key.w / sample.w, 1, key.d / sample.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
  }, [keyY, regular, sample]);

  return (
    <group>
      <mesh geometry={wellGeo} rotation={[-Math.PI / 2, 0, 0]} position={[layout.well.x, deckTop + 0.0015, layout.well.z]}>
        <meshStandardMaterial color={wellColor} roughness={0.62} metalness={0.18} />
      </mesh>
      <instancedMesh ref={keysRef} args={[unitGeo, undefined, Math.max(1, regular.length)]}>
        <meshStandardMaterial color={dark ? "#4a4d55" : "#1b1c20"} roughness={0.48} metalness={0.16} />
      </instancedMesh>
      {space ? (
        <mesh geometry={spaceGeo} position={[space.x, keyY, space.z]}>
          <meshStandardMaterial color={dark ? "#4a4d55" : "#1b1c20"} roughness={0.48} metalness={0.16} />
        </mesh>
      ) : null}
      {touchId ? (
        <group position={[touchId.x, keyY, touchId.z]}>
          <mesh geometry={idGeo}>
            <meshStandardMaterial color={dark ? "#3a3d44" : "#121316"} roughness={0.42} metalness={0.2} />
          </mesh>
          <mesh position={[0, keyH / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[touchId.d * 0.16, touchId.d * 0.24, 24]} />
            <meshStandardMaterial color={dark ? "#8e929a" : "#6d7076"} roughness={0.35} metalness={0.4} />
          </mesh>
        </group>
      ) : null}
      {legendMap ? (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[layout.well.x, keyY + keyH / 2 + 0.0014, layout.well.z]}
        >
          <planeGeometry args={[layout.well.w, layout.well.d]} />
          <meshBasicMaterial map={legendMap} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ) : null}
      <mesh
        geometry={trackGeo}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, deckTop + 0.0025, layout.track.z]}
      >
        <meshStandardMaterial color={padColor} roughness={0.28} metalness={0.42} />
      </mesh>
    </group>
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
  const deckTop = layout.deck + Math.min(0.03, layout.deck * 0.2);
  const screenZ = layout.d / 2;
  const notchZ = screenZ + screenH / 2 - notchH / 2;

  return (
    <group position={[0, -layout.height / 2 + layout.lift, -layout.centerZ]}>
      <mesh geometry={deckGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, layout.deck / 2, 0]}>
        <meshStandardMaterial color={finish.color} metalness={finish.metalness} roughness={finish.roughness} />
      </mesh>
      <Keyboard
        width={layout.w}
        depth={layout.d}
        deckTop={deckTop}
        dark={dark}
        finish={finish.color}
        model={device.id}
      />
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
