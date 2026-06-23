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

export interface RadioFilters {
  tag: string;
  countrycode: string;
  codec: string;
  bitrateMin: string;
  hidebroken: boolean;
}
