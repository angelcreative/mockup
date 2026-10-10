"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { DeviceSpec, ScreenStatus } from "@/lib/devices";
import { FOLD_PANEL_WIDTH, ISLAND_POINTS, NOTCH_POINTS, isFoldOpen } from "@/lib/devices";
import {
  frameSize,
  roundedBodyGeometry,
  roundedRectGeometry,
  topNotchGeometry,
} from "@/components/geometry";

const FINISH = {
  midnight: { color: "#16161a", metalness: 0.42, roughness: 0.46 },
  black: { color: "#1c1c1f", metalness: 0.4, roughness: 0.48 },
  graphite: { color: "#2a2c31", metalness: 0.48, roughness: 0.42 },
  titanium: { color: "#8d8a83", metalness: 0.62, roughness: 0.36 },
  silver: { color: "#d7d7dc", metalness: 0.58, roughness: 0.32 },
  starlight: { color: "#e4dccd", metalness: 0.46, roughness: 0.4 },
} as const;

function useDisposable<T extends { dispose: () => void }>(geometry: T) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function ScreenSpinner({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z -= delta * 4.2;
  });

  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[0.105, 0.132, 48, 1, 0, Math.PI * 1.35]} />
      <meshBasicMaterial color="#171717" />
    </mesh>
  );
}

function SideButtons({
  bodyW,
  color,
  side,
}: {
  bodyW: number;
  color: string;
  side: "both" | "left" | "right";
}) {
  return (
    <group>
      {side !== "right" ? (
        <>
          <mesh position={[-bodyW / 2 - 0.012, 0.62, 0]}>
            <boxGeometry args={[0.022, 0.2, 0.048]} />
            <meshStandardMaterial color={color} metalness={0.55} roughness={0.38} />
          </mesh>
          <mesh position={[-bodyW / 2 - 0.012, 0.26, 0]}>
            <boxGeometry args={[0.022, 0.34, 0.048]} />
            <meshStandardMaterial color={color} metalness={0.55} roughness={0.38} />
          </mesh>
        </>
      ) : null}
      {side !== "left" ? (
        <mesh position={[bodyW / 2 + 0.012, 0.38, 0]}>
          <boxGeometry args={[0.022, 0.5, 0.048]} />
          <meshStandardMaterial color={color} metalness={0.55} roughness={0.38} />
        </mesh>
      ) : null}
    </group>
  );
}

function FrontCamera({
  edge,
  bodyW,
  bodyH,
  bezel,
  depth,
}: {
  edge: "top" | "right";
  bodyW: number;
  bodyH: number;
  bezel: number;
  depth: number;
}) {
  const radius = Math.min(0.042, Math.max(0.03, bezel * 0.5));
  const position: [number, number, number] =
    edge === "top"
      ? [0, bodyH / 2 - bezel * 0.48, depth / 2 + 0.008]
      : [bodyW / 2 - bezel * 0.48, 0, depth / 2 + 0.008];

  return (
    <group position={position}>
      <mesh>
        <circleGeometry args={[radius, 28]} />
        <meshStandardMaterial color="#121316" metalness={0.45} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <circleGeometry args={[radius * 0.52, 24]} />
        <meshStandardMaterial color="#050506" metalness={0.7} roughness={0.18} />
      </mesh>
      <mesh position={[radius * 0.18, radius * 0.18, 0.008]}>
        <circleGeometry args={[radius * 0.12, 12]} />
        <meshBasicMaterial color="#9fd0ff" />
      </mesh>
    </group>
  );
}

function screenUserData(
  device: DeviceSpec,
  panel: "single" | "left" | "right",
  screenWidth: number,
) {
  return {
    screen: true,
    panel,
    screenWidth,
    screenHeight: device.height,
    topInset: device.topInset,
    bottomInset: device.bottomInset,
  };
}

function Slab({
  device,
  texture,
  status,
}: {
  device: DeviceSpec;
  texture: THREE.Texture;
  status: ScreenStatus;
}) {
  const profile = device.kind === "tablet" ? "tablet" : "phone";
  const frame = useMemo(
    () => frameSize(device.width, device.height, profile),
    [device.width, device.height, profile],
  );
  const body = useDisposable(
    useMemo(
      () => roundedBodyGeometry(frame.bodyW, frame.bodyH, frame.depth, frame.radius),
      [frame.bodyW, frame.bodyH, frame.depth, frame.radius],
    ),
  );
  const screen = useDisposable(
    useMemo(
      () =>
        roundedRectGeometry(
          frame.screenW,
          frame.screenH,
          Math.max(0.06, frame.radius - (profile === "tablet" ? 0.02 : 0.08)),
        ),
      [frame.screenW, frame.screenH, frame.radius, profile],
    ),
  );
  const island = useDisposable(
    useMemo(() => {
      const width = frame.screenW * (ISLAND_POINTS.width / device.width);
      const height = frame.screenH * (ISLAND_POINTS.height / device.height);
      return roundedRectGeometry(width, height, height / 2);
    }, [frame.screenW, frame.screenH, device.width, device.height]),
  );
  const notch = useDisposable(
    useMemo(() => {
      const width = frame.screenW * (NOTCH_POINTS.width / device.width);
      const height = frame.screenH * (NOTCH_POINTS.height / device.height);
      return topNotchGeometry(width, height, height * 0.42);
    }, [frame.screenW, frame.screenH, device.width, device.height]),
  );

  const finish = FINISH[device.finish];
  const zFront = frame.depth / 2 + 0.01;
  const islandH = frame.screenH * (ISLAND_POINTS.height / device.height);
  const islandY =
    frame.screenH / 2 - frame.screenH * (ISLAND_POINTS.top / device.height) - islandH / 2;
  const notchH = frame.screenH * (NOTCH_POINTS.height / device.height);
  const notchY = frame.screenH / 2 - notchH / 2;

  return (
    <group>
      <mesh geometry={body}>
        <meshStandardMaterial
          color={finish.color}
          metalness={finish.metalness}
          roughness={finish.roughness}
        />
      </mesh>
      <mesh
        geometry={screen}
        position={[0, 0, zFront]}
        userData={screenUserData(device, "single", device.width)}
      >
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {device.cutout === "island" ? (
        <mesh geometry={island} position={[0, islandY, zFront + 0.008]}>
          <meshBasicMaterial color="#050505" />
        </mesh>
      ) : null}
      {device.cutout === "notch" ? (
        <mesh geometry={notch} position={[0, notchY, zFront + 0.008]}>
          <meshBasicMaterial color="#050505" />
        </mesh>
      ) : null}
      {device.camera === "none" ? null : (
        <FrontCamera
          edge={device.camera}
          bodyW={frame.bodyW}
          bodyH={frame.bodyH}
          bezel={frame.bezel}
          depth={frame.depth}
        />
      )}
      {device.kind === "tablet" ? (
        <mesh position={[frame.bodyW / 2 + 0.01, 0.55, 0]}>
          <boxGeometry args={[0.016, 0.28, 0.03]} />
          <meshStandardMaterial color={finish.color} metalness={0.55} roughness={0.38} />
        </mesh>
      ) : (
        <SideButtons bodyW={frame.bodyW} color={finish.color} side="both" />
      )}
      {status === "loading" ? <ScreenSpinner position={[0, 0.15, zFront + 0.02]} /> : null}
    </group>
  );
}

function FoldPanel({
  texture,
  panel,
  body,
  screen,
  depth,
  bodyW,
  buttons,
  status,
  interactive,
}: {
  texture: THREE.Texture;
  panel: "left" | "right";
  body: THREE.BufferGeometry;
  screen: THREE.BufferGeometry;
  depth: number;
  bodyW: number;
  buttons: "left" | "right" | "both";
  status: ScreenStatus;
  interactive: boolean;
}) {

  const finish = FINISH.black;
  const zFront = depth / 2 + 0.01;

  return (
    <group>
      <mesh geometry={body}>
        <meshStandardMaterial
          color={finish.color}
          metalness={finish.metalness}
          roughness={finish.roughness}
        />
      </mesh>
      <mesh
        geometry={screen}
        position={[0, 0, zFront]}
        userData={{
          ...screenUserData(
            {
              id: "fold",
              label: "Fold",
              width: 768,
              height: 874,
              cutout: "none",
              finish: "black",
              kind: "fold",
              topInset: 0,
              bottomInset: 0,
              camera: "none",
            },
            panel,
            FOLD_PANEL_WIDTH,
          ),
          screen: interactive,
        }}
      >
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <SideButtons bodyW={bodyW} color={finish.color} side={buttons} />
      {status === "loading" && panel === "left" ? (
        <ScreenSpinner position={[0, 0.15, zFront + 0.02]} />
      ) : null}
    </group>
  );
}

function FoldMesh({
  leftTexture,
  rightTexture,
  status,
  apertura,
}: {
  leftTexture: THREE.Texture;
  rightTexture: THREE.Texture;
  status: ScreenStatus;
  apertura: number;
}) {
  const frame = useMemo(() => frameSize(FOLD_PANEL_WIDTH, 874), []);
  const depth = frame.depth * 0.72;
  const body = useDisposable(
    useMemo(
      () => roundedBodyGeometry(frame.bodyW, frame.bodyH, depth, frame.radius * 0.92),
      [frame.bodyW, frame.bodyH, depth, frame.radius],
    ),
  );
  const screen = useDisposable(
    useMemo(
      () =>
        roundedRectGeometry(
          frame.screenW,
          frame.screenH,
          Math.max(0.08, frame.radius - 0.1),
        ),
      [frame.screenW, frame.screenH, frame.radius],
    ),
  );

  const open = isFoldOpen(apertura);
  const gap = 0.11 * apertura;
  const centerShift = ((frame.bodyW + gap) / 2) * (1 - apertura);
  const leftButtons = open ? "left" : "both";

  return (
    <group position={[centerShift, 0, 0]}>
      <mesh visible={apertura > 0.05} position={[0, 0, 0.02]}>
        <cylinderGeometry args={[0.048, 0.048, frame.bodyH * 0.97, 24]} />
        <meshStandardMaterial color="#0c0c0e" metalness={0.74} roughness={0.28} />
      </mesh>
      <group position={[-frame.bodyW / 2 - gap / 2, 0, 0]}>
        <FoldPanel
          texture={leftTexture}
          panel="left"
          body={body}
          screen={screen}
          depth={depth}
          bodyW={frame.bodyW}
          buttons={leftButtons}
          status={status}
          interactive
        />
      </group>
      <group rotation={[0, (1 - apertura) * Math.PI, 0]}>
        <group position={[frame.bodyW / 2 + gap / 2, 0, depth * 1.25 * (1 - apertura)]}>
          <FoldPanel
            texture={rightTexture}
            panel="right"
            body={body}
            screen={screen}
            depth={depth}
            bodyW={frame.bodyW}
            buttons="right"
            status={status}
            interactive={apertura > 0.08}
          />
        </group>
      </group>
    </group>
  );
}

export function DeviceModel({
  device,
  texture,
  leftTexture,
  rightTexture,
  status,
  apertura,
}: {
  device: DeviceSpec;
  texture: THREE.Texture;
  leftTexture: THREE.Texture;
  rightTexture: THREE.Texture;
  status: ScreenStatus;
  apertura: number;
}) {
  if (device.id === "fold") {
    return (
      <FoldMesh
        leftTexture={leftTexture}
        rightTexture={rightTexture}
        status={status}
        apertura={apertura}
      />
    );
  }
  return <Slab device={device} texture={texture} status={status} />;
}

export function deviceSpan(device: DeviceSpec, apertura: number) {
  if (device.id === "fold") {
    const frame = frameSize(FOLD_PANEL_WIDTH, 874);
    return isFoldOpen(apertura) ? frame.bodyW * 2 + 0.2 : frame.bodyW;
  }
  const profile = device.kind === "tablet" ? "tablet" : "phone";
  return frameSize(device.width, device.height, profile).bodyH;
}

export function deviceFoot(device: DeviceSpec) {
  if (device.id === "fold") return frameSize(FOLD_PANEL_WIDTH, 874).bodyH;
  const profile = device.kind === "tablet" ? "tablet" : "phone";
  return frameSize(device.width, device.height, profile).bodyH;
}
