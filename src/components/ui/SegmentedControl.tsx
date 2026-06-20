export function SegmentedControl<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  return <div className="ui-segmented" role="radiogroup" aria-label={label}>
    {options.map((option) => <button
      aria-checked={value === option.value}
      className={value === option.value ? "is-active" : ""}
      key={option.value}
      onClick={() => onChange(option.value)}
      role="radio"
    >{option.label}</button>)}
  </div>;
}
