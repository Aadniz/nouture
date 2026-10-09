import tw from "tailwind-styled-components";
import { ButtonHTMLAttributes, ReactNode } from "react";

/** The app's two button looks: Save/Add (primary) and Close (secondary) */
export const PRIMARY =
  "bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80";
export const SECONDARY =
  "bg-jet-black hover:bg-jet-black/90 active:bg-dusty-grape/20";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export const Button = ({ children, className, ...rest }: ButtonProps) => {
  const baseClasses =
    "font-bold rounded-lg py-2 px-4 transition-colors cursor-pointer";

  return (
    <button className={`${baseClasses} ${className || ""}`} {...rest}>
      {children}
    </button>
  );
};
