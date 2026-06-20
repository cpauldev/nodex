import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  iconOnly = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return <button
    className={["ui-button", `ui-button--${variant}`, `ui-button--${size}`, iconOnly ? "ui-button--icon" : "", className].filter(Boolean).join(" ")}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? <LoaderCircle className="ui-spin" size={16} aria-hidden="true" /> : icon}
    {iconOnly ? <span className="sr-only">{props["aria-label"]}</span> : children}
  </button>;
}
