import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { useOverlayFocus } from "./useOverlayFocus";

export function Drawer({ title, description, onClose, children, className = "" }: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useOverlayFocus(onClose);
  const titleId = `drawer-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <div className="ui-overlay ui-overlay--drawer" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div ref={ref} className={["ui-drawer", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="ui-drawer__header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <div className="ui-drawer__description">{description}</div> : null}
        </div>
        <Button variant="ghost" size="sm" icon={<X size={18} />} iconOnly aria-label={`Close ${title}`} onClick={onClose} />
      </header>
      {children}
    </div>
  </div>;
}
