export const P2P_NETWORK_IDS = ["xmtp", "ethereum", "ipfs", "bitcoin", "base"] as const;
export type P2PNetworkId = typeof P2P_NETWORK_IDS[number];
export type CollectionScope = "known" | "expanded";

export interface NetworkSettings {
  scope: CollectionScope;
  enabled: boolean;
}

export interface P2PCollectionConfig {
  networks: Record<P2PNetworkId, NetworkSettings>;
  maxRecordsPerNetwork: number;
  connectionTimeoutMs: number;
}

export interface P2PEndpoint {
  id: string;
  networkId: P2PNetworkId;
  network: string;
  name: string;
  address?: string;
  latencyMs?: number;
  status: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface P2PNetworkCollector {
  readonly networkId: P2PNetworkId;
  readonly networkName: string;
  collect(
    settings: NetworkSettings,
    options: Pick<P2PCollectionConfig, "maxRecordsPerNetwork" | "connectionTimeoutMs">,
    onEndpoint?: (endpoint: P2PEndpoint) => void
  ): Promise<P2PEndpoint[]>;
}

export function isP2PNetworkId(value: unknown): value is P2PNetworkId {
  return typeof value === "string" && P2P_NETWORK_IDS.includes(value as P2PNetworkId);
}

export function isCollectionScope(value: unknown): value is CollectionScope {
  return value === "known" || value === "expanded";
}
