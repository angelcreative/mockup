import * as THREE from "three";

export function roundedRectShape(width: number, height: number, radius: number) {
  const r = Math.min(Math.max(radius, 0.001), width / 2, height / 2);
  const shape = new THREE.Shape();
  shape.moveTo(r, 0);
  shape.lineTo(width - r, 0);
  shape.absarc(width - r, r, r, -Math.PI / 2, 0, false);
  shape.lineTo(width, height - r);
  shape.absarc(width - r, height - r, r, 0, Math.PI / 2, false);
  shape.lineTo(r, height);
  shape.absarc(r, height - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(0, r);
  shape.absarc(r, r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

export function roundedRectGeometry(width: number, height: number, radius: number) {
  const geometry = new THREE.ShapeGeometry(roundedRectShape(width, height, radius), 16);
  geometry.translate(-width / 2, -height / 2, 0);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let index = 0; index < position.count; index += 1) {
    uv.setXY(
      index,
      (position.getX(index) + width / 2) / width,
      (position.getY(index) + height / 2) / height,
    );
  }
  uv.needsUpdate = true;
  return geometry;
}

export function roundedBodyGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
) {
  const bevel = Math.min(0.03, depth * 0.2);
  const geometry = new THREE.ExtrudeGeometry(roundedRectShape(width, height, radius), {
    depth: Math.max(0.04, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 16,
  });
  geometry.translate(-width / 2, -height / 2, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export const SCREEN_HEIGHT = 4.72;

export function frameSize(
  cssWidth: number,
  cssHeight: number,
  profile: "phone" | "tablet" = "phone",
) {
  const aspect = cssWidth / cssHeight;
  const screenH = profile === "tablet" ? 4.15 : SCREEN_HEIGHT;
  const screenW = screenH * aspect;
  const bezel =
    profile === "tablet"
      ? Math.max(0.038, Math.min(screenW, screenH) * 0.016)
      : Math.max(0.07, screenW * 0.038);
  const bodyW = screenW + bezel * 2;
  const bodyH = screenH + bezel * 2;
  const depth = profile === "tablet" ? 0.08 : 0.15;
  const radius =
    profile === "tablet" ? Math.min(screenW, screenH) * 0.045 : Math.min(bodyW * 0.18, 0.42);
  return { screenW, screenH, bodyW, bodyH, depth, radius, aspect, bezel };
}

export function topNotchGeometry(width: number, height: number, radius: number) {
  const r = Math.min(Math.max(radius, 0.001), width / 2, height);
  const w = width / 2;
  const h = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w, h);
  shape.lineTo(w, h);
  shape.lineTo(w, -h + r);
  shape.absarc(w - r, -h + r, r, 0, -Math.PI / 2, true);
  shape.lineTo(-w + r, -h);
  shape.absarc(-w + r, -h + r, r, -Math.PI / 2, -Math.PI, true);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 12);
}
