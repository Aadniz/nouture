import tw from "tailwind-styled-components";
import { ButtonHTMLAttributes, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** The app's two button looks: Save/Add (primary) and Close (secondary) */
export const PRIMARY =
  "bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80";
export const SECONDARY =
  "bg-jet-black hover:bg-jet-black/90 active:bg-dusty-grape/20";
/** Delete and other actions that lose data */
export const DANGER = "bg-dusty-rose/20 hover:bg-dusty-rose/30 text-dusty-rose";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export const Button = ({ children, className, ...rest }: ButtonProps) => {
  const baseClasses =
    "font-bold rounded-lg py-2 px-4 transition-colors cursor-pointer";

  // twMerge drops base classes that `className` overrides: in the CSS itself,
  // whichever rule comes later in the stylesheet wins, not the later class
  return (
    <button className={twMerge(baseClasses, className)} {...rest}>
      {children}
    </button>
  );
};

/** A small secondary button, for compact actions */
export const Chip = tw.button`
  font-bold
  rounded-lg
  py-1
  px-3
  text-sm
  transition-colors
  cursor-pointer
  bg-dusty-grape
  hover:bg-dusty-grape/90
  active:bg-lavender-grey/60
`;
