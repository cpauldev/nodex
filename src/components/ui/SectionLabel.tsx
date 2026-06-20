import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="ui-section-label">{children}</h3>;
}
