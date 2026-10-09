import tw from "tailwind-styled-components";
import styled from "styled-components";
import logo from "../assets/Nouture.png";

export const Wrapper = tw.div`
  bg-space-indigo
  p-4
`;

export const LogoWrapper = styled(Wrapper)`
  background-image: url("${logo}");
  background-size: contain;
  background-position: left;
  background-repeat: no-repeat;
`;

export const Footer = tw(Wrapper)`
  p-4
  sticky
  top-full
`;

export const SubHeader = tw.h3`
  font-bold
  text-navajo-white
  text-xl
  mb-1
`;

export const Input = tw.input`
  bg-jet-black
  text-desert-sand
  outline-0
  rounded-lg
  p-2
`;

export const Select = tw.select`
  bg-jet-black
  text-desert-sand
  outline-0
  rounded-lg
  p-2
`;

export const TextArea = tw.textarea`
  bg-jet-black
  text-desert-sand
  outline-0
  rounded-lg
  p-2
  font-mono
  text-sm
`;

export const Row = tw.div`flex flex-row gap-2`;
export const Column = tw.div`flex flex-col`;

export const Label = tw.label`
  text-amethyst-smoke
  mt-2
  text-sm
`;

export const Box = tw.div`
  border-amethyst-smoke
  bg-graphite
  border
  m-2
  rounded-xl
  p-4
  text-center
  content-center
  relative
`;

/** Unison/command output, styled like an Input */
export const Output = tw.pre`
  bg-jet-black
  text-desert-sand
  rounded-lg
  p-2
  font-mono
  text-xs
  whitespace-pre-wrap
  break-all
  text-left
`;
