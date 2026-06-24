import tw from "tailwind-styled-components";
import { Button } from "./Button";

interface ModalProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  onSave?: () => void;
  onClose: () => void;
  show?: boolean;
}

export const Modal = ({
  children,
  title,
  description,
  onClose,
  show,
}: ModalProps) => {
  return (
    <BackDrop $show={show}>
      <ModalWrapper $show={show}>
        {title && <ModalTitle>{title}</ModalTitle>}
        {description && <ModalDesc>{description}</ModalDesc>}
        {(title || description) && <ModalLine />}
        <ModalContent>{children}</ModalContent>
        <div className="flex gap-1">
          <Button
            className="bg-jet-black hover:bg-jet-black/90 active:bg-dusty-grape/20"
            onClick={() => onClose()}
          >
            Close
          </Button>
          <Button className="bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80">
            Save
          </Button>
        </div>
      </ModalWrapper>
    </BackDrop>
  );
};

const ModalContent = tw.div`
  p-2
`;

const ModalLine = tw.hr`
  mt-1
  mb-3
  text-periwinkle/80
`;

const ModalTitle = tw.h2`
  text-navajo-white
  font-bold
  text-xl
  text-center
`;

const ModalDesc = tw.div`
  text-lavender-grey
  text-center
  italic
  mx-3
`;

const ModalWrapper = tw.div<{ $show: boolean }>`
  ${(p) => (p.$show ? "scale-100" : "scale-105 pointer-events-none opacity-0")}
  absolute
  max-w-[80vw]
  // Often needs to fit an on-board keyboard
  max-h-[50vh]
  bg-graphite
  border-dusty-grape
  border-2
  rounded-2xl
  p-2
  top-1/2
  left-1/2
  -translate-x-1/2
  -translate-y-1/2
  transition-transform
  duration-400
`;

const BackDrop = tw.div<{ $show: boolean }>`
  ${(p) =>
    p.$show
      ? "bg-shadow-grey/80 delay-100"
      : "bg-shadow-grey/0 pointer-events-none delay-0"}
  fixed
  w-full
  h-full
  top-0
  left-0
  z-10
  transition-colors
  duration-1000
`;
