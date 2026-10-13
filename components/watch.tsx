"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { DeviceSpec, FinishSpec } from "@/lib/devices";
import { WATCH_CASE } from "@/lib/devices";
import { roundedBodyGeometry, roundedRectGeometry } from "@/components/geometry";

/** Face height of the 46mm case, in the same scene units as the phone. */
const WATCH_UNIT = 4.9 / 46;
const PX_PER_MM = 326 / 25.4;

function useDisposable<T extends { dispose: () => void }>(geometry: T) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export function watchFrame(device: DeviceSpec) {
  const box = WATCH_CASE[device.id as keyof typeof WATCH_CASE] ?? WATCH_CASE["watch-46"];
  const bodyW = box.width * WATCH_UNIT;
  const bodyH = box.height * WATCH_UNIT;
  const depth = box.depth * WATCH_UNIT;
  const screenW = ((device.width * 2) / PX_PER_MM) * WATCH_UNIT;
  const screenH = ((device.height * 2) / PX_PER_MM) * WATCH_UNIT;
  const bezel = Math.min(bodyW - screenW, bodyH - screenH) / 2;
  const radius = Math.min(bodyW, bodyH) * 0.28;
  const glassRadius = Math.max(0.06, radius - bezel);
  const crownRadius = (box.height < 44 ? 4.2 : box.height < 48 ? 4.6 : 5.1) * WATCH_UNIT;
  const crownLength = 3.2 * WATCH_UNIT;
  const crownY = box.height * 0.17 * WATCH_UNIT;
  const buttonRadius = 1.35 * WATCH_UNIT;
  const buttonLength = (box.height < 48 ? 3.4 : 4.0) * WATCH_UNIT;
  const buttonY = crownY - crownRadius - 2.1 * WATCH_UNIT - (buttonLength / 2 + buttonRadius);
  return {
    bodyW,
    bodyH,
    depth,
    screenW,
    screenH,
    radius,
    glassRadius,
    crownRadius,
    crownLength,
    crownY,
    buttonRadius,
    buttonLength,
    buttonY,
  };
}

export function WatchMesh({
  device,
  texture,
  finish,
}: {
  device: DeviceSpec;
  texture: THREE.Texture;
  finish: FinishSpec;
}) {
  const frame = useMemo(() => watchFrame(device), [device]);
  const body = useDisposable(
    useMemo(
      () => roundedBodyGeometry(frame.bodyW, frame.bodyH, frame.depth, frame.radius),
      [frame.bodyW, frame.bodyH, frame.depth, frame.radius],
    ),
  );
  const rim = useDisposable(
    useMemo(
      () =>
        roundedRectGeometry(
          frame.screenW + 0.045,
          frame.screenH + 0.045,
          frame.glassRadius + 0.02,
        ),
      [frame.screenW, frame.screenH, frame.glassRadius],
    ),
  );
  const glass = useDisposable(
    useMemo(
      () => roundedRectGeometry(frame.screenW, frame.screenH, frame.glassRadius),
      [frame.screenW, frame.screenH, frame.glassRadius],
    ),
  );
  const zFront = frame.depth / 2 + 0.012;
  const crownX = frame.bodyW / 2 + frame.crownLength * 0.42;
  const ridges = 5;

  return (
    <group>
      <mesh geometry={body}>
        <meshStandardMaterial
          color={finish.color}
          metalness={finish.metalness}
          roughness={finish.roughness}
        />
      </mesh>
      <mesh geometry={rim} position={[0, 0, zFront - 0.004]}>
        <meshBasicMaterial color="#050505" />
      </mesh>
      <mesh
        geometry={glass}
        position={[0, 0, zFront]}
        userData={{
          screen: true,
          panel: "single",
          screenWidth: device.width,
          screenHeight: device.height,
          glassWidth: device.width,
          topInset: 0,
          bottomInset: 0,
          cutout: "none",
          landscapeStatus: 0,
        }}
      >
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <group position={[crownX, frame.crownY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh position={[0, -frame.crownLength * 0.22, 0]}>
          <cylinderGeometry args={[frame.crownRadius * 0.42, frame.crownRadius * 0.42, frame.crownLength * 0.72, 24]} />
          <meshStandardMaterial color={finish.color} metalness={0.82} roughness={0.24} />
        </mesh>
        <mesh position={[0, frame.crownLength * 0.28, 0]}>
          <cylinderGeometry args={[frame.crownRadius, frame.crownRadius, frame.crownLength * 0.62, 48]} />
          <meshStandardMaterial color={finish.color} metalness={0.84} roughness={0.22} />
        </mesh>
        {Array.from({ length: ridges }, (_, index) => {
          const along = (index / (ridges - 1) - 0.5) * frame.crownLength * 0.42;
          return (
            <mesh key={index} position={[0, frame.crownLength * 0.28 + along, 0]}>
              <cylinderGeometry
                args={[frame.crownRadius * 1.09, frame.crownRadius * 1.09, frame.crownLength * 0.07, 48]}
              />
              <meshStandardMaterial color={finish.color} metalness={0.7} roughness={0.34} />
            </mesh>
          );
        })}
      </group>
      <mesh position={[frame.bodyW / 2 + frame.buttonRadius * 0.42, frame.buttonY, 0]}>
        <capsuleGeometry args={[frame.buttonRadius, frame.buttonLength, 6, 18]} />
        <meshStandardMaterial color={finish.color} metalness={finish.metalness} roughness={Math.min(0.55, finish.roughness + 0.06)} />
      </mesh>
    </group>
  );
}
