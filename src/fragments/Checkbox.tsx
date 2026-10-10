import { Icon } from "../icons/icon";

/** A square check box: filled amethyst when checked, an outline when not */
export const CheckIcon = ({ checked, size = 20 }: { checked: boolean; size?: number }) => (
  <span className={checked ? "text-amethyst-smoke" : "text-lavender-grey"}>
    <Icon title={checked ? "check_square_fill" : "square"} width={size} height={size} />
  </span>
);

export const Checkbox = ({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <button
    className="p-2 cursor-pointer disabled:cursor-default"
    role="checkbox"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange?.(!checked)}
  >
    <CheckIcon checked={checked} />
  </button>
);
