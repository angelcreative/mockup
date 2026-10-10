"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { DeviceSpec, FinishSpec, Orientation, ScreenStatus } from "@/lib/devices";
import {
  DUO_BODY,
  DUO_CM,
  DUO_INNER_HEIGHT,
  DUO_INNER_WIDTH,
  DUO_OUTER_HEIGHT,
  DUO_OUTER_WIDTH,
  ISLAND_POINTS,
  NOTCH_POINTS,
  isDuoOpen,
} from "@/lib/devices";
import {
  frameSize,
  halfPillGeometry,
  roundedBodyGeometry,
  roundedRectGeometry,
  topNotchGeometry,
} from "@/components/geometry";
import { RearModule, SideControls } from "@/components/hardware";
import { AppleLogo } from "@/components/logo";
import { ImacMesh, LaptopMesh, macFoot, macSpan } from "@/components/macs";
import { landscapeStatusPx } from "@/lib/devices";

function useDisposable<T extends { dispose: () => void }>(geometry: T) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function ScreenSpinner({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z -= delta * 4.2;
    invalidate();
  });

  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[0.105, 0.132, 48, 1, 0, Math.PI * 1.35]} />
      <meshBasicMaterial color="#171717" />
    </mesh>
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
    glassWidth: device.width,
    topInset: device.topInset,
    bottomInset: device.bottomInset,
    cutout: device.cutout,
    landscapeStatus: landscapeStatusPx(device),
  };
}

function backFace(depth: number) {
  const bevel = Math.min(0.03, depth * 0.2);
  return -(depth / 2 + bevel + 0.008);
}

function Slab({
  device,
  texture,
  status,
  finish,
  logoLight,
}: {
  device: DeviceSpec;
  texture: THREE.Texture;
  status: ScreenStatus;
  finish: FinishSpec;
  logoLight: boolean;
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

  const zFront = frame.depth / 2 + 0.012;
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
      <RearModule
        rear={device.rear}
        bodyW={frame.bodyW}
        bodyH={frame.bodyH}
        depth={frame.depth}
        radius={frame.radius}
      />
      <AppleLogo
        size={Math.min(frame.bodyW, frame.bodyH) * (profile === "tablet" ? 0.16 : 0.22)}
        position={[0, 0, backFace(frame.depth)]}
        lit={logoLight}
        finish={finish.color}
      />
      <SideControls
        layout={device.buttons}
        bodyW={frame.bodyW}
        bodyH={frame.bodyH}
        color={finish.color}
      />
      {status === "loading" ? <ScreenSpinner position={[0, 0.15, zFront + 0.02]} /> : null}
    </group>
  );
}

function hitData(
  panel: "single" | "left" | "right",
  screenWidth: number,
  screenHeight: number,
  interactive: boolean,
  glassWidth: number,
) {
  return {
    screen: interactive,
    panel,
    screenWidth,
    screenHeight,
    glassWidth,
    topInset: 59,
    bottomInset: 34,
    cutout: "island" as const,
    landscapeStatus: 32,
  };
}

function DuoMesh({
  texture,
  leftTexture,
  rightTexture,
  status,
  apertura,
  finish,
  logoLight,
}: {
  texture: THREE.Texture;
  leftTexture: THREE.Texture;
  rightTexture: THREE.Texture;
  status: ScreenStatus;
  apertura: number;
  finish: FinishSpec;
  logoLight: boolean;
}) {
  const bodyW = DUO_BODY.closedWidth * DUO_CM;
  const bodyH = DUO_BODY.height * DUO_CM;
  const depth = DUO_BODY.openDepth * DUO_CM;
  const radius = 0.46 * DUO_CM;
  const outerW = (1398 / 460) * 2.54 * DUO_CM;
  const outerH = (2034 / 460) * 2.54 * DUO_CM;
  const innerH = (1878 / 430) * 2.54 * DUO_CM;
  const innerHalfW = ((2670 / 430) * 2.54 * DUO_CM) / 2;
  const open = isDuoOpen(apertura);

  const body = useDisposable(
    useMemo(
      () => roundedBodyGeometry(bodyW, bodyH, depth, radius),
      [bodyW, bodyH, depth, radius],
    ),
  );
  const innerGlass = useDisposable(
    useMemo(
      () => roundedRectGeometry(innerHalfW, innerH, Math.max(0.05, radius * 0.72)),
      [innerHalfW, innerH, radius],
    ),
  );
  const outerGlass = useDisposable(
    useMemo(
      () => roundedRectGeometry(outerW, outerH, Math.max(0.05, radius * 0.72)),
      [outerW, outerH, radius],
    ),
  );
  const outerIsland = useDisposable(
    useMemo(() => {
      const height = outerH * (ISLAND_POINTS.height / DUO_OUTER_HEIGHT);
      const width = outerW * (ISLAND_POINTS.width / DUO_OUTER_WIDTH);
      return roundedRectGeometry(width, height, height / 2);
    }, [outerH, outerW]),
  );
  const innerIsland = useDisposable(
    useMemo(() => {
      const height = innerH * (ISLAND_POINTS.height / DUO_INNER_HEIGHT);
      const width = ((innerHalfW * 2) * (ISLAND_POINTS.width / DUO_INNER_WIDTH)) / 2;
      return {
        height,
        width,
        left: halfPillGeometry(width, height, "left"),
        right: halfPillGeometry(width, height, "right"),
        dispose() {
          this.left.dispose();
          this.right.dispose();
        },
      };
    }, [innerH, innerHalfW]),
  );

  // ExtrudeGeometry's bevel makes the shell thicker than `depth` on the back face.
  const zFront = depth / 2 + 0.08;
  const gap = 0.045 * apertura;
  const centerShift = (bodyW / 2) * (1 - apertura);
  const stack = (depth + 0.07) * (1 - apertura);
  const innerShift = (bodyW - innerHalfW) / 2 + 0.04;
  const outerIslandH = outerH * (ISLAND_POINTS.height / DUO_OUTER_HEIGHT);
  const outerIslandY = outerH / 2 - outerH * (ISLAND_POINTS.top / DUO_OUTER_HEIGHT) - outerIslandH / 2;
  const innerIslandY = innerH / 2 - innerH * (ISLAND_POINTS.top / DUO_INNER_HEIGHT) - innerIsland.height / 2;
  const islandOverlap = innerIsland.width * 0.1;
  const hingeMetal = "#c5ccd4";

  return (
    <group position={[centerShift, 0, 0]}>
      <mesh position={[0.03, 0, 0]}>
        <cylinderGeometry args={[0.048, 0.048, bodyH * 0.78, 28]} />
        <meshStandardMaterial color={hingeMetal} metalness={0.88} roughness={0.22} />
      </mesh>
      <group position={[-bodyW / 2, 0, 0]}>
        <mesh geometry={body}>
          <meshStandardMaterial color={finish.color} metalness={finish.metalness} roughness={finish.roughness} />
        </mesh>
          <mesh
            geometry={innerGlass}
            position={[innerShift, 0, zFront]}
            visible={open}
            userData={hitData("left", DUO_INNER_WIDTH / 2, DUO_INNER_HEIGHT, open, DUO_INNER_WIDTH)}
          >
          <meshBasicMaterial map={leftTexture} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {open ? (
          <mesh geometry={innerIsland.left} position={[bodyW / 2 + islandOverlap, innerIslandY, zFront + 0.012]}>
            <meshBasicMaterial color="#050505" side={THREE.DoubleSide} />
          </mesh>
        ) : null}
        <RearModule rear="iphone-duo" bodyW={bodyW} bodyH={bodyH} depth={depth} radius={radius} />
        <AppleLogo
          size={Math.min(bodyW, bodyH) * 0.16}
          position={[0, 0, backFace(depth)]}
          lit={logoLight}
          finish={finish.color}
        />
        <SideControls layout="duo" bodyW={bodyW} bodyH={bodyH} color={finish.color} edge="left" />
        {status === "loading" && open ? <ScreenSpinner position={[innerShift, 0.1, zFront + 0.02]} /> : null}
      </group>
      <group position={[0, 0, 0]} rotation={[0, (1 - apertura) * Math.PI, 0]}>
        <group position={[bodyW / 2 + gap, 0, -stack]}>
          <mesh geometry={body}>
            <meshStandardMaterial color={finish.color} metalness={finish.metalness} roughness={finish.roughness} />
          </mesh>
          <mesh
            geometry={innerGlass}
            position={[-innerShift, 0, zFront]}
            visible={open}
            userData={hitData("right", DUO_INNER_WIDTH / 2, DUO_INNER_HEIGHT, open, DUO_INNER_WIDTH)}
          >
            <meshBasicMaterial map={rightTexture} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          {open ? (
            <mesh
              geometry={innerIsland.right}
              position={[-bodyW / 2 - gap - islandOverlap, innerIslandY, zFront + 0.012]}
            >
              <meshBasicMaterial color="#050505" side={THREE.DoubleSide} />
            </mesh>
          ) : null}
          <group position={[0, 0, -zFront]} rotation={[0, Math.PI, 0]}>
            <mesh
              geometry={outerGlass}
              visible={!open}
              userData={hitData("single", DUO_OUTER_WIDTH, DUO_OUTER_HEIGHT, !open, DUO_OUTER_WIDTH)}
            >
              <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            {open ? null : (
              <mesh geometry={outerIsland} position={[0, outerIslandY, 0.01]}>
                <meshBasicMaterial color="#050505" />
              </mesh>
            )}
          </group>
          <SideControls layout="duo" bodyW={bodyW} bodyH={bodyH} color={finish.color} edge="right" />
          {status === "loading" && !open ? <ScreenSpinner position={[0, 0.1, -zFront - 0.02]} /> : null}
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
  finish,
  logoLight,
}: {
  device: DeviceSpec;
  texture: THREE.Texture;
  leftTexture: THREE.Texture;
  rightTexture: THREE.Texture;
  status: ScreenStatus;
  apertura: number;
  finish: FinishSpec;
  logoLight: boolean;
}) {
  if (device.id === "iphone-duo") {
    return (
      <DuoMesh
        texture={texture}
        leftTexture={leftTexture}
        rightTexture={rightTexture}
        status={status}
        apertura={apertura}
        finish={finish}
        logoLight={logoLight}
      />
    );
  }
  if (device.kind === "laptop") {
    return (
      <LaptopMesh
        device={device}
        texture={texture}
        status={status}
        apertura={apertura}
        finish={finish}
        logoLight={logoLight}
      />
    );
  }
  if (device.kind === "desktop") {
    return <ImacMesh device={device} texture={texture} status={status} finish={finish} logoLight={logoLight} />;
  }
  return <Slab device={device} texture={texture} status={status} finish={finish} logoLight={logoLight} />;
}

export function deviceSpan(device: DeviceSpec, apertura: number) {
  if (device.kind === "laptop" || device.kind === "desktop") return macSpan(device, apertura);
  if (device.id === "iphone-duo") {
    const width = (isDuoOpen(apertura) ? DUO_BODY.openWidth : DUO_BODY.closedWidth) * DUO_CM;
    return Math.max(width, DUO_BODY.height * DUO_CM);
  }
  const profile = device.kind === "tablet" ? "tablet" : "phone";
  return frameSize(device.width, device.height, profile).bodyH;
}

export function deviceFoot(
  device: DeviceSpec,
  orientation: Orientation = "portrait",
  apertura = 0,
) {
  if (device.kind === "laptop" || device.kind === "desktop") return macFoot(device, apertura);
  if (device.id === "iphone-duo") {
    const vertical =
      orientation === "landscape"
        ? isDuoOpen(apertura)
          ? DUO_BODY.openWidth
          : DUO_BODY.closedWidth
        : DUO_BODY.height;
    return vertical * DUO_CM;
  }
  const profile = device.kind === "tablet" ? "tablet" : "phone";
  const frame = frameSize(device.width, device.height, profile);
  return orientation === "landscape" ? frame.bodyW : frame.bodyH;
}
