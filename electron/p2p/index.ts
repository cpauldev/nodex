import type { SignalRecord } from "../types.js";
import { p2pRegistry } from "./registry.js";
import type { P2PCollectionConfig, P2PEndpoint, P2PNetworkId } from "./types.js";

export async function collectP2PNetwork(
  networkId: P2PNetworkId,
  config: P2PCollectionConfig,
  onRecord?: (record: SignalRecord) => void
): Promise<SignalRecord[]> {
  const collector = p2pRegistry.get(networkId);
  if (!collector || !config.networks[networkId].enabled) return [];

  const options = {
    maxRecordsPerNetwork: config.maxRecordsPerNetwork,
    connectionTimeoutMs: config.connectionTimeoutMs
  };
  const endpoints = await collector.collect(
    config.networks[networkId],
    options,
    (endpoint) => onRecord?.(toSignalRecord(endpoint))
  );
  return endpoints.map(toSignalRecord);
}

function toSignalRecord(endpoint: P2PEndpoint): SignalRecord {
  return {
    id: endpoint.id,
    kind: "p2p",
    recordClass: "p2p-network",
    provenance: endpoint.network,
    name: endpoint.name,
    address: endpoint.address,
    status: endpoint.latencyMs === undefined ? endpoint.status : `${endpoint.latencyMs} ms`,
    details: {
      Network: endpoint.network,
      Source: endpoint.metadata["Discovery source"] ?? null,
      "Latency (ms)": endpoint.latencyMs ?? null,
      ...endpoint.metadata
    }
  };
}

export { p2pSettings } from "./settings-store.js";
export { isCollectionScope, isP2PNetworkId } from "./types.js";
export type { CollectionScope, P2PCollectionConfig, P2PNetworkId } from "./types.js";
