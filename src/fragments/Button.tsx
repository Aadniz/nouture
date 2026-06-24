import tw from "tailwind-styled-components";
import { ButtonHTMLAttributes, ReactNode } from "react";

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
