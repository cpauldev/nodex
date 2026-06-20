import { Bluetooth, KeyRound, Network, Power, Unplug, Wifi } from "lucide-react";
import { useState } from "react";
import { getRecordActions, type RecordAction } from "../../recordActions";
import type { ActionResult, RecordActionId, SignalRecord } from "../../types";
import { Button } from "../ui/Button";
import { SectionLabel } from "../ui/SectionLabel";

const actionIcon: Record<RecordActionId, typeof Wifi> = {
  "adapter-disable": Power, "adapter-enable": Power, "bluetooth-disable": Bluetooth,
  "bluetooth-enable": Bluetooth, "bluetooth-settings": Bluetooth, "network-ping": Network,
  "wifi-connect": Wifi, "wifi-disconnect": Unplug
};

export function RecordActionPanel({ record, onChanged }: { record: SignalRecord; onChanged: () => Promise<void> }) {
  const actions = getRecordActions(record);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<RecordActionId | null>(null);
  const [outcome, setOutcome] = useState<ActionResult | null>(null);
  if (!actions.length) return null;

  async function perform(action: RecordAction) {
    setBusy(action.id);
    setOutcome(null);
    try {
      const response = await window.nodex.performAction({
        action: action.id, password: action.password ? password : undefined, record
      });
      setOutcome(response);
      if (response.ok && action.id !== "bluetooth-settings" && action.id !== "network-ping") await onChanged();
    } catch (error) {
      setOutcome({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  return <section className="record-actions">
    <SectionLabel>Actions</SectionLabel>
    {actions.map((action) => {
      const Icon = actionIcon[action.id];
      const passwordInvalid = action.password && password.length < 8;
      return <div className="record-action" key={action.id}>
        <div className="record-action__copy"><strong>{action.label}</strong><span>{action.description}</span></div>
        {action.password ? <label className="ui-input-group">
          <KeyRound size={16} aria-hidden="true" />
          <input autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="Network password" type="password" value={password} />
        </label> : null}
        <Button
          variant={action.destructive ? "danger" : "primary"}
          loading={busy === action.id}
          disabled={busy !== null || passwordInvalid}
          icon={<Icon size={16} />}
          onClick={() => void perform(action)}
        >{busy === action.id ? "Working…" : action.label}</Button>
      </div>;
    })}
    {outcome ? <div className={`ui-notice ui-notice--${outcome.ok ? "success" : "danger"}`} role="status">{outcome.message}</div> : null}
  </section>;
}
