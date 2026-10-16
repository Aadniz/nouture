import { ReactNode } from "react";
import { Icon } from "../icons/icon";

/**
 * Colors a profile can mark its notes with: the theme's colors that are
 * distinct from each other and read well on the dark cards
 */
export const PROFILE_COLORS = {
  apricot: { bg: "bg-apricot", text: "text-apricot", border: "border-apricot" },
  "dusty-rose": { bg: "bg-dusty-rose", text: "text-dusty-rose", border: "border-dusty-rose" },
  lilac: { bg: "bg-lilac", text: "text-lilac", border: "border-lilac" },
  "amethyst-smoke": { bg: "bg-amethyst-smoke", text: "text-amethyst-smoke", border: "border-amethyst-smoke" },
  periwinkle: { bg: "bg-periwinkle", text: "text-periwinkle", border: "border-periwinkle" },
};

export type ProfileColor = keyof typeof PROFILE_COLORS;

/** A profile's color classes; none when it has no (known) color */
export const colorClasses = (color: string | null | undefined) =>
  color && color in PROFILE_COLORS ? PROFILE_COLORS[color as ProfileColor] : null;

const Swatch = ({
  selected,
  title,
  className,
  onClick,
  children,
}: {
  selected: boolean;
  title: string;
  className: string;
  onClick: () => void;
  children?: ReactNode;
}) => (
  <button
    type="button"
    title={title}
    className={`w-9 h-9 rounded-lg cursor-pointer flex items-center justify-center ${className} ${
      selected ? "ring-2 ring-navajo-white ring-offset-2 ring-offset-space-indigo" : ""
    }`}
    onClick={onClick}
  >
    {children}
  </button>
);

/** Picks a profile's color, or none */
export const ColorPicker = ({ value, onChange }: { value: string | null; onChange: (color: string | null) => void }) => (
  <div className="flex flex-wrap gap-2 mt-1">
    <Swatch selected={!colorClasses(value)} title="No color" className="bg-jet-black text-lavender-grey" onClick={() => onChange(null)}>
      <Icon title="slash_lg" />
    </Swatch>
    {Object.entries(PROFILE_COLORS).map(([name, classes]) => (
      <Swatch
        key={name}
        selected={value === name}
        title={name.replace("-", " ")}
        className={classes.bg}
        onClick={() => onChange(name)}
      />
    ))}
  </div>
);

/** The small square after a note's name, in its profile's color */
export const ColorSquare = ({ color, className = "w-2 h-2" }: { color: string | null | undefined; className?: string }) => {
  const classes = colorClasses(color);
  return classes && <span className={`inline-block shrink-0 rounded-xs ${classes.bg} ${className}`} />;
};
