export function Switch({ checked, disabled, label, onCheckedChange }: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return <button
    aria-checked={checked}
    aria-label={label}
    className={checked ? "ui-switch is-active" : "ui-switch"}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    role="switch"
  ><span /></button>;
}
