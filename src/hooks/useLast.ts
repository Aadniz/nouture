import { useRef } from "react";

/** Modals stay mounted for their animation: keep showing the last value while closing */
export const useLast = <T,>(value: T | null) => {
  const last = useRef(value);
  if (value !== null) last.current = value;
  return last.current;
};
