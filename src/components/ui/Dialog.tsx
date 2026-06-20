import type { ReactNode } from "react";
import { Button } from "./Button";
import { useOverlayFocus } from "./useOverlayFocus";

export function Dialog({ title, icon, children, confirmLabel, onConfirm, onClose }: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useOverlayFocus(onClose);
  const titleId = `dialog-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <div className="ui-overlay ui-overlay--dialog" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div ref={ref} className="ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="ui-dialog__header">{icon}<h2 id={titleId}>{title}</h2></header>
      <div className="ui-dialog__body">{children}</div>
      <footer className="ui-dialog__actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm}>{confirmLabel}</Button>
      </footer>
    </div>
  </div>;
}
