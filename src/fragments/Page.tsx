import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import tw from "tailwind-styled-components";
import { Icon } from "../icons/icon";
import { Button } from "./Button";
import { Wrapper } from "./Elements";

interface PageProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Exactly the screen's height, so content (e.g. an editor) can fill it */
  fill?: boolean;
}

/** A sub page: compact bar with back button instead of the big logo header. */
export const Page = ({ title, actions, children, fill }: PageProps) => {
  const navigate = useNavigate();
  return (
    <div className={fill ? "flex flex-col h-dvh" : ""}>
      <TopBar className="safe-area-top shadow-lg shrink-0">
        <IconButton onClick={() => navigate(-1)} title="Back">
          <Icon title="arrow_left" width={20} height={20} />
        </IconButton>
        <PageTitle>{title}</PageTitle>
        {actions}
      </TopBar>
      <main
        className={`container mx-auto ${
          fill ? "flex-1 min-h-0 flex flex-col pt-4 pb-2" : "py-4"
        }`}
      >
        {children}
      </main>
    </div>
  );
};

/** An icon-only button: compact, with the icon centered */
export const IconButton = tw(Button)`
  p-2
  inline-flex
  items-center
  justify-center
  text-white/80
  hover:text-white/70
  active:text-lavender-grey
`;

const TopBar = tw(Wrapper)`
  flex
  items-center
  gap-1
  sticky
  top-0
  z-5
`;

const PageTitle = tw.h3`
  font-bold
  text-navajo-white
  text-xl
  truncate
  flex-1
`;
