import { useEffect } from "react";
import tw from "tailwind-styled-components";

const SHOW_MS = 4000;

export interface SnackbarMessage {
  text: string;
  /** Tells messages with the same text apart, so each one shows its full time */
  id: number;
}

/** A short note at the bottom of the screen, with an action */
export const Snackbar = ({
  message,
  raised = false,
  action,
  onAction,
  onClose,
}: {
  message: SnackbarMessage | null;
  /** Above a bar at the bottom */
  raised?: boolean;
  action: string;
  onAction: () => void;
  onClose: () => void;
}) => {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [message?.id]);

  return (
    <Bar $show={!!message} $raised={raised}>
      <span className="flex-1 truncate">{message?.text}</span>
      <button
        className="font-bold text-navajo-white px-2 py-1 rounded-md cursor-pointer active:bg-dusty-grape/60"
        onClick={onAction}
      >
        {action}
      </button>
    </Bar>
  );
};

const Bar = tw.div<{ $show: boolean; $raised: boolean }>`
  ${(p) => (p.$show ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none")}
  ${(p) => (p.$raised ? "bottom-20" : "bottom-4")}
  fixed
  inset-x-4
  z-5
  flex
  items-center
  gap-2
  bg-dusty-grape
  text-white
  rounded-xl
  shadow-lg
  pl-4
  pr-2
  py-2
  transition-all
  duration-200
`;
