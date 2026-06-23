export type SignalKind = "wifi" | "bluetooth" | "network" | "adapter" | "p2p" | "radio";
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
  | "radio"
  | "wifi"
  | "bluetooth"
  | "network"
  | "adapters"
  | "p2p-bitcoin"
  | "p2p-ethereum"
  | "p2p-base"
  | "p2p-ipfs"
  | "p2p-xmtp";

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
export type P2PNetworkId = "bitcoin" | "ethereum" | "base" | "ipfs" | "xmtp";

export interface P2PNetworkSettings {
  scope: P2PCollectionScope;
  enabled: boolean;
}

export type P2PSettingsState = Record<P2PNetworkId, P2PNetworkSettings>;
export type RadioDirectoryLimit = 40 | 100 | 250 | 500;

export interface RadioFilters {
  tag: string;          // e.g. "jazz", "pop"
  countrycode: string;  // e.g. "US", "DE" — 2-letter ISO
  codec: string;        // e.g. "MP3", "AAC"
  bitrateMin: string;   // e.g. "128"
  hidebroken: boolean;  // filter stations the API checker found offline
}

export const DEFAULT_RADIO_FILTERS: RadioFilters = {
  tag: "",
  countrycode: "",
  codec: "",
  bitrateMin: "",
  hidebroken: false,
};

export interface RadioSettingsState { directoryLimit: RadioDirectoryLimit; page: number; total: number; filters: RadioFilters; }

export type ThemeChoice = "system" | "light" | "dark";

declare global {
  interface Window {
    nodex: {
      scan: (onProgress?: (progress: ScanProgress) => void, targetCollectorIds?: ScanCollectorId[]) => Promise<ScanResult>;
      onRecordUpdate?: (callback: (record: SignalRecord) => void) => () => void;
      performAction: (input: RecordActionInput) => Promise<ActionResult>;
      setTheme: (theme: ThemeChoice) => Promise<void>;
      p2p: {
        getSettings: () => Promise<P2PSettingsState>;
        setScope: (networkId: P2PNetworkId, scope: P2PCollectionScope) => Promise<void>;
      };
      radio: {
        getSettings: () => Promise<RadioSettingsState>;
        setDirectoryLimit: (limit: RadioDirectoryLimit) => Promise<void>;
        setPage: (page: number) => Promise<void>;
        setFilters: (filters: RadioFilters) => Promise<void>;
      };
    };
  }
}
