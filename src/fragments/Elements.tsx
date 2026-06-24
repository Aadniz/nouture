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
