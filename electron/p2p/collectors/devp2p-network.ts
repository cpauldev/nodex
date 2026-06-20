import { randomBytes } from "node:crypto";
import { DPT, type PeerInfo } from "@ethereumjs/devp2p";
import { BaseP2PCollector } from "../base-collector.js";
import { isDiscoveryPong, measureDiscoveryPing } from "../devp2p-discovery.js";
import type { NetworkSettings, P2PCollectionConfig, P2PEndpoint, P2PNetworkId } from "../types.js";

const DISCOVERY_WINDOW_MS = 12_000;
const DISCOVERY_REFRESH_INTERVAL_MS = 1_000;
const MAX_DISCOVERY_BOOTNODES = 5;
const MAX_CRAWL_DURATION_MS = 25_000;
const SCAN_CONCURRENCY = 10;
const MAX_VERIFIED_PEERS = 500;
const VERIFIED_PEER_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_FAILURES = 3;

interface DevP2PNetworkDefinition {
  networkId: Extract<P2PNetworkId, "ethereum" | "base">;
  networkName: string;
  chainId: number;
  bootstrapNodes: readonly string[];
  discoverySource: string;
  dnsDiscoveryTree?: string;
}

interface VerifiedPeer {
  endpoint: P2PEndpoint;
  failures: number;
  lastVerifiedAt: number;
}

interface DiscoveredPeer {
  address: string;
  udpPort: number | null;
  tcpPort: number | null;
  id?: Uint8Array;
}

export abstract class DevP2PNetworkCollector extends BaseP2PCollector {
  abstract readonly networkId: DevP2PNetworkDefinition["networkId"];
  abstract readonly networkName: string;
  protected abstract readonly definition: DevP2PNetworkDefinition;
  private readonly verifiedPeers = new Map<string, VerifiedPeer>();

  async collect(
    settings: NetworkSettings,
    options: Pick<P2PCollectionConfig, "maxRecordsPerNetwork" | "connectionTimeoutMs">,
    onEndpoint?: (endpoint: P2PEndpoint) => void
  ): Promise<P2PEndpoint[]> {
    if (settings.scope === "known") return this.collectBootnodes(options, onEndpoint);

    this.pruneVerifiedPeers();
    const discovered = await this.discoverPeers(options.connectionTimeoutMs);
    const queue = discovered.slice(0, options.maxRecordsPerNetwork);
    let nextIndex = 0;
    const deadline = Date.now() + MAX_CRAWL_DURATION_MS;

    const worker = async () => {
      while (nextIndex < queue.length && Date.now() < deadline) {
        const peer = queue[nextIndex++];
        if (peer.tcpPort === null) continue;
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) return;

        const latencyMs = await this.measureTcpLatency(
          peer.address,
          peer.tcpPort,
          Math.min(options.connectionTimeoutMs, remainingMs)
        );
        const key = peerKey(peer);
        if (latencyMs === undefined) {
          this.recordFailure(key);
          continue;
        }

        const endpoint = this.toEndpoint(peer, latencyMs);
        this.verifiedPeers.set(key, { endpoint, failures: 0, lastVerifiedAt: Date.now() });
        onEndpoint?.(endpoint);
      }
    };

    await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, queue.length) }, () => worker()));
    return [...this.verifiedPeers.values()]
      .sort((left, right) => right.lastVerifiedAt - left.lastVerifiedAt)
      .map(({ endpoint }) => endpoint);
  }

  private async collectBootnodes(
    options: Pick<P2PCollectionConfig, "maxRecordsPerNetwork" | "connectionTimeoutMs">,
    onEndpoint?: (endpoint: P2PEndpoint) => void
  ): Promise<P2PEndpoint[]> {
    return Promise.all(this.definition.bootstrapNodes.slice(0, options.maxRecordsPerNetwork).map(async (enode, index) => {
      const peer = parseEnode(enode);
      const host = peer.address!;
      const [discoveryPing, tcpLatencyMs] = await Promise.all([
        peer.udpPort == null
          ? Promise.resolve(undefined)
          : measureDiscoveryPing(host, peer.udpPort, options.connectionTimeoutMs),
        peer.tcpPort == null
          ? Promise.resolve(undefined)
          : this.measureTcpLatency(host, peer.tcpPort, options.connectionTimeoutMs)
      ]);
      const discoveryVerified = isDiscoveryPong(discoveryPing);
      const latencyMs = discoveryVerified ? discoveryPing?.latencyMs : tcpLatencyMs;
      const endpoint = this.endpoint({
        id: `${this.networkId}-bootnode-${host}`,
        name: `${this.networkName} bootnode ${index + 1}`,
        address: formatAddress(host, peer.tcpPort ?? null),
        latencyMs,
        status: discoveryVerified
          ? "Discovery verified"
          : tcpLatencyMs === undefined ? "Advertised bootnode" : "TCP reachable",
        metadata: {
          "Discovery source": this.definition.discoverySource,
          "Node record": enode,
          Protocol: "Ethereum devp2p",
          "UDP discovery port": peer.udpPort ?? null,
          "Discovery pong": discoveryVerified,
          "TCP reachable": tcpLatencyMs !== undefined,
          "Chain ID": this.definition.chainId
        }
      });
      onEndpoint?.(endpoint);
      return endpoint;
    }));
  }

  private async discoverPeers(timeoutMs: number): Promise<DiscoveredPeer[]> {
    const dpt = new DPT(randomBytes(32), {
      endpoint: { address: "0.0.0.0", udpPort: null, tcpPort: null },
      timeout: timeoutMs,
      refreshInterval: 60_000,
      shouldFindNeighbours: true,
      shouldGetDnsPeers: Boolean(this.definition.dnsDiscoveryTree),
      dnsNetworks: this.definition.dnsDiscoveryTree ? [this.definition.dnsDiscoveryTree] : undefined
    });
    try {
      if (this.definition.dnsDiscoveryTree) {
        const dnsPeers = await dpt.getDnsPeers();
        await Promise.allSettled(dnsPeers.map((peer) => dpt.addPeer(peer)));
      }
      await Promise.allSettled(
        this.definition.bootstrapNodes
          .slice(0, MAX_DISCOVERY_BOOTNODES)
          .map((enode) => dpt.bootstrap(parseEnode(enode)))
      );
      // A discv4 endpoint may require a return ping before it will answer the
      // first FindNode request. Refreshing the table keeps the lookup moving as
      // newly announced nodes pass their own endpoint checks.
      const expiresAt = Date.now() + DISCOVERY_WINDOW_MS;
      while (Date.now() < expiresAt) {
        await delay(Math.min(DISCOVERY_REFRESH_INTERVAL_MS, expiresAt - Date.now()));
        await dpt.refresh();
      }
      const discovered = dpt.getPeers()
        .map(toDiscoveredPeer)
        .filter((peer): peer is DiscoveredPeer => peer !== undefined)
        .filter((peer) => peer.tcpPort !== null);
      for (const enode of this.definition.bootstrapNodes) {
        const bootstrap = toDiscoveredPeer(parseEnode(enode));
        if (bootstrap && !discovered.some((peer) => peerKey(peer) === peerKey(bootstrap))) discovered.push(bootstrap);
      }
      return discovered.sort((left, right) => Number(right.id !== undefined) - Number(left.id !== undefined));
    } finally {
      dpt.destroy();
    }
  }

  private toEndpoint(peer: DiscoveredPeer, latencyMs: number): P2PEndpoint {
    const nodeId = peer.id ? Buffer.from(peer.id).toString("hex") : undefined;
    return this.endpoint({
      id: `${this.networkId}-peer-${nodeId ?? `${peer.address}-${peer.tcpPort}`}`,
      name: `${this.networkName} peer ${peer.address}`,
      address: formatAddress(peer.address, peer.tcpPort),
      latencyMs,
      status: "Discovery and TCP verified",
      metadata: {
        "Discovery source": "devp2p discovery v4",
        "Node ID": nodeId ?? null,
        "UDP discovery port": peer.udpPort,
        "TCP port": peer.tcpPort,
        "Chain ID": this.definition.chainId,
        "Network membership": "Not verified; devp2p discovery does not include a chain identifier",
        Protocol: "Ethereum devp2p"
      }
    });
  }

  private recordFailure(key: string) {
    const verified = this.verifiedPeers.get(key);
    if (!verified) return;
    verified.failures += 1;
    if (verified.failures >= MAX_FAILURES) this.verifiedPeers.delete(key);
  }

  private pruneVerifiedPeers() {
    const expiresAt = Date.now() - VERIFIED_PEER_TTL_MS;
    for (const [key, peer] of this.verifiedPeers) {
      if (peer.lastVerifiedAt < expiresAt) this.verifiedPeers.delete(key);
    }
    while (this.verifiedPeers.size > MAX_VERIFIED_PEERS) {
      const oldest = [...this.verifiedPeers.entries()]
        .sort(([, left], [, right]) => left.lastVerifiedAt - right.lastVerifiedAt)[0];
      this.verifiedPeers.delete(oldest[0]);
    }
  }
}

function parseEnode(enode: string): PeerInfo {
  const match = /^enode:\/\/([0-9a-f]{128})@(.+):(\d+)$/.exec(enode);
  if (!match) throw new Error(`Invalid devp2p node record: ${enode}`);
  const [, id, address, port] = match;
  return { id: Buffer.from(id, "hex"), address, udpPort: Number(port), tcpPort: Number(port) };
}

function toDiscoveredPeer(peer: PeerInfo): DiscoveredPeer | undefined {
  if (!peer.address || !peer.tcpPort) return undefined;
  return { address: peer.address, udpPort: peer.udpPort ?? null, tcpPort: peer.tcpPort ?? null, id: peer.id };
}

function peerKey(peer: DiscoveredPeer): string {
  return peer.id ? Buffer.from(peer.id).toString("hex") : `${peer.address}:${peer.tcpPort}`;
}

function formatAddress(host: string, port: number | null): string {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
