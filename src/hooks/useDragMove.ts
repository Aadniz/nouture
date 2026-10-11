import { PointerEvent, RefObject, useCallback, useRef, useState } from "react";

/** Sideways drag per level */
const STEP_PX = 24;
/** Indentation per level (pl-3) */
const INDENT_PX = 12;
/** Near these edges the page scrolls along (the top one is below the sticky bar) */
const TOP_EDGE_PX = 140;
const BOTTOM_EDGE_PX = 80;
const MAX_SCROLL_PX = 14;

export interface DragState {
  /** The finger */
  x: number;
  y: number;
  /** Where it would drop: before line `before`, at `level`, drawn at (lineX, lineY) */
  before: number;
  level: number;
  lineX: number;
  lineY: number;
}

interface Row {
  line: number;
  level: number;
  top: number;
  bottom: number;
  left: number;
}

interface Options {
  /** Holds the headline rows, marked with data-headline and data-level */
  container: RefObject<HTMLElement | null>;
  /** The moving entry */
  line: number | null;
  level: number;
  /** Level of the headline zoomed into, 0 for the whole file */
  zoomLevel: number;
  /** Where dropping at the very end puts it: the end of the file or of the zoomed subtree */
  endLine: number;
  onDrop: (before: number, level: number) => void;
}

/**
 * Dragging the moving entry by its grip. Drops land between visible
 * headlines, at a level that keeps the rows below where they are: at least
 * the level of the row below, at most one deeper than the row above. Sideways
 * movement picks within that. Positions go to subscribers (the overlay) every
 * frame, so the outline itself only re-renders when dragging starts and ends.
 */
export const useDragMove = (options: Options) => {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(options);
  latest.current = options;
  const pointer = useRef<{ x: number; y: number; startX: number } | null>(null);
  const frame = useRef<number | null>(null);
  const listeners = useRef(new Set<(state: DragState | null) => void>());

  const emit = (state: DragState | null) => listeners.current.forEach((l) => l(state));

  const subscribe = useCallback((listener: (state: DragState | null) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const locate = (): DragState | null => {
    const p = pointer.current;
    const { container, line, level, zoomLevel, endLine } = latest.current;
    if (!p || !container.current) return null;

    let self: Row | null = null;
    const rows: Row[] = [];
    for (const el of container.current.querySelectorAll<HTMLElement>("[data-headline]")) {
      const rect = el.getBoundingClientRect();
      const row = {
        line: Number(el.dataset.headline),
        level: Number(el.dataset.level),
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
      };
      if (row.line === line) self = row;
      else rows.push(row);
    }

    let index = rows.findIndex((r) => (r.top + r.bottom) / 2 > p.y);
    if (index < 0) index = rows.length;
    const above = rows[index - 1];
    const below = rows[index];
    const max = (above ? above.level : zoomLevel) + 1;
    const min = below ? below.level : zoomLevel + 1;
    const wanted = level + Math.round((p.x - p.startX) / STEP_PX);
    const slotLevel = Math.min(Math.max(wanted, min), max);

    const ref = rows[0] ?? self;
    return {
      x: p.x,
      y: p.y,
      before: below ? below.line : endLine,
      level: slotLevel,
      lineX: ref ? ref.left + (slotLevel - ref.level) * INDENT_PX : 16,
      lineY: above && below ? (above.bottom + below.top) / 2 : below ? below.top : above ? above.bottom : p.y,
    };
  };

  const tick = () => {
    const p = pointer.current;
    if (!p) return;
    const height = window.innerHeight;
    const speed =
      p.y < TOP_EDGE_PX
        ? -MAX_SCROLL_PX * Math.min(1, (TOP_EDGE_PX - p.y) / TOP_EDGE_PX)
        : p.y > height - BOTTOM_EDGE_PX
          ? MAX_SCROLL_PX * Math.min(1, (p.y - (height - BOTTOM_EDGE_PX)) / BOTTOM_EDGE_PX)
          : 0;
    if (speed) window.scrollBy(0, speed);
    emit(locate());
    frame.current = requestAnimationFrame(tick);
  };

  const stop = () => {
    pointer.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setDragging(false);
    emit(null);
  };

  /** For the grip; it captures the pointer, so the row's own gestures stay out */
  const grip = {
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointer.current = { x: e.clientX, y: e.clientY, startX: e.clientX };
      setDragging(true);
      frame.current = requestAnimationFrame(tick);
    },
    onPointerMove: (e: PointerEvent) => {
      e.stopPropagation();
      if (pointer.current) pointer.current = { ...pointer.current, x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: PointerEvent) => {
      e.stopPropagation();
      const state = locate();
      stop();
      if (state) latest.current.onDrop(state.before, state.level);
    },
    onPointerCancel: (e: PointerEvent) => {
      e.stopPropagation();
      stop();
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return { dragging, grip, subscribe };
};
