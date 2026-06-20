import { Download } from "lucide-react";
import type { ThemeChoice } from "../../types";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { SegmentedControl } from "../ui/SegmentedControl";
import { SelectMenu } from "../ui/SelectMenu";
import { Switch } from "../ui/Switch";

const refreshOptions = [
  { label: "Off", value: "0" }, { label: "5 seconds", value: "5" }, { label: "15 seconds", value: "15" },
  { label: "30 seconds", value: "30" }, { label: "1 minute", value: "60" }
];
const themeOptions = [
  { label: "System", value: "system" }, { label: "Light", value: "light" }, { label: "Dark", value: "dark" }
] as const;

export function SettingsDrawer({ theme, onTheme, refreshSeconds, onRefreshSeconds, showPeerMap, onShowPeerMap, onExport, exportDisabled, onClose }: {
  theme: ThemeChoice; onTheme: (value: ThemeChoice) => void; refreshSeconds: number; onRefreshSeconds: (value: number) => void;
  showPeerMap: boolean; onShowPeerMap: (show: boolean) => void;
  onExport: () => void; exportDisabled: boolean; onClose: () => void;
}) {
  return <Drawer title="Settings" description="Appearance and scanning preferences" onClose={onClose} className="settings-drawer">
    <div className="settings-list">
      <div className="settings-cell">
        <label>Appearance</label>
        <SegmentedControl label="Appearance" value={theme} options={themeOptions} onChange={onTheme} />
      </div>
      <div className="settings-cell">
        <label>Auto-refresh</label>
        <SelectMenu label="Auto-refresh interval" value={String(refreshSeconds)} options={refreshOptions} onChange={(value) => onRefreshSeconds(Number(value))} />
      </div>
      <div className="settings-cell">
        <label>Peer map</label>
        <Switch checked={showPeerMap} label="Show peer map" onCheckedChange={onShowPeerMap} />
      </div>
      <div className="settings-cell">
        <label>Export data</label>
        <Button icon={<Download size={18} />} onClick={onExport} disabled={exportDisabled}>Export scan as JSON</Button>
      </div>
    </div>
  </Drawer>;
}
