"use client";

import { useEffect, useState, type MutableRefObject, type ReactNode } from "react";
import { Hand, Minus, Plus, Rotate3d, RotateCcw } from "lucide-react";

import type { ViewApi, ViewState, ViewTool } from "@/components/scene";

const QUIET = "duration-200 ease-out motion-reduce:transition-none";
const MOTION = "duration-[240ms] ease-out motion-reduce:transition-none";
const ZOOM_STEP = 1.25;
const PAN_STEP = 0.06;

const TYPING = "input, textarea, select, [contenteditable='true'], [role='combobox'], [role='listbox'], [role='option'], [role='slider']";
const PRESSABLE = `${TYPING}, button, a, [role='switch']`;

function within(target: EventTarget | null, selector: string) {
  return target instanceof Element && Boolean(target.closest(selector));
}

function useViewState(viewRef: MutableRefObject<ViewApi | null>) {
  const [state, setState] = useState<ViewState>({ zoom: 1, home: true });
  useEffect(() => {
    let off: (() => void) | null = null;
    let frame = 0;
    // The scene loads lazily, so wait for its API before listening.
    const attach = () => {
      const api = viewRef.current;
      if (!api) {
        frame = requestAnimationFrame(attach);
        return;
      }
      setState(api.read());
      off = api.subscribe(() => setState(api.read()));
    };
    attach();
    return () => {
      cancelAnimationFrame(frame);
      off?.();
    };
  }, [viewRef]);
  return state;
}

function DockButton({
  label,
  keys,
  pressed,
  disabled,
  onClick,
  className = "size-9",
  children,
}: {
  label: string;
  keys?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className="group/dock relative">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-keyshortcuts={keys}
        disabled={disabled}
        onClick={onClick}
        className={`grid place-items-center rounded-lg outline-none transition-colors ${QUIET} focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:text-neutral-300 ${
          pressed ? "bg-neutral-950 text-white" : "text-neutral-600 enabled:hover:bg-neutral-100 enabled:hover:text-neutral-950"
        } ${className}`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 rounded-md bg-neutral-950 px-2 py-1 text-[12px] whitespace-nowrap text-white opacity-0 transition-[opacity,translate] ${QUIET} group-hover/dock:translate-y-0 group-hover/dock:opacity-100 group-has-[:focus-visible]/dock:translate-y-0 group-has-[:focus-visible]/dock:opacity-100`}
      >
        {label}
        {keys ? <kbd className="rounded bg-white/15 px-1 font-sans text-[11px] text-white/80">{keys}</kbd> : null}
      </span>
    </span>
  );
}

export function ViewDock({
  tool,
  holding,
  hidden,
  viewRef,
  onTool,
  onHold,
  onUse,
}: {
  tool: ViewTool;
  holding: boolean;
  hidden: boolean;
  viewRef: MutableRefObject<ViewApi | null>;
  onTool: (tool: ViewTool) => void;
  onHold: (holding: boolean) => void;
  onUse: () => void;
}) {
  const view = useViewState(viewRef);
  const active = holding ? "move" : tool;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (within(event.target, TYPING)) return;
      const api = viewRef.current;
      const key = event.key;
      if (key === " ") {
        if (within(event.target, PRESSABLE)) return;
        event.preventDefault();
        if (!event.repeat) onHold(true);
        return;
      }
      if (key === "r" || key === "R") onTool("orbit");
      else if (key === "h" || key === "H") onTool("move");
      else if (!api) return;
      else if (key === "+" || key === "=") {
        onUse();
        api.zoomBy(ZOOM_STEP);
      } else if (key === "-" || key === "_") {
        onUse();
        api.zoomBy(1 / ZOOM_STEP);
      } else if (key === "0") {
        onUse();
        api.reset();
      } else if (key.startsWith("Arrow")) {
        if (within(event.target, PRESSABLE)) return;
        event.preventDefault();
        const step = event.shiftKey ? PAN_STEP * 3 : PAN_STEP;
        const x = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
        const y = key === "ArrowDown" ? -step : key === "ArrowUp" ? step : 0;
        onUse();
        api.panBy(x, y);
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === " ") onHold(false);
    }
    const release = () => onHold(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    };
  }, [onHold, onTool, onUse, viewRef]);

  const zoomBy = (factor: number) => {
    onUse();
    viewRef.current?.zoomBy(factor);
  };

  return (
    <div
      role="toolbar"
      aria-label="View"
      inert={hidden ? true : undefined}
      aria-hidden={hidden ? true : undefined}
      className={`absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl bg-white p-1.5 shadow-[0_10px_30px_rgba(23,23,23,0.08)] ring-1 ring-black/5 transition-[opacity,translate] ${MOTION} ${
        hidden ? "pointer-events-none translate-y-2 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <div role="group" aria-label="Drag to" className="flex gap-0.5">
        <DockButton label="Rotate" keys="R" pressed={active === "orbit"} onClick={() => onTool("orbit")}>
          <Rotate3d className="size-4" />
        </DockButton>
        <DockButton label="Move" keys="H · Space" pressed={active === "move"} onClick={() => onTool("move")}>
          <Hand className="size-4" />
        </DockButton>
      </div>
      <span aria-hidden className="mx-1 h-5 w-px bg-[#ebebeb]" />
      <DockButton label="Zoom out" keys="−" onClick={() => zoomBy(1 / ZOOM_STEP)}>
        <Minus className="size-4" />
      </DockButton>
      <DockButton
        label="Fit zoom"
        disabled={view.zoom === 1}
        onClick={() => zoomBy(1 / view.zoom)}
        className="h-9 w-12 text-[12px] tabular-nums disabled:text-neutral-500"
      >
        {Math.round(view.zoom * 100)}%
      </DockButton>
      <DockButton label="Zoom in" keys="+" onClick={() => zoomBy(ZOOM_STEP)}>
        <Plus className="size-4" />
      </DockButton>
      <span aria-hidden className="mx-1 h-5 w-px bg-[#ebebeb]" />
      <DockButton
        label="Reset view"
        keys="0"
        disabled={view.home}
        onClick={() => {
          onUse();
          viewRef.current?.reset();
        }}
      >
        <RotateCcw className="size-4" />
      </DockButton>
    </div>
  );
}
