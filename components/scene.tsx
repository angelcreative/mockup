"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type { BackgroundId, DeviceSpec, ScreenState } from "@/lib/devices";
import { BACKGROUNDS, liveViewport } from "@/lib/devices";
import { DeviceModel, deviceFoot, deviceSpan } from "@/components/devices";
import { paintScreen } from "@/components/chrome";
import { uvToCss, type ScreenPanel } from "@/lib/pointer";

export type ScreenInput =
  | { action: "move" | "down" | "up"; x: number; y: number; button: number }
  | { action: "wheel"; x: number; y: number; button: number; deltaX: number; deltaY: number };

function makeCanvasTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function copyPanel(source: HTMLCanvasElement, target: HTMLCanvasElement, mode: "full" | "left" | "right") {
  const sw = mode === "full" ? source.width : Math.max(1, Math.floor(source.width / 2));
  const sx = mode === "right" ? source.width - sw : 0;
  if (target.width !== sw) target.width = sw;
  if (target.height !== source.height) target.height = source.height;
  const context = target.getContext("2d");
  if (!context) return;
  context.drawImage(source, sx, 0, sw, source.height, 0, 0, sw, source.height);
}

function useDeviceTexture(
  device: DeviceSpec,
  frame: ImageBitmap | null,
  status: ScreenState["status"],
  message: string,
  clock: number,
  apertura: number,
) {
  const canvas = useState(() => document.createElement("canvas"))[0];
  const leftCanvas = useState(() => document.createElement("canvas"))[0];
  const rightCanvas = useState(() => document.createElement("canvas"))[0];
  const texture = useMemo(() => makeCanvasTexture(canvas), [canvas]);
  const leftTexture = useMemo(() => makeCanvasTexture(leftCanvas), [leftCanvas]);
  const rightTexture = useMemo(() => makeCanvasTexture(rightCanvas), [rightCanvas]);

  useLayoutEffect(() => {
    const viewport = liveViewport(device, apertura);
    paintScreen(
      canvas,
      device,
      frame,
      frame?.width || viewport.width,
      frame?.height || viewport.height,
      status,
      message,
    );
    const wide = canvas.width / Math.max(1, canvas.height) > 0.62;
    copyPanel(canvas, leftCanvas, wide ? "left" : "full");
    copyPanel(canvas, rightCanvas, wide ? "right" : "full");
    // Three.js uploads a canvas only when this flag is set, after the pixels are painted.
    /* eslint-disable react-hooks/immutability */
    texture.needsUpdate = true;
    leftTexture.needsUpdate = true;
    rightTexture.needsUpdate = true;
    /* eslint-enable react-hooks/immutability */
  }, [
    apertura,
    canvas,
    clock,
    device,
    frame,
    leftCanvas,
    leftTexture,
    message,
    rightCanvas,
    rightTexture,
    status,
    texture,
  ]);

  useEffect(
    () => () => {
      texture.dispose();
      leftTexture.dispose();
      rightTexture.dispose();
    },
    [leftTexture, rightTexture, texture],
  );

  return { texture, leftTexture, rightTexture };
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

function SoftShadow({ y, strength, width }: { y: number; strength: number; width: number }) {
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
      <planeGeometry args={[Math.max(3.2, width), 1.55]} />
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

function FrameCamera({ span }: { span: number }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;

  useEffect(() => {
    const distance = Math.max(12.2, span * 2.35);
    camera.position.set(distance * 0.08, 0.16, distance);
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [camera, controls, span]);

  return null;
}

function readHit(object: THREE.Object3D) {
  const data = object.userData as {
    screen?: boolean;
    panel?: ScreenPanel;
    screenWidth?: number;
    screenHeight?: number;
    topInset?: number;
    bottomInset?: number;
  };
  if (!data.screen || !data.panel) return null;
  if (
    typeof data.screenWidth !== "number" ||
    typeof data.screenHeight !== "number" ||
    typeof data.topInset !== "number" ||
    typeof data.bottomInset !== "number"
  ) {
    return null;
  }
  return data;
}

function ScreenPointer({
  viewportWidth,
  viewportHeight,
  onInput,
}: {
  viewportWidth: number;
  viewportHeight: number;
  onInput: (input: ScreenInput) => void;
}) {
  const { camera, gl, scene, controls } = useThree();
  const onInputRef = useRef(onInput);
  const sizeRef = useRef({ viewportWidth, viewportHeight });

  useEffect(() => {
    onInputRef.current = onInput;
    sizeRef.current = { viewportWidth, viewportHeight };
  });

  useEffect(() => {
    const dom = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let hoverFrame = 0;

    const orbit = () => controls as { enabled?: boolean } | null;

    function pick(event: PointerEvent | WheelEvent) {
      const rect = dom.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const targets: THREE.Object3D[] = [];
      scene.traverse((object) => {
        if (object.userData?.screen) targets.push(object);
      });
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (!hit?.uv || !hit.object) return null;
      const data = readHit(hit.object);
      if (!data || !data.panel) return null;
      const css = uvToCss(
        {
          u: hit.uv.x,
          v: hit.uv.y,
          panel: data.panel,
          screenWidth: data.screenWidth ?? 0,
          screenHeight: data.screenHeight ?? 0,
          topInset: data.topInset ?? 0,
          bottomInset: data.bottomInset ?? 0,
        },
        sizeRef.current.viewportWidth,
        sizeRef.current.viewportHeight,
      );
      return { css, onGlass: true as const };
    }

    function onPointerDown(event: PointerEvent) {
      const hit = pick(event);
      if (!hit) return;
      const current = orbit();
      if (current) current.enabled = false;
      dragging = true;
      if (!hit.css) return;
      onInputRef.current({
        action: "down",
        x: hit.css.x,
        y: hit.css.y,
        button: event.button,
      });
    }

    function onPointerMove(event: PointerEvent) {
      if (event.buttons > 0 && !dragging) return;
      const hit = pick(event);
      if (!hit) {
        if (!dragging) {
          const current = orbit();
          if (current) current.enabled = true;
        }
        return;
      }
      if (!dragging) {
        const current = orbit();
        if (current) current.enabled = false;
      }
      if (!hit.css) return;
      if (!dragging) {
        const now = performance.now();
        if (now - hoverFrame < 32) return;
        hoverFrame = now;
      }
      onInputRef.current({
        action: "move",
        x: hit.css.x,
        y: hit.css.y,
        button: event.button,
      });
    }

    function onPointerUp(event: PointerEvent) {
      const hit = pick(event);
      if (dragging && hit?.css) {
        onInputRef.current({
          action: "up",
          x: hit.css.x,
          y: hit.css.y,
          button: event.button,
        });
      }
      dragging = false;
      const current = orbit();
      if (current) current.enabled = true;
    }

    function onWheel(event: WheelEvent) {
      const hit = pick(event);
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!hit.css) return;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
      onInputRef.current({
        action: "wheel",
        x: hit.css.x,
        y: hit.css.y,
        button: 0,
        deltaX: event.deltaX * scale,
        deltaY: event.deltaY * scale,
      });
    }

    dom.addEventListener("pointerdown", onPointerDown, true);
    dom.addEventListener("pointermove", onPointerMove, true);
    dom.addEventListener("pointerup", onPointerUp, true);
    dom.addEventListener("pointercancel", onPointerUp, true);
    dom.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      dom.removeEventListener("pointerdown", onPointerDown, true);
      dom.removeEventListener("pointermove", onPointerMove, true);
      dom.removeEventListener("pointerup", onPointerUp, true);
      dom.removeEventListener("pointercancel", onPointerUp, true);
      dom.removeEventListener("wheel", onWheel, true);
    };
  }, [camera, controls, gl, scene]);

  return null;
}

function Stage({
  device,
  screen,
  frame,
  apertura,
  light,
  background,
  exportRef,
  onInput,
}: {
  device: DeviceSpec;
  screen: ScreenState;
  frame: ImageBitmap | null;
  apertura: number;
  light: number;
  background: BackgroundId;
  exportRef: MutableRefObject<(() => void) | null>;
  onInput: (input: ScreenInput) => void;
}) {
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { texture, leftTexture, rightTexture } = useDeviceTexture(
    device,
    frame,
    screen.status,
    screen.message,
    clock,
    apertura,
  );
  const viewport = liveViewport(device, apertura);
  const frameWide = frame ? frame.width / Math.max(1, frame.height) > 0.62 : false;
  const span = deviceSpan(device, apertura);
  const foot = deviceFoot(device);

  return (
    <>
      <SceneBackground background={background} />
      <ExportBridge exportRef={exportRef} />
      <FrameCamera span={span} />
      <ambientLight intensity={0.55 * light} />
      <directionalLight position={[3.4, 5.2, 4.2]} intensity={1.25 * light} />
      <directionalLight position={[-3.2, 2.4, 2.2]} intensity={0.38 * light} />
      <DeviceModel
        device={device}
        texture={texture}
        leftTexture={leftTexture}
        rightTexture={rightTexture}
        status={screen.status}
        apertura={apertura}
      />
      <SoftShadow
        y={-foot / 2 - 0.012}
        strength={0.9 * Math.min(Math.max(light, 0), 1.3)}
        width={device.id === "fold" && frameWide ? 5.4 : 3.6}
      />
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
      <ScreenPointer
        viewportWidth={viewport.width}
        viewportHeight={viewport.height}
        onInput={onInput}
      />
    </>
  );
}

export default function Scene({
  device,
  screen,
  frame,
  apertura,
  light,
  background,
  exportRef,
  onInput,
}: {
  device: DeviceSpec;
  screen: ScreenState;
  frame: ImageBitmap | null;
  apertura: number;
  light: number;
  background: BackgroundId;
  exportRef: MutableRefObject<(() => void) | null>;
  onInput: (input: ScreenInput) => void;
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
          frame={frame}
          apertura={apertura}
          light={light}
          background={background}
          exportRef={exportRef}
          onInput={onInput}
        />
      </Suspense>
    </Canvas>
  );
}
