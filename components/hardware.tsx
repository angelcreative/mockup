"use client";

import { useEffect, useMemo, type ReactNode } from "react";

import type { ButtonLayout, RearLayout } from "@/lib/devices";
import { roundedBodyGeometry } from "@/components/geometry";

const GLASS = "#07080c";
const RING = "#c5c9d0";
const PLATE = "#12141a";
const RIM = "#b7bec6";
const FLASH = "#f3eee4";

function useGeometry<T extends { dispose: () => void }>(geometry: T) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function Plateau({
  width,
  height,
  depth,
  radius,
  color,
  metalness = 0.4,
  roughness = 0.38,
}: {
  width: number;
  height: number;
  depth: number;
  radius: number;
  color: string;
  metalness?: number;
  roughness?: number;
}) {
  const geometry = useGeometry(
    useMemo(
      () => roundedBodyGeometry(width, height, depth, radius),
      [width, height, depth, radius],
    ),
  );
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

function Lens({
  position,
  radius,
}: {
  position: [number, number, number];
  radius: number;
}) {
  return (
    <group position={position}>
      <mesh>
        <circleGeometry args={[radius * 1.16, 32]} />
        <meshStandardMaterial color={RING} metalness={0.88} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <circleGeometry args={[radius, 28]} />
        <meshStandardMaterial color={GLASS} metalness={0.62} roughness={0.16} />
      </mesh>
      <mesh position={[radius * 0.32, radius * 0.32, 0.01]}>
        <circleGeometry args={[Math.max(0.012, radius * 0.14), 12]} />
        <meshBasicMaterial color="#f7f8fa" />
      </mesh>
    </group>
  );
}

function Flash({
  position,
  radius,
}: {
  position: [number, number, number];
  radius: number;
}) {
  return (
    <group position={position}>
      <mesh>
        <circleGeometry args={[radius, 20]} />
        <meshStandardMaterial color={FLASH} metalness={0.08} roughness={0.32} />
      </mesh>
      <mesh position={[radius * 0.2, 0, 0.004]}>
        <circleGeometry args={[radius * 0.38, 14]} />
        <meshStandardMaterial color="#e7c98a" metalness={0.12} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Pin({
  position,
  radius,
  color = "#1a1c20",
}: {
  position: [number, number, number];
  radius: number;
  color?: string;
}) {
  return (
    <mesh position={position}>
      <circleGeometry args={[radius, 16]} />
      <meshStandardMaterial color={color} metalness={0.4} roughness={0.35} />
    </mesh>
  );
}

function Module({
  children,
  plate,
  rim,
}: {
  children: ReactNode;
  plate: { width: number; height: number; radius: number };
  rim?: { width: number; height: number; radius: number };
}) {
  const face = 0.045;
  return (
    <group>
      {rim ? (
        <group position={[0, 0, -0.01]}>
          <Plateau
            width={rim.width}
            height={rim.height}
            depth={0.03}
            radius={rim.radius}
            color={RIM}
            metalness={0.8}
            roughness={0.28}
          />
        </group>
      ) : null}
      <Plateau width={plate.width} height={plate.height} depth={0.055} radius={plate.radius} color={PLATE} />
      <group position={[0, 0, face]}>{children}</group>
    </group>
  );
}

function layoutFor(rear: RearLayout) {
  if (rear === "iphone-14") {
    return (
      <Module plate={{ width: 0.92, height: 0.92, radius: 0.22 }} rim={{ width: 0.98, height: 0.98, radius: 0.24 }}>
        <Lens position={[-0.2, 0.2, 0]} radius={0.16} />
        <Lens position={[0.2, -0.2, 0]} radius={0.17} />
        <Flash position={[0.24, 0.24, 0]} radius={0.055} />
        <Pin position={[-0.26, -0.26, 0]} radius={0.028} />
      </Module>
    );
  }
  if (rear === "iphone-15") {
    return (
      <group>
        <Module plate={{ width: 0.72, height: 1.48, radius: 0.34 }} rim={{ width: 0.78, height: 1.54, radius: 0.36 }}>
          <Lens position={[0, 0.32, 0]} radius={0.175} />
          <Lens position={[0, -0.32, 0]} radius={0.175} />
        </Module>
        <Flash position={[0.56, 0.42, 0.04]} radius={0.06} />
        <Pin position={[0.56, 0.18, 0.04]} radius={0.028} />
      </group>
    );
  }
  if (rear === "iphone-16") {
    return (
      <group>
        <Module plate={{ width: 0.74, height: 1.68, radius: 0.36 }} rim={{ width: 0.8, height: 1.74, radius: 0.38 }}>
          <Lens position={[0, 0.4, 0]} radius={0.18} />
          <Lens position={[0, -0.4, 0]} radius={0.18} />
        </Module>
        <Flash position={[0.58, 0.12, 0.04]} radius={0.062} />
        <Pin position={[0.58, -0.16, 0.04]} radius={0.026} />
      </group>
    );
  }
  if (rear === "iphone-16-pro") {
    return (
      <Module plate={{ width: 1.38, height: 1.38, radius: 0.32 }} rim={{ width: 1.46, height: 1.46, radius: 0.34 }}>
        <Lens position={[-0.32, 0.32, 0]} radius={0.2} />
        <Lens position={[0.32, 0.32, 0]} radius={0.18} />
        <Lens position={[-0.32, -0.3, 0]} radius={0.22} />
        <Flash position={[0.3, -0.05, 0]} radius={0.07} />
        <Pin position={[0.32, -0.32, 0]} radius={0.055} color="#0c0e12" />
        <Pin position={[0.32, -0.32, 0.008]} radius={0.02} color="#3a3e46" />
      </Module>
    );
  }
  if (rear === "iphone-duo") {
    return (
      <group>
        <Module plate={{ width: 0.86, height: 1.72, radius: 0.4 }} rim={{ width: 0.94, height: 1.8, radius: 0.42 }}>
          <Lens position={[0, 0.38, 0]} radius={0.2} />
          <Lens position={[0, -0.38, 0]} radius={0.2} />
        </Module>
        <Flash position={[0.66, 0.05, 0.04]} radius={0.07} />
      </group>
    );
  }
  if (rear === "ipad-pro") {
    return (
      <Module plate={{ width: 1.15, height: 0.46, radius: 0.2 }} rim={{ width: 1.22, height: 0.52, radius: 0.22 }}>
        <Lens position={[-0.34, 0, 0]} radius={0.13} />
        <Pin position={[-0.02, 0.02, 0]} radius={0.055} color="#0c0e12" />
        <Pin position={[-0.02, 0.02, 0.008]} radius={0.02} color="#3a3e46" />
        <Flash position={[0.26, 0.06, 0]} radius={0.045} />
        <Pin position={[0.42, 0.08, 0]} radius={0.018} />
        <Pin position={[0.42, -0.08, 0]} radius={0.014} color="#2a2418" />
      </Module>
    );
  }
  if (rear === "ipad-air") {
    return (
      <Module plate={{ width: 0.42, height: 0.42, radius: 0.12 }} rim={{ width: 0.48, height: 0.48, radius: 0.14 }}>
        <Lens position={[0, 0, 0]} radius={0.12} />
      </Module>
    );
  }
  if (rear === "ipad") {
    return (
      <Module plate={{ width: 0.36, height: 0.36, radius: 0.18 }} rim={{ width: 0.42, height: 0.42, radius: 0.21 }}>
        <Lens position={[0, 0, 0]} radius={0.11} />
      </Module>
    );
  }
  return (
    <Module plate={{ width: 0.72, height: 0.4, radius: 0.16 }} rim={{ width: 0.78, height: 0.46, radius: 0.18 }}>
      <Lens position={[-0.14, 0, 0]} radius={0.11} />
      <Flash position={[0.18, 0, 0]} radius={0.045} />
    </Module>
  );
}

/** Local bounds of each module, including a side flash and the bevel on the plate. */
const MODULE_EXTENT: Record<RearLayout, { minX: number; maxX: number; minY: number; maxY: number }> = {
  "iphone-14": { minX: -0.51, maxX: 0.51, minY: -0.51, maxY: 0.51 },
  "iphone-15": { minX: -0.41, maxX: 0.64, minY: -0.79, maxY: 0.79 },
  "iphone-16": { minX: -0.42, maxX: 0.67, minY: -0.89, maxY: 0.89 },
  "iphone-16-pro": { minX: -0.75, maxX: 0.75, minY: -0.75, maxY: 0.75 },
  "iphone-duo": { minX: -0.49, maxX: 0.75, minY: -0.92, maxY: 0.92 },
  "ipad-pro": { minX: -0.63, maxX: 0.63, minY: -0.28, maxY: 0.28 },
  "ipad-air": { minX: -0.26, maxX: 0.26, minY: -0.26, maxY: 0.26 },
  ipad: { minX: -0.23, maxX: 0.23, minY: -0.23, maxY: 0.23 },
  "ipad-mini": { minX: -0.41, maxX: 0.41, minY: -0.25, maxY: 0.25 },
};

export function RearModule({
  rear,
  bodyW,
  bodyH,
  depth,
  radius,
}: {
  rear: RearLayout;
  bodyW: number;
  bodyH: number;
  depth: number;
  radius: number;
}) {
  const scale = rear === "iphone-duo" ? 0.72 : 1;
  const box = MODULE_EXTENT[rear];
  const minX = box.minX * scale;
  const maxX = box.maxX * scale;
  const minY = box.minY * scale;
  const maxY = box.maxY * scale;
  // The body's corner is an arc. Inset far enough that the module's outer corner stays on that arc.
  const margin = Math.max(0.09, radius * 0.32);
  const limitX = bodyW / 2 - margin;
  const limitY = bodyH / 2 - margin;
  let x = limitX - maxX;
  let y = limitY - maxY;
  if (x + minX < -limitX) x = -(minX + maxX) / 2;
  if (y + minY < -limitY) y = -(minY + maxY) / 2;
  const z = -depth / 2 - 0.09;
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI, 0]} scale={scale}>
      {layoutFor(rear)}
    </group>
  );
}

function Bar({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={0.62} roughness={0.32} />
    </mesh>
  );
}

export function SideControls({
  layout,
  bodyW,
  bodyH,
  color,
  edge = "both",
}: {
  layout: ButtonLayout;
  bodyW: number;
  bodyH: number;
  color: string;
  edge?: "both" | "left" | "right";
}) {
  // The side wall at mid-depth is the unbevelled silhouette, x = ±bodyW/2.
  // Seat the bar so it bites the metal by a hair and the rest stands proud.
  const overlap = 0.008;
  const xAt = (side: -1 | 1, thickness: number) => side * (bodyW / 2 + thickness / 2 - overlap);
  const yAt = (side: -1 | 1, thickness: number) => side * (bodyH / 2 + thickness / 2 - overlap);
  const top = bodyH * 0.32;

  if (layout === "ipad") {
    return (
      <group>
        <Bar position={[xAt(1, 0.018), top, 0]} size={[0.018, 0.22, 0.032]} color={color} />
        <Bar position={[xAt(1, 0.018), top - 0.32, 0]} size={[0.018, 0.22, 0.032]} color={color} />
        <Bar position={[xAt(1, 0.016), top - 0.78, 0]} size={[0.016, 0.16, 0.03]} color={color} />
        <Bar position={[0, yAt(-1, 0.012), 0]} size={[0.16, 0.012, 0.028]} color="#1a1c20" />
      </group>
    );
  }

  if (layout === "mini") {
    return (
      <group>
        <Bar position={[xAt(-1, 0.016), top, 0]} size={[0.016, 0.2, 0.03]} color={color} />
        <Bar position={[xAt(-1, 0.016), top - 0.28, 0]} size={[0.016, 0.2, 0.03]} color={color} />
        <Bar position={[bodyW * 0.22, yAt(1, 0.016), 0]} size={[0.18, 0.016, 0.03]} color={color} />
        <Bar position={[0, yAt(-1, 0.012), 0]} size={[0.14, 0.012, 0.026]} color="#1a1c20" />
      </group>
    );
  }

  if (layout === "duo") {
    return (
      <group>
        {edge !== "right" ? (
          <>
            <Bar position={[xAt(-1, 0.02), 0.55, 0]} size={[0.02, 0.26, 0.042]} color={color} />
            <Bar position={[xAt(-1, 0.02), 0.18, 0]} size={[0.02, 0.26, 0.042]} color={color} />
          </>
        ) : null}
        {edge !== "left" ? (
          <Bar position={[xAt(1, 0.02), 0.42, 0]} size={[0.02, 0.38, 0.042]} color={color} />
        ) : null}
      </group>
    );
  }

  const mute = layout === "switch";
  const muteSize: [number, number, number] = mute ? [0.016, 0.12, 0.036] : [0.02, 0.22, 0.042];
  return (
    <group>
      <Bar position={[xAt(-1, muteSize[0]), top + 0.15, 0]} size={muteSize} color={color} />
      <Bar position={[xAt(-1, 0.02), top - 0.28, 0]} size={[0.02, 0.28, 0.044]} color={color} />
      <Bar position={[xAt(-1, 0.02), top - 0.66, 0]} size={[0.02, 0.28, 0.044]} color={color} />
      <Bar position={[xAt(1, 0.02), top - 0.05, 0]} size={[0.02, 0.46, 0.044]} color={color} />
      {layout === "action" ? (
        <Bar position={[xAt(1, 0.016), top - 1.15, 0]} size={[0.016, 0.52, 0.036]} color={color} />
      ) : null}
      <Bar position={[0, yAt(-1, 0.014), 0]} size={[0.14, 0.014, 0.03]} color="#14161a" />
      <Bar position={[xAt(-1, 0.008), -bodyH * 0.22, 0]} size={[0.008, 0.14, 0.02]} color="#0c0d10" />
      <Bar position={[xAt(-1, 0.008), bodyH * 0.08, 0]} size={[0.008, 0.14, 0.02]} color="#0c0d10" />
      <Bar position={[xAt(1, 0.008), -bodyH * 0.22, 0]} size={[0.008, 0.14, 0.02]} color="#0c0d10" />
      <Bar position={[xAt(1, 0.008), bodyH * 0.08, 0]} size={[0.008, 0.14, 0.02]} color="#0c0d10" />
    </group>
  );
}
