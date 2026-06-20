export type SignalKind = "wifi" | "bluetooth" | "network" | "adapter" | "p2p";
export type RecordClass = "observed" | "known" | "neighbor" | "protocol" | "infrastructure" | "p2p-network";

export interface SignalRecord {
  id: string;
  kind: SignalKind;
  recordClass: RecordClass;
  provenance: string;
  name: string;
  address?: string;
  strength?: number;
  status: string;
  security?: string;
  channel?: string;
  band?: string;
  manufacturer?: string;
  details: Record<string, string | number | boolean | null>;
  geo?: GeoLocation;
}

export interface GeoLocation {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  source: "geoip-lite";
}

export interface ScanResult {
  scannedAt: string;
  durationMs: number;
  records: SignalRecord[];
  warnings: string[];
}

export type ScanCollectorId =
  | "wifi"
  | "bluetooth"
  | "network"
  | "adapters"
  | "p2p-xmtp"
  | "p2p-ethereum"
  | "p2p-ipfs"
  | "p2p-bitcoin"
  | "p2p-base";

export interface ScanProgress {
  collectorId: ScanCollectorId;
  phase: "partial" | "complete";
  records: SignalRecord[];
  warning?: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export type RecordActionId =
  | "wifi-connect"
  | "wifi-disconnect"
  | "bluetooth-settings"
  | "bluetooth-enable"
  | "bluetooth-disable"
  | "network-ping"
  | "adapter-enable"
  | "adapter-disable";

export interface RecordActionInput {
  action: RecordActionId;
  record: SignalRecord;
  password?: string;
}

export type P2PCollectionScope = "known" | "expanded";
export type P2PNetworkId = "xmtp" | "ethereum" | "ipfs" | "base" | "bitcoin";

export interface P2PNetworkSettings {
  scope: P2PCollectionScope;
  enabled: boolean;
}

export type P2PSettingsState = Record<P2PNetworkId, P2PNetworkSettings>;

export type ThemeChoice = "system" | "light" | "dark";

declare global {
  interface Window {
    nodex: {
      scan: (onProgress?: (progress: ScanProgress) => void) => Promise<ScanResult>;
      performAction: (input: RecordActionInput) => Promise<ActionResult>;
      setTheme: (theme: ThemeChoice) => Promise<void>;
      p2p: {
        getSettings: () => Promise<P2PSettingsState>;
        setScope: (networkId: P2PNetworkId, scope: P2PCollectionScope) => Promise<void>;
      };
    };
  }
}
