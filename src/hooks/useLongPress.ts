import { PointerEvent, useRef, useState } from "react";

const HOLD_MS = 500;
/** Moving further than this (e.g. scrolling) cancels the hold */
const SLOP_PX = 10;

/**
 * Handlers for an element that does something on a long press. The click
 * that ends a long press is swallowed, so taps on children (folding, the
 * keyword picker) don't fire too. `pressing` is for visual feedback.
 */
export const useLongPress = (onLongPress: () => void) => {
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const fired = useRef(false);
  const [pressing, setPressing] = useState(false);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  };

  return {
    pressing,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        setPressing(true);
        timer.current = window.setTimeout(() => {
          fired.current = true;
          cancel();
          onLongPress();
        }, HOLD_MS);
      },
      onPointerMove: (e: PointerEvent) => {
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > SLOP_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onClickCapture: (e: React.MouseEvent) => {
        if (!fired.current) return;
        fired.current = false;
        e.stopPropagation();
        e.preventDefault();
      },
      // No text selection or context menu on Android's long press
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
};
