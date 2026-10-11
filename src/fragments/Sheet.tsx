import tw from "tailwind-styled-components";

interface SheetProps {
  children: React.ReactNode;
  show: boolean;
  onClose: () => void;
}

/** A panel sliding up from the bottom; tapping beside it closes it */
export const Sheet = ({ children, show, onClose }: SheetProps) => (
  <BackDrop $show={show} onClick={onClose}>
    <Panel $show={show} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
      <div className="w-10 h-1 rounded-full bg-dusty-grape mx-auto mb-2" />
      {children}
    </Panel>
  </BackDrop>
);

/** An action in a sheet */
export const SheetRow = ({ className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    className={`flex items-center gap-4 w-full px-3 py-3 rounded-lg text-left cursor-pointer active:bg-dusty-grape/40 ${className}`}
    {...rest}
  />
);

const Panel = tw.div<{ $show: boolean }>`
  ${(p) => (p.$show ? "translate-y-0" : "translate-y-full")}
  absolute
  bottom-0
  inset-x-0
  max-h-[80vh]
  overflow-y-auto
  bg-graphite
  border-t-2
  border-dusty-grape
  rounded-t-2xl
  p-3
  pb-4
  transition-transform
  duration-300
`;

const BackDrop = tw.div<{ $show: boolean }>`
  ${(p) => (p.$show ? "bg-shadow-grey/70" : "bg-shadow-grey/0 pointer-events-none")}
  fixed
  inset-0
  z-10
  transition-colors
  duration-300
`;
