import { Bluetooth, Cable, List, Network, Radio, Waypoints, Wifi } from "lucide-react";
import type { P2PNetworkId, RecordClass, ScanCollectorId, SignalKind, SignalRecord } from "./types";

export type LocalViewId = "local-all" | "local-wifi" | "local-bluetooth" | "local-neighbors" | "local-services" | "local-adapters";
export type ViewId = LocalViewId | "p2p-xmtp" | "p2p-ethereum" | "p2p-ipfs" | "p2p-bitcoin" | "p2p-base";
export type SortKey = "kind" | "name" | "strength" | "status" | "address" | "provenance";
export type SortState = { key: SortKey; direction: "asc" | "desc" };
export type Tone = "neutral" | "accent" | "info" | "success" | "warning" | "danger" | "purple";

export const localViews: Array<{ id: LocalViewId; label: string; description: string; collectors: ScanCollectorId[]; icon: typeof Radio; matches: (record: SignalRecord) => boolean }> = [
  { id: "local-all", label: "All local data", description: "Nearby wireless devices, network neighbors, services, and adapters detected by Windows.", collectors: ["wifi", "bluetooth", "network", "adapters"], icon: List, matches: (record) => record.kind !== "p2p" },
  { id: "local-wifi", label: "Wi-Fi networks", description: "Nearby Wi-Fi networks detected by the Windows wireless interface.", collectors: ["wifi"], icon: Wifi, matches: (record) => record.kind === "wifi" },
  { id: "local-bluetooth", label: "Bluetooth devices", description: "Bluetooth devices currently known to Windows.", collectors: ["bluetooth"], icon: Bluetooth, matches: (record) => record.kind === "bluetooth" },
  { id: "local-neighbors", label: "Network neighbors", description: "Devices currently listed in the Windows network neighbor cache.", collectors: ["network"], icon: Network, matches: (record) => record.recordClass === "neighbor" },
  { id: "local-services", label: "Multicast services", description: "Local multicast groups and service-discovery protocols observed by Windows.", collectors: ["network"], icon: Waypoints, matches: (record) => record.recordClass === "protocol" },
  { id: "local-adapters", label: "Network adapters", description: "Network interfaces installed on this Windows device.", collectors: ["adapters"], icon: Cable, matches: (record) => record.kind === "adapter" }
];

export const p2pViews: Array<{ id: ViewId; label: string; description: string; networkName: string; networkId: P2PNetworkId; supportsExpandedDiscovery: boolean; footerDescription: string }> = [
  { id: "p2p-base", label: "Base", description: "Base devp2p bootnodes and discovered candidates checked through discovery v4 and TCP.", networkName: "Base Mainnet", networkId: "base", supportsExpandedDiscovery: true, footerDescription: "Search beyond the configured endpoints." },
  { id: "p2p-bitcoin", label: "Bitcoin", description: "Bitcoin peers found through mainnet DNS seeds and peer announcements, then verified by handshake.", networkName: "Bitcoin Mainnet", networkId: "bitcoin", supportsExpandedDiscovery: true, footerDescription: "Search beyond the configured endpoints." },
  { id: "p2p-ethereum", label: "Ethereum", description: "Ethereum devp2p candidates found through bootnodes and DNS discovery, then checked for TCP reachability.", networkName: "Ethereum Mainnet", networkId: "ethereum", supportsExpandedDiscovery: true, footerDescription: "Search beyond the configured endpoints." },
  { id: "p2p-ipfs", label: "IPFS", description: "IPFS bootstrap peers and verified swarm peers sampled through a temporary local Kubo runtime.", networkName: "IPFS", networkId: "ipfs", supportsExpandedDiscovery: true, footerDescription: "Search beyond the configured endpoints." },
  { id: "p2p-xmtp", label: "XMTP", description: "Official XMTP Testnet nodes resolved and checked for reachability.", networkName: "XMTP Testnet", networkId: "xmtp", supportsExpandedDiscovery: false, footerDescription: "Additional peer discovery is not available." }
];

export const kindLabel: Record<SignalKind, string> = {
  wifi: "Wi-Fi", bluetooth: "Bluetooth", network: "Network", adapter: "Adapter", p2p: "P2P Network"
};

export const classLabel: Record<RecordClass, string> = {
  observed: "Observed now", known: "Known inventory", neighbor: "Neighbor cache",
  protocol: "Protocol", infrastructure: "Infrastructure", "p2p-network": "P2P Network"
};

export const networkLabels: Record<P2PNetworkId, string> = {
  ethereum: "Ethereum", ipfs: "IPFS", xmtp: "XMTP", bitcoin: "Bitcoin", base: "Base"
};

export const scanCollectorIds: ScanCollectorId[] = [
  "wifi", "bluetooth", "network", "adapters", "p2p-xmtp", "p2p-ethereum", "p2p-ipfs", "p2p-bitcoin", "p2p-base"
];

export function collectorForRecord(record: SignalRecord): ScanCollectorId {
  if (record.kind === "wifi") return "wifi";
  if (record.kind === "bluetooth") return "bluetooth";
  if (record.kind === "adapter") return "adapters";
  if (record.kind === "p2p") {
    const view = p2pViews.find(({ networkName }) => networkName === record.provenance);
    if (view) return view.id as ScanCollectorId;
  }
  return "network";
}

export function getSecondaryLabel(record: SignalRecord): string | undefined {
  if (record.kind === "p2p") return record.provenance.replace(/ Mainnet$/, "").replace(/ Testnet$/, "");
  if (record.kind === "wifi" && record.status === "Connected") return "Connected";
  if (record.recordClass === "observed" && (record.strength ?? 0) >= 70) return "Nearby";
  return undefined;
}

export function signalTone(value: number): Tone {
  if (value >= 75) return "success";
  if (value >= 45) return "warning";
  return "danger";
}

export function recordLatency(record: SignalRecord): number | undefined {
  const latency = record.details["Latency (ms)"];
  return typeof latency === "number" ? latency : undefined;
}

export function latencyTone(latency: number | undefined): Tone {
  if (latency === undefined) return "neutral";
  if (latency < 100) return "success";
  if (latency < 250) return "warning";
  return "danger";
}

export function projectGeoPoint(latitude: number, longitude: number) {
  const A0 = 0.8707, A1 = -0.131979, A2 = -0.013791, A3 = 0.003971, A4 = -0.001529;
  const B0 = 1.007226, B1 = 0.015085, B2 = -0.044475, B3 = 0.028874, B4 = -0.005916;
  const phi = latitude * (Math.PI / 180);
  const lambda = longitude * (Math.PI / 180);
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  const x = lambda * (A0 + phi2 * (A1 + phi2 * (A2 + phi4 * (A3 + phi2 * A4))));
  const y = phi * (B0 + phi2 * (B1 + phi4 * (B2 + phi2 * (B3 + phi4 * B4))));
  return {
    x: Math.min(100, Math.max(0, ((x + 2.66) / 5.32) * 100)),
    y: Math.min(100, Math.max(0, ((1.33 - y) / 2.66) * 100))
  };
}

export function formatRelativeTime(timestamp: string, currentTime: number): string {
  const seconds = Math.max(0, Math.floor((currentTime - new Date(timestamp).getTime()) / 1_000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
