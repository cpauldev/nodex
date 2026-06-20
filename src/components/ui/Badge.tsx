import type { ReactNode } from "react";
import type { Tone } from "../../presentation";

export function Badge({ tone = "neutral", icon, children, secondary }: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  secondary?: ReactNode;
}) {
  return <span className="ui-badge-group">
    <span className={`ui-badge ui-badge--${tone}`}>{icon}{children}</span>
    {secondary !== undefined ? <span className={`ui-badge ui-badge--secondary ui-badge--${tone}`}>{secondary}</span> : null}
  </span>;
}
