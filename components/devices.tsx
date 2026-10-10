"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { DeviceSpec, ScreenStatus } from "@/lib/devices";
import { frameSize, roundedBodyGeometry, roundedRectGeometry } from "@/components/geometry";

const FINISH = {
  midnight: { color: "#16161a", metalness: 0.42, roughness: 0.46 },
  black: { color: "#1c1c1f", metalness: 0.4, roughness: 0.48 },
  graphite: { color: "#2a2c31", metalness: 0.48, roughness: 0.42 },
  titanium: { color: "#8d8a83", metalness: 0.62, roughness: 0.36 },
} as const;

function useDisposable<T extends { dispose: () => void }>(geometry: T) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function coverMap(source: THREE.Texture, imageAspect: number, targetAspect: number) {
  const map = source.clone();
  if (imageAspect > targetAspect) {
    const repeatX = targetAspect / imageAspect;
    map.repeat.set(repeatX, 1);
    map.offset.set((1 - repeatX) / 2, 0);
  } else {
    const repeatY = imageAspect / targetAspect;
    map.repeat.set(1, repeatY);
    map.offset.set(0, (1 - repeatY) / 2);
  }
  map.needsUpdate = true;
  return map;
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
  side = "both",
}: {
  bodyW: number;
  color: string;
  side?: "both" | "left";
}) {
  return (
    <group>
      <mesh position={[-bodyW / 2 - 0.012, 0.62, 0]}>
        <boxGeometry args={[0.022, 0.2, 0.048]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.38} />
      </mesh>
      <mesh position={[-bodyW / 2 - 0.012, 0.26, 0]}>
        <boxGeometry args={[0.022, 0.34, 0.048]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.38} />
      </mesh>
      {side === "both" ? (
        <mesh position={[bodyW / 2 + 0.012, 0.38, 0]}>
          <boxGeometry args={[0.022, 0.5, 0.048]} />
          <meshStandardMaterial color={color} metalness={0.55} roughness={0.38} />
        </mesh>
      ) : null}
    </group>
  );
}

function PhoneMesh({
  device,
  texture,
  image,
  status,
}: {
  device: DeviceSpec;
  texture: THREE.Texture;
  image: HTMLImageElement | null;
  status: ScreenStatus;
}) {
  const frame = useMemo(
    () => frameSize(device.width, device.height),
    [device.width, device.height],
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
          Math.max(0.08, frame.radius - 0.08),
        ),
      [frame.screenW, frame.screenH, frame.radius],
    ),
  );
  const notch = useDisposable(
    useMemo(() => {
      const width = frame.screenW * 0.48;
      const height = frame.screenH * 0.034;
      return roundedRectGeometry(width, height, height * 0.42);
    }, [frame.screenW, frame.screenH]),
  );
  const island = useDisposable(
    useMemo(() => {
      const width = frame.screenW * 0.34;
      const height = frame.screenH * 0.031;
      return roundedRectGeometry(width, height, height / 2);
    }, [frame.screenW, frame.screenH]),
  );
  const home = useDisposable(
    useMemo(() => roundedRectGeometry(frame.screenW * 0.34, 0.02, 0.01), [frame.screenW]),
  );
  const fitted = useMemo(() => {
    if (!image) return texture;
    return coverMap(texture, image.width / Math.max(1, image.height), device.width / device.height);
  }, [texture, image, device.width, device.height]);

  useEffect(() => {
    if (fitted !== texture) return () => fitted.dispose();
  }, [fitted, texture]);

  const finish = FINISH[device.finish];
  const zFront = frame.depth / 2 + 0.01;
  const notchH = frame.screenH * 0.034;
  const islandH = frame.screenH * 0.031;

  return (
    <group>
      <mesh geometry={body}>
        <meshStandardMaterial
          color={finish.color}
          metalness={finish.metalness}
          roughness={finish.roughness}
        />
      </mesh>
      <mesh geometry={screen} position={[0, 0, zFront]}>
        <meshBasicMaterial map={fitted} toneMapped={false} />
      </mesh>
      {device.cutout === "notch" ? (
        <mesh geometry={notch} position={[0, frame.screenH / 2 - notchH * 0.22, zFront + 0.008]}>
          <meshBasicMaterial color="#050505" />
        </mesh>
      ) : null}
      {device.cutout === "island" ? (
        <mesh
          geometry={island}
          position={[0, frame.screenH / 2 - islandH - frame.screenH * 0.016, zFront + 0.008]}
        >
          <meshBasicMaterial color="#050505" />
        </mesh>
      ) : null}
      <mesh geometry={home} position={[0, -frame.screenH / 2 + 0.1, zFront + 0.008]}>
        <meshBasicMaterial color="#050505" transparent opacity={0.55} />
      </mesh>
      <SideButtons bodyW={frame.bodyW} color={finish.color} />
      {status === "loading" ? <ScreenSpinner position={[0, 0.78, zFront + 0.02]} /> : null}
    </group>
  );
}

function FoldMesh({
  texture,
  image,
  status,
  apertura,
}: {
  texture: THREE.Texture;
  image: HTMLImageElement | null;
  status: ScreenStatus;
  apertura: number;
}) {
  const frame = useMemo(() => frameSize(384, 874), []);
  const depth = frame.depth * 0.78;
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
  const maps = useMemo(() => {
    if (!image) return { left: texture, right: texture, cloned: false };
    const target = 768 / 874;
    const imageAspect = image.width / Math.max(1, image.height);
    const left = texture.clone();
    const right = texture.clone();
    if (imageAspect > target) {
      const visible = target / imageAspect;
      const start = (1 - visible) / 2;
      left.repeat.set(visible / 2, 1);
      left.offset.set(start, 0);
      right.repeat.set(visible / 2, 1);
      right.offset.set(start + visible / 2, 0);
    } else {
      const visibleY = imageAspect / target;
      const y = (1 - visibleY) / 2;
      left.repeat.set(0.5, visibleY);
      left.offset.set(0, y);
      right.repeat.set(0.5, visibleY);
      right.offset.set(0.5, y);
    }
    left.needsUpdate = true;
    right.needsUpdate = true;
    return { left, right, cloned: true };
  }, [texture, image]);

  useEffect(() => {
    if (!maps.cloned) return;
    return () => {
      maps.left.dispose();
      maps.right.dispose();
    };
  }, [maps]);

  const finish = FINISH.black;
  const zFront = depth / 2 + 0.01;
  const closed = 1 - apertura;
  const shift = -frame.bodyW / 2 - (apertura * frame.bodyW) / 2;

  return (
    <group position={[shift, 0, 0]}>
      <group position={[frame.bodyW / 2, 0, 0]}>
        <mesh geometry={body}>
          <meshStandardMaterial
            color={finish.color}
            metalness={finish.metalness}
            roughness={finish.roughness}
          />
        </mesh>
        <mesh geometry={screen} position={[0, 0, zFront]}>
          <meshBasicMaterial map={maps.left} toneMapped={false} />
        </mesh>
        <SideButtons bodyW={frame.bodyW} color={finish.color} side="left" />
        {apertura < 0.18 ? (
          <mesh position={[frame.bodyW / 2 + 0.012, 0.38, 0]}>
            <boxGeometry args={[0.022, 0.5, 0.048]} />
            <meshStandardMaterial color={finish.color} metalness={0.55} roughness={0.38} />
          </mesh>
        ) : null}
        {status === "loading" ? <ScreenSpinner position={[0, 0.78, zFront + 0.02]} /> : null}
      </group>

      <group position={[frame.bodyW, 0, -depth * closed]} rotation={[0, closed * Math.PI, 0]}>
        <group position={[frame.bodyW / 2, 0, 0]}>
          <mesh geometry={body}>
            <meshStandardMaterial
              color={finish.color}
              metalness={finish.metalness}
              roughness={finish.roughness}
            />
          </mesh>
          <mesh geometry={screen} position={[0, 0, zFront]}>
            <meshBasicMaterial map={maps.right} toneMapped={false} />
          </mesh>
        </group>
      </group>

      <mesh position={[frame.bodyW, 0, 0]} visible={apertura > 0.08}>
        <cylinderGeometry args={[depth * 0.34, depth * 0.34, frame.bodyH * 0.985, 24]} />
        <meshStandardMaterial color="#121214" metalness={0.72} roughness={0.32} />
      </mesh>
    </group>
  );
}

export function DeviceModel({
  device,
  texture,
  image,
  status,
  apertura,
}: {
  device: DeviceSpec;
  texture: THREE.Texture;
  image: HTMLImageElement | null;
  status: ScreenStatus;
  apertura: number;
}) {
  if (device.id === "fold") {
    return (
      <FoldMesh texture={texture} image={image} status={status} apertura={apertura} />
    );
  }

  return <PhoneMesh device={device} texture={texture} image={image} status={status} />;
}

export function deviceBodyHeight(device: DeviceSpec) {
  if (device.id === "fold") return frameSize(384, 874).bodyH;
  return frameSize(device.width, device.height).bodyH;
}
