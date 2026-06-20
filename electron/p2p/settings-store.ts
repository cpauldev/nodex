import { P2P_NETWORK_IDS, type CollectionScope, type P2PCollectionConfig, type P2PNetworkId } from "./types.js";

const DEFAULT_NETWORK = { scope: "known", enabled: true } as const;

export class P2PSettingsStore {
  private readonly config: P2PCollectionConfig = {
    networks: Object.fromEntries(P2P_NETWORK_IDS.map((id) => [id, { ...DEFAULT_NETWORK }])) as P2PCollectionConfig["networks"],
    maxRecordsPerNetwork: 100,
    connectionTimeoutMs: 3_000
  };

  getCollectionConfig(): P2PCollectionConfig {
    return {
      ...this.config,
      networks: Object.fromEntries(
        P2P_NETWORK_IDS.map((id) => [id, { ...this.config.networks[id] }])
      ) as P2PCollectionConfig["networks"]
    };
  }

  setScope(networkId: P2PNetworkId, scope: CollectionScope): void {
    this.config.networks[networkId] = { ...this.config.networks[networkId], scope };
  }
}

export const p2pSettings = new P2PSettingsStore();
