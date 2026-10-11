import { PointerEvent, useRef, useState } from "react";

const HOLD_MS = 500;
/** Moving further than this (e.g. scrolling) cancels the hold */
const SLOP_PX = 10;
/** How far a swipe has to go to count */
export const SWIPE_PX = 80;

export type Direction = 1 | -1;

interface Options {
  onHold: () => void;
  /** Right is 1, left is -1 */
  onSwipe?: (direction: Direction) => void;
  /** A swipe that isn't allowed only rubber-bands */
  canSwipe?: (direction: Direction) => boolean;
}

/**
 * Handlers for a row that does something on a long press and on a
 * sideways swipe. Vertical moves are left to scrolling (the row needs
 * `touch-action: pan-y`). The click that ends a hold or a swipe is
 * swallowed, so taps on children (folding, the keyword picker) don't fire
 * too. `pressing` is for visual feedback, `dx` is how far the row is swiped.
 */
export const useRowGestures = ({ onHold, onSwipe, canSwipe }: Options) => {
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const mode = useRef<"idle" | "pending" | "swipe">("idle");
  const swallowClick = useRef(false);
  const offset = useRef(0);
  const [pressing, setPressing] = useState(false);
  const [dx, setDx] = useState(0);

  const stopHold = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  };

  const reset = () => {
    stopHold();
    mode.current = "idle";
    offset.current = 0;
    setDx(0);
  };

  const allowed = (direction: Direction) => canSwipe?.(direction) !== false;

  return {
    pressing,
    dx,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        swallowClick.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        mode.current = "pending";
        setPressing(true);
        timer.current = window.setTimeout(() => {
          swallowClick.current = true;
          reset();
          onHold();
        }, HOLD_MS);
      },
      onPointerMove: (e: PointerEvent) => {
        const x = e.clientX - start.current.x;
        const y = e.clientY - start.current.y;
        if (mode.current === "pending") {
          if (Math.hypot(x, y) <= SLOP_PX) return;
          stopHold();
          if (!onSwipe || Math.abs(x) <= Math.abs(y)) {
            mode.current = "idle";
            return;
          }
          mode.current = "swipe";
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (mode.current !== "swipe") return;
        offset.current = x;
        const resisted = allowed(x > 0 ? 1 : -1) ? x : x / 4;
        setDx(Math.max(-SWIPE_PX * 1.5, Math.min(SWIPE_PX * 1.5, resisted)));
      },
      onPointerUp: () => {
        if (mode.current === "swipe") {
          swallowClick.current = true;
          const direction: Direction = offset.current > 0 ? 1 : -1;
          if (Math.abs(offset.current) >= SWIPE_PX && allowed(direction)) onSwipe?.(direction);
        }
        reset();
      },
      onPointerLeave: () => {
        if (mode.current === "pending") reset();
      },
      onPointerCancel: reset,
      onClickCapture: (e: React.MouseEvent) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      },
      // No text selection or context menu on Android's long press
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
};
