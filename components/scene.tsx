"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type { BackgroundId, DeviceSpec, FinishSpec, Orientation, ScreenState } from "@/lib/devices";
import { BACKGROUNDS, duoScreen, isComputer, isDuoOpen, liveViewport } from "@/lib/devices";
import { DeviceModel, deviceFoot, deviceSpan } from "@/components/devices";
import { paintScreen } from "@/components/chrome";
import { uvToCss, type ScreenPanel } from "@/lib/pointer";

export type ScreenInput =
  | { action: "move" | "down" | "up"; x: number; y: number; button: number }
  | { action: "wheel"; x: number; y: number; button: number; deltaX: number; deltaY: number };

export type ShotMode = "png" | "transparent" | "square" | "story";

function makeCanvasTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // CanvasTexture marks itself dirty immediately. The default canvas is 300×150, so drop that
  // version and upload only after the canvas matches the frame.
  texture.version = 0;
  texture.source.version = 0;
  return texture;
}

function publishTexture(texture: THREE.CanvasTexture, canvas: HTMLCanvasElement) {
  const width = canvas.width;
  const height = canvas.height;
  if (width < 1 || height < 1) return;
  const uploaded = texture.userData as { glWidth?: number; glHeight?: number };
  if (uploaded.glWidth !== width || uploaded.glHeight !== height) {
    // texStorage2D cannot grow. A later texSubImage2D of a larger JPEG overflows.
    if (uploaded.glWidth !== undefined) texture.dispose();
    uploaded.glWidth = width;
    uploaded.glHeight = height;
  }
  texture.needsUpdate = true;
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
  time: string,
  apertura: number,
  orientation: Orientation,
) {
  const canvas = useState(() => document.createElement("canvas"))[0];
  const leftCanvas = useState(() => document.createElement("canvas"))[0];
  const rightCanvas = useState(() => document.createElement("canvas"))[0];
  const texture = useMemo(() => makeCanvasTexture(canvas), [canvas]);
  const leftTexture = useMemo(() => makeCanvasTexture(leftCanvas), [leftCanvas]);
  const rightTexture = useMemo(() => makeCanvasTexture(rightCanvas), [rightCanvas]);
  const invalidate = useThree((state) => state.invalidate);
  const bounds = device.id === "iphone-duo" ? duoScreen(apertura) : { width: device.width, height: device.height, split: false as const };

  useLayoutEffect(() => {
    if (frame && (frame.width < 1 || frame.height < 1)) return;
    paintScreen(
      canvas,
      device,
      frame,
      frame?.width ?? 0,
      frame?.height ?? 0,
      status,
      message,
      bounds.width,
      bounds.height,
      isComputer(device) ? "portrait" : orientation,
      time,
    );
    if (bounds.split) {
      copyPanel(canvas, leftCanvas, "left");
      copyPanel(canvas, rightCanvas, "right");
      publishTexture(leftTexture, leftCanvas);
      publishTexture(rightTexture, rightCanvas);
    } else {
      publishTexture(texture, canvas);
    }
    invalidate();
  }, [
    bounds.height,
    bounds.split,
    bounds.width,
    canvas,
    time,
    device,
    frame,
    invalidate,
    leftCanvas,
    leftTexture,
    message,
    orientation,
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

function cssBackgroundTexture(css: string) {
  const width = 1280;
  const height = 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  if (!context) return texture;
  const safe = css.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;background:${safe}"></div></foreignObject></svg>`;
  const image = new Image();
  image.onload = () => {
    context.drawImage(image, 0, 0, width, height);
    texture.needsUpdate = true;
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return texture;
}

function useUploadedBackground(image: string | null) {
  const [photo, setPhoto] = useState<{ url: string; texture: THREE.Texture } | null>(null);

  useEffect(() => {
    if (!image) return;
    let alive = true;
    const loader = new THREE.TextureLoader();
    const loaded = loader.load(image, (next) => {
      next.colorSpace = THREE.SRGBColorSpace;
      next.needsUpdate = true;
      if (alive) setPhoto({ url: image, texture: next });
    });
    return () => {
      alive = false;
      loaded.dispose();
    };
  }, [image]);

  if (!image || photo?.url !== image) return null;
  return photo.texture;
}

function SceneBackground({
  background,
  image,
}: {
  background: BackgroundId;
  image: string | null;
}) {
  const spec = BACKGROUNDS.find((item) => item.id === background) ?? BACKGROUNDS[0];
  const painted = !image && spec.color === null ? spec.css : null;
  const cssTexture = useMemo(() => (painted ? cssBackgroundTexture(painted) : null), [painted]);
  const photo = useUploadedBackground(image);

  useEffect(() => () => cssTexture?.dispose(), [cssTexture]);

  const texture = image ? photo : cssTexture;
  if (texture) {
    return <primitive attach="background" object={texture} />;
  }

  return <color attach="background" args={[spec.color ?? "#ffffff"]} />;
}

function downloadPng(href: string, name: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function frameShot(source: HTMLCanvasElement, aspect: number) {
  const sw = source.width;
  const sh = source.height;
  const srcAspect = sw / Math.max(1, sh);
  const tw = srcAspect > aspect ? sw : Math.round(sh * aspect);
  const th = srcAspect > aspect ? Math.round(sw / aspect) : sh;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, tw);
  canvas.height = Math.max(1, th);
  const context = canvas.getContext("2d");
  if (!context) return source.toDataURL("image/png");
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const probeContext = probe.getContext("2d", { willReadFrequently: true });
  if (probeContext) {
    probeContext.drawImage(source, 0, 0, 1, 1, 0, 0, 1, 1);
    const pixel = probeContext.getImageData(0, 0, 1, 1).data;
    context.fillStyle = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
  } else {
    context.fillStyle = "#ffffff";
  }
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / sw, canvas.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  context.drawImage(source, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  return canvas.toDataURL("image/png");
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
  exportRef: MutableRefObject<((mode: ShotMode) => void) | null>;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    exportRef.current = (mode: ShotMode) => {
      const previous = scene.background;
      const clear = new THREE.Color();
      gl.getClearColor(clear);
      const clearAlpha = gl.getClearAlpha();
      if (mode === "transparent") {
        scene.background = null;
        gl.setClearColor(0x000000, 0);
      }
      gl.render(scene, camera);
      const source = gl.domElement;
      if (mode === "square" || mode === "story") {
        downloadPng(frameShot(source, mode === "square" ? 1 : 9 / 16), mode === "square" ? "mockup-square.png" : "mockup-story.png");
      } else {
        downloadPng(source.toDataURL("image/png"), mode === "transparent" ? "mockup-transparent.png" : "mockup.png");
      }
      if (mode === "transparent") {
        scene.background = previous;
        gl.setClearColor(clear, clearAlpha);
        gl.render(scene, camera);
      }
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
    const distance = Math.max(13.6, span * 2.75);
    const azimuth = 0.62;
    camera.position.set(Math.sin(azimuth) * distance, distance * 0.2, Math.cos(azimuth) * distance);
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
    glassWidth?: number;
    cutout?: "notch" | "island" | "none";
    landscapeStatus?: number;
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
  orientation,
  onInput,
}: {
  viewportWidth: number;
  viewportHeight: number;
  orientation: Orientation;
  onInput: (input: ScreenInput) => void;
}) {
  const { camera, gl, scene, controls } = useThree();
  const onInputRef = useRef(onInput);
  const sizeRef = useRef({ viewportWidth, viewportHeight, orientation });

  useEffect(() => {
    onInputRef.current = onInput;
    sizeRef.current = { viewportWidth, viewportHeight, orientation };
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
          glassWidth: data.glassWidth,
          cutout: data.cutout,
          landscapeStatus: data.landscapeStatus,
        },
        sizeRef.current.viewportWidth,
        sizeRef.current.viewportHeight,
        sizeRef.current.orientation,
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
  orientation,
  light,
  background,
  backgroundImage,
  finish,
  time,
  exportRef,
  onInput,
}: {
  device: DeviceSpec;
  screen: ScreenState;
  frame: ImageBitmap | null;
  apertura: number;
  orientation: Orientation;
  light: number;
  background: BackgroundId;
  backgroundImage: string | null;
  finish: FinishSpec;
  time: string;
  exportRef: MutableRefObject<((mode: ShotMode) => void) | null>;
  onInput: (input: ScreenInput) => void;
}) {
  const { texture, leftTexture, rightTexture } = useDeviceTexture(
    device,
    frame,
    screen.status,
    screen.message,
    time,
    apertura,
    orientation,
  );
  const viewport = liveViewport(device, apertura, orientation);
  const span = deviceSpan(device, apertura);
  const foot = deviceFoot(device, orientation, apertura);
  const turned = orientation === "landscape" && !isComputer(device);
  const shadowWidth = isComputer(device)
    ? Math.max(4.4, span * 0.9)
    : device.id === "iphone-duo" && isDuoOpen(apertura)
      ? 6.2
      : 3.6;

  return (
    <>
      <SceneBackground background={background} image={backgroundImage} />
      <ExportBridge exportRef={exportRef} />
      <FrameCamera span={span} />
      <ambientLight intensity={0.55 * light} />
      <hemisphereLight args={["#f4f4f2", "#d5d5d2", 0.4 * light]} />
      <directionalLight position={[3.4, 5.2, 4.2]} intensity={1.25 * light} />
      <directionalLight position={[-3.2, 2.4, 2.2]} intensity={0.38 * light} />
      <directionalLight position={[-1.6, 3.2, -5.4]} intensity={0.9 * light} />
      <group rotation={[0, 0, turned ? Math.PI / 2 : 0]}>
        <DeviceModel
          device={device}
          texture={texture}
          leftTexture={leftTexture}
          rightTexture={rightTexture}
          status={screen.status}
          apertura={apertura}
          finish={finish}
        />
      </group>
      <SoftShadow
        y={-foot / 2 - 0.012}
        strength={0.9 * Math.min(Math.max(light, 0), 1.3)}
        width={shadowWidth}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={7}
        maxDistance={26}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI * 0.82}
      />
      <ScreenPointer
        viewportWidth={viewport.width}
        viewportHeight={viewport.height}
        orientation={turned ? "landscape" : "portrait"}
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
  orientation,
  light,
  background,
  backgroundImage,
  finish,
  time,
  exportRef,
  onInput,
}: {
  device: DeviceSpec;
  screen: ScreenState;
  frame: ImageBitmap | null;
  apertura: number;
  orientation: Orientation;
  light: number;
  background: BackgroundId;
  backgroundImage: string | null;
  finish: FinishSpec;
  time: string;
  exportRef: MutableRefObject<((mode: ShotMode) => void) | null>;
  onInput: (input: ScreenInput) => void;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop="demand"
      camera={{ position: [7.6, 2.6, 10.4], fov: 28 }}
      gl={{
        preserveDrawingBuffer: true,
        antialias: true,
        alpha: true,
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
          orientation={orientation}
          light={light}
          background={background}
          backgroundImage={backgroundImage}
          finish={finish}
          time={time}
          exportRef={exportRef}
          onInput={onInput}
        />
      </Suspense>
    </Canvas>
  );
}
