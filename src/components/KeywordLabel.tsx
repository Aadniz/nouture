import { ButtonHTMLAttributes } from "react";
import { KeywordKind, isBoxKeyword } from "../org/keywords";

/** Solid labels, colored like Doom's keyword faces; the text is the page background */
const KIND_STYLES: Record<KeywordKind, string> = {
  todo: "bg-apricot text-shadow-grey",
  active: "bg-blanched-almond text-shadow-grey",
  project: "bg-periwinkle text-shadow-grey",
  onhold: "bg-dusty-rose text-shadow-grey",
  done: "bg-lavender-grey/45 text-shadow-grey",
  cancel: "bg-dusty-rose/40 text-shadow-grey",
};

/** In the picker, done states are choices, not finished entries: don't fade them */
const PICKER_STYLES: Partial<Record<KeywordKind, string>> = {
  done: "bg-lavender-grey text-shadow-grey",
  cancel: "bg-dusty-rose/70 text-shadow-grey",
};

/** Checkbox states ("[ ]", "[X]", ...) are plain text in the same colors */
const BOX_STYLES: Record<KeywordKind, string> = {
  todo: "text-apricot",
  active: "text-blanched-almond",
  project: "text-periwinkle",
  onhold: "text-dusty-rose",
  done: "text-lavender-grey/70",
  cancel: "text-dusty-rose/60",
};

const BOX_PICKER_STYLES: Partial<Record<KeywordKind, string>> = {
  done: "text-lavender-grey",
  cancel: "text-dusty-rose",
};

const SIZES = {
  /** In note previews */
  xs: "rounded px-1 text-[0.85em]",
  /** In headlines */
  sm: "rounded-md px-1.5 py-0.5 text-sm",
  /** In the state picker */
  lg: "rounded-lg px-3 py-2 text-base",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  keyword: string;
  kind: KeywordKind;
  size?: keyof typeof SIZES;
  /** A choice in the state picker, rather than an entry's state */
  choice?: boolean;
  /** Marks the headline's current state in the picker */
  current?: boolean;
}

/** A TODO keyword as a colored label; a button when it has an onClick */
export const KeywordLabel = ({ keyword, kind, size = "sm", choice, current, className = "", onClick, ...rest }: Props) => {
  const colors = isBoxKeyword(keyword)
    ? (choice && BOX_PICKER_STYLES[kind]) || BOX_STYLES[kind]
    : (choice && PICKER_STYLES[kind]) || KIND_STYLES[kind];
  const classes = `inline-block font-mono font-bold whitespace-pre leading-snug ${colors} ${SIZES[size]} ${className}`;
  const label = current ? `✓ ${keyword}` : keyword;
  if (!onClick) return <span className={classes}>{label}</span>;
  return (
    <button className={`${classes} cursor-pointer active:brightness-125`} onClick={onClick} {...rest}>
      {label}
    </button>
  );
};
