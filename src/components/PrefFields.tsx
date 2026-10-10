import { ReactNode, useState } from "react";
import { Button, PRIMARY, SECONDARY } from "../fragments/Button";
import { Checkbox } from "../fragments/Checkbox";
import { Input, Row, Select } from "../fragments/Elements";
import { IconButton } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { Issue, formatPattern, parsePattern, parseRoot, resolveRootRef } from "../unison/profile";
import {
  ANDROID,
  PATTERN_KINDS,
  PATTERN_VALUES,
  PrefSpec,
  VALUE_RULES,
} from "../unison/schema";

export interface FieldProps {
  spec: PrefSpec;
  /** The preference's values in the profile, in file order */
  values: string[];
  onChange: (values: string[]) => void;
  issues: Issue[];
  roots: string[];
}

/** An editor for one unison preference, picked by its kind and value rules. */
export const PrefField = (props: FieldProps) => {
  const { spec } = props;
  const rule = VALUE_RULES[spec.name];

  if (ANDROID[spec.name]?.level === "managed") return <ManagedField {...props} />;
  switch (spec.kind) {
    case "bool":
      return <BoolField {...props} />;
    case "boolDefault":
      return <ChoiceField {...props} options={["default", "true", "false"]} fallback="default" />;
    case "int":
      return <TextField {...props} placeholder={formatDefault(spec)} />;
    case "pattern":
      return <PatternListField {...props} />;
    case "stringList":
      return rule?.type === "rootRef" ? <RootChecks {...props} /> : <ListField {...props} />;
  }
  if (spec.name === "path") return <ListField {...props} placeholder="relative/path" />;
  if (rule?.type === "enum") return <ChoiceField {...props} options={rule.values} fallback={String(spec.default)} />;
  if (rule?.type === "rootRef") return <RootChoiceField {...props} special={rule.special} />;
  return <TextField {...props} placeholder={formatDefault(spec) || undefined} />;
};

const formatDefault = (spec: PrefSpec) =>
  spec.name === "perms" && typeof spec.default === "number"
    ? `0o${spec.default.toString(8)}`
    : spec.default === null || spec.default === undefined
      ? ""
      : String(spec.default);

/** Name, unison's description (tap for its full documentation) and issues. */
export const FieldShell = ({
  spec,
  issues,
  control,
  children,
}: {
  spec: PrefSpec;
  issues: Issue[];
  control?: ReactNode;
  children?: ReactNode;
}) => {
  const [help, setHelp] = useState(false);
  const note = ANDROID[spec.name];
  return (
    <div className="mt-3">
      <Row className="items-center">
        <button
          className="flex flex-col flex-1 min-w-0 text-left cursor-pointer"
          onClick={() => setHelp(!help)}
        >
          <span className="text-blanched-almond text-sm font-mono">{spec.name}</span>
          <span className="text-xs text-amethyst-smoke">
            {spec.doc}
            {spec.help ? (help ? "" : " …") : ""}
          </span>
        </button>
        {control}
      </Row>
      {help && spec.help && (
        <div className="text-xs text-lavender-grey whitespace-pre-line mt-1">{spec.help}</div>
      )}
      {children}
      {note && note.level !== "managed" && !issues.some((i) => i.message === note.note) && (
        <div className="text-xs text-apricot mt-1">{note.note}</div>
      )}
      <Issues issues={issues} />
    </div>
  );
};

export const Issues = ({ issues, lines }: { issues: Issue[]; lines?: boolean }) => (
  <>
    {issues.map((issue, i) => (
      <div
        key={i}
        className={`text-sm mt-1 whitespace-pre-line ${issue.severity === "error" ? "text-dusty-rose" : "text-apricot"}`}
      >
        {lines && issue.line !== undefined ? `Line ${issue.line + 1}: ` : ""}
        {issue.message}
      </div>
    ))}
  </>
);

const ManagedField = ({ spec, issues }: FieldProps) => (
  <FieldShell spec={spec} issues={issues} control={<Checkbox checked disabled />}>
    <div className="text-xs text-apricot mt-1">{ANDROID[spec.name]?.note}</div>
  </FieldShell>
);

const BoolField = ({ spec, values, onChange, issues }: FieldProps) => {
  const on = (values.at(-1) ?? String(spec.default)) === "true";
  return (
    <FieldShell
      spec={spec}
      issues={issues}
      control={<Checkbox checked={on} onChange={(checked) => onChange([String(checked)])} />}
    />
  );
};

/** Segmented buttons, styled like the TODO keyword picker */
const Choices = ({
  options,
  current,
  onPick,
}: {
  options: { value: string | undefined; label: string }[];
  current: string | undefined;
  onPick: (value: string | undefined) => void;
}) => (
  <div className="flex flex-wrap gap-1 mt-1">
    {options.map((o) => (
      <Button
        key={o.label}
        className={`text-sm ${o.value === current ? PRIMARY : SECONDARY}`}
        onClick={() => onPick(o.value)}
      >
        {o.label}
      </Button>
    ))}
  </div>
);

const ChoiceField = ({
  spec,
  values,
  onChange,
  issues,
  options,
  fallback,
}: FieldProps & { options: string[]; fallback: string }) => {
  const current = values.at(-1) ?? fallback;
  return (
    <FieldShell spec={spec} issues={issues}>
      <Choices
        options={options.map((o) => ({ value: o, label: o }))}
        current={["yes"].includes(current) ? "true" : ["auto"].includes(current) ? "default" : current}
        onPick={(value) => onChange([value!])}
      />
    </FieldShell>
  );
};

/** "Android" for the local root, the host for a remote one */
const rootLabel = (root: string, index: number) => {
  try {
    const parsed = parseRoot(root);
    return parsed.host ? parsed.host : "Android";
  } catch {
    return index === 0 ? "first root" : "second root";
  }
};

/** prefer/force: "newer", "older" or one of the roots */
const RootChoiceField = ({
  spec,
  values,
  onChange,
  issues,
  roots,
  special,
}: FieldProps & { special: string[] }) => {
  const current = values.at(-1);
  const resolved = current && !special.includes(current) ? resolveRootRef(current, roots) : null;
  const options = [
    { value: undefined, label: "none" },
    ...special.map((s) => ({ value: s, label: s })),
    ...roots.map((root, i) => ({ value: root, label: rootLabel(root, i) })),
  ];
  return (
    <FieldShell spec={spec} issues={issues}>
      <Choices
        options={options}
        current={resolved !== null ? roots[resolved] : current || undefined}
        onPick={(value) => onChange(value === undefined ? [] : [value])}
      />
    </FieldShell>
  );
};

/** nocreation/nodeletion/noupdate: one check box per root */
const RootChecks = ({ spec, values, onChange, issues, roots }: FieldProps) => {
  const active = roots.map((_, i) => values.some((v) => resolveRootRef(v, roots) === i));
  return (
    <FieldShell spec={spec} issues={issues}>
      {roots.map((root, i) => (
        <Row key={i} className="items-center">
          <span className="flex-1 min-w-0 text-sm text-desert-sand break-all">{rootLabel(root, i)}</span>
          <Checkbox
            checked={active[i]}
            onChange={(checked) =>
              onChange(checked ? [...values, root] : values.filter((v) => resolveRootRef(v, roots) !== i))
            }
          />
        </Row>
      ))}
    </FieldShell>
  );
};

const TextField = ({ spec, values, onChange, issues, placeholder }: FieldProps & { placeholder?: string }) => (
  <FieldShell spec={spec} issues={issues}>
    <Input
      className="mt-1 w-full"
      value={values.at(-1) ?? ""}
      placeholder={placeholder}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        onChange(e.target.value === "" ? [] : [e.target.value])
      }
    />
  </FieldShell>
);

/** A list of rows, each removable, plus an add button */
const Rows = ({
  count,
  row,
  onAdd,
  onRemove,
}: {
  count: number;
  row: (index: number) => ReactNode;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <Row key={i} className="items-center mt-1">
        {row(i)}
        <IconButton onClick={() => onRemove(i)} title="Remove">
          <Icon title="x_lg" />
        </IconButton>
      </Row>
    ))}
    <Button className={`text-sm mt-1 self-start flex items-center gap-2 ${SECONDARY}`} onClick={onAdd}>
      <Icon title="plus_lg" /> Add
    </Button>
  </>
);

const ListField = ({ spec, values, onChange, issues, placeholder }: FieldProps & { placeholder?: string }) => (
  <FieldShell spec={spec} issues={issues}>
    <Rows
      count={values.length}
      onAdd={() => onChange([...values, ""])}
      onRemove={(i) => onChange(values.filter((_, j) => j !== i))}
      row={(i) => (
        <Input
          className="flex-1 min-w-0"
          value={values[i]}
          placeholder={placeholder}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(values.map((v, j) => (j === i ? e.target.value : v)))
          }
        />
      )}
    />
  </FieldShell>
);

/** Patterns: "Name|Path|BelowPath|Regex <pattern>", with "-> value" where it applies */
const PatternListField = ({ spec, values, onChange, issues }: FieldProps) => {
  const withValue = !!PATTERN_VALUES[spec.name];
  const update = (i: number, change: Partial<ReturnType<typeof parsePattern>>) =>
    onChange(values.map((v, j) => (j === i ? formatPattern({ ...parsePattern(v), ...change }) : v)));

  return (
    <FieldShell spec={spec} issues={issues}>
      <Rows
        count={values.length}
        onAdd={() => onChange([...values, withValue ? "Name  -> " : "Name "])}
        onRemove={(i) => onChange(values.filter((_, j) => j !== i))}
        row={(i) => {
          const pattern = parsePattern(values[i]);
          return (
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              <Select
                value={pattern.kind ?? ""}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  update(i, { kind: e.target.value as (typeof PATTERN_KINDS)[number] })
                }
              >
                {PATTERN_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
              <Input
                className="flex-1 min-w-0"
                value={pattern.body}
                placeholder={pattern.kind === "Regex" ? ".*\\.tmp" : "*.tmp"}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { body: e.target.value })}
              />
              {withValue && (
                <Input
                  className="w-full"
                  value={pattern.value ?? ""}
                  placeholder={spec.name === "merge" ? "-> command" : "-> newer, older or a root"}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { value: e.target.value })}
                />
              )}
            </div>
          );
        }}
      />
    </FieldShell>
  );
};
