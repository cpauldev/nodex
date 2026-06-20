import { BaseP2PCollector } from "../base-collector.js";
import { KuboRuntime } from "../kubo-runtime.js";
import type { NetworkSettings, P2PCollectionConfig, P2PEndpoint } from "../types.js";

const MAX_CRAWL_DURATION_MS = 25_000;
const MAX_VERIFIED_PEERS = 500;
const VERIFIED_PEER_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_FAILURES = 3;

// The current delegated DNS records resolve these four stable Kubo bootstrap
// peer IDs to regional addresses. Keep the DNSADDR form so addresses can rotate
// without shipping a new client.
export const IPFS_BOOTSTRAP_PEERS = [
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt"
] as const;

interface VerifiedPeer {
  endpoint: P2PEndpoint;
  failures: number;
  lastVerifiedAt: number;
}

export class IPFSCollector extends BaseP2PCollector {
  readonly networkId = "ipfs" as const;
  readonly networkName = "IPFS";
  private readonly verifiedPeers = new Map<string, VerifiedPeer>();

  async collect(
    settings: NetworkSettings,
    options: Pick<P2PCollectionConfig, "maxRecordsPerNetwork" | "connectionTimeoutMs">,
    onEndpoint?: (endpoint: P2PEndpoint) => void
  ): Promise<P2PEndpoint[]> {
    if (settings.scope === "known") return this.collectBootstrapPeers(options, onEndpoint);
    this.pruneVerifiedPeers();
    const runtime = new KuboRuntime({ bootstrapPeers: IPFS_BOOTSTRAP_PEERS });
    const deadline = Date.now() + MAX_CRAWL_DURATION_MS;
    const emitted = new Set<string>();
    try {
      await runtime.start();
      const bootstrapPeerIds = new Set(IPFS_BOOTSTRAP_PEERS.map((address) => address.split("/p2p/")[1]).filter(Boolean));
      const connectedBootstrapPeers = await this.connectBootstrapPeers(runtime, options.connectionTimeoutMs);
      if (connectedBootstrapPeers === 0) return this.cachedEndpoints(options.maxRecordsPerNetwork);
      // A swarm listing is passive. Query the public Amino DHT only after a
      // verified bootstrap connection, then explicitly dial returned peer IDs.
      // A candidate is emitted only if Kubo reports an active swarm connection.
      const dhtQueries = await Promise.allSettled([...bootstrapPeerIds].map((peerId) =>
        runtime.queryDht(peerId, Math.min(8_000, Math.max(1_000, deadline - Date.now())))
      ));
      const candidates = [...new Set(dhtQueries.flatMap((result) =>
        result.status === "fulfilled" ? result.value : []
      ))].filter((peerId) => !bootstrapPeerIds.has(peerId)).slice(0, options.maxRecordsPerNetwork);
      for (const peerId of candidates) {
        if (Date.now() >= deadline) break;
        const started = Date.now();
        try {
          await runtime.connect(`/p2p/${peerId}`, Math.min(options.connectionTimeoutMs, deadline - Date.now()));
        } catch {
          continue;
        }
        const connected = (await runtime.swarmPeers()).find((peer) => peer.peerId === peerId);
        if (!connected) continue;
        const endpoint = this.toVerifiedEndpoint(connected.peerId, connected.address, connected.latencyMs ?? Date.now() - started);
        emitted.add(peerId);
        this.verifiedPeers.set(peerId, { endpoint, failures: 0, lastVerifiedAt: Date.now() });
        onEndpoint?.(endpoint);
      }
      while (Date.now() < deadline && emitted.size < options.maxRecordsPerNetwork) {
        const started = Date.now();
        const peers = await runtime.swarmPeers();
        for (const peer of peers) {
          if (bootstrapPeerIds.has(peer.peerId) || emitted.has(peer.peerId)) continue;
          const endpoint = this.toVerifiedEndpoint(peer.peerId, peer.address, peer.latencyMs ?? Date.now() - started);
          emitted.add(peer.peerId);
          this.verifiedPeers.set(peer.peerId, { endpoint, failures: 0, lastVerifiedAt: Date.now() });
          onEndpoint?.(endpoint);
          if (emitted.size >= options.maxRecordsPerNetwork) break;
        }
        if (emitted.size >= options.maxRecordsPerNetwork) break;
        await delay(Math.min(1_000, Math.max(0, deadline - Date.now())));
      }
    } catch {
      for (const peerId of emitted) this.recordFailure(peerId);
    } finally {
      await runtime.stop();
    }
    return this.cachedEndpoints(options.maxRecordsPerNetwork);
  }

  private async connectBootstrapPeers(runtime: KuboRuntime, timeoutMs: number): Promise<number> {
    const attempts = await Promise.all(IPFS_BOOTSTRAP_PEERS.map(async (address) => {
      try {
        await runtime.connect(address, timeoutMs);
        return true;
      } catch {
        return false;
      }
    }));
    return attempts.filter(Boolean).length;
  }

  private async collectBootstrapPeers(
    options: Pick<P2PCollectionConfig, "maxRecordsPerNetwork" | "connectionTimeoutMs">,
    onEndpoint?: (endpoint: P2PEndpoint) => void
  ): Promise<P2PEndpoint[]> {
    const runtime = new KuboRuntime({ bootstrapPeers: IPFS_BOOTSTRAP_PEERS });
    try {
      await runtime.start();
      return await Promise.all(IPFS_BOOTSTRAP_PEERS.slice(0, options.maxRecordsPerNetwork).map(async (address, index) => {
        const peerId = address.split("/p2p/")[1] ?? `bootstrap-${index + 1}`;
        const started = Date.now();
        let latencyMs: number | undefined;
        try {
          await runtime.connect(address, options.connectionTimeoutMs);
          latencyMs = Date.now() - started;
        } catch {
          // This is an advertised bootstrap peer, not a discovered peer. Keep
          // it visible with an accurate reachability status like other P2P views.
        }
        const endpoint = this.endpoint({
          id: `ipfs-bootstrap-${peerId}`,
          name: `IPFS bootstrap peer ${index + 1}`,
          address,
          latencyMs,
          status: latencyMs === undefined ? "Bootstrap unavailable" : "IPFS verified",
          metadata: {
            "Discovery source": "Kubo default bootstrap list",
            "Peer ID": peerId,
            "Connection verified": latencyMs !== undefined,
            Protocol: "IPFS Amino DHT / libp2p"
          }
        });
        onEndpoint?.(endpoint);
        return endpoint;
      }));
    } finally {
      await runtime.stop();
    }
  }

  private recordFailure(peerId: string) {
    const verified = this.verifiedPeers.get(peerId);
    if (!verified) return;
    verified.failures += 1;
    if (verified.failures >= MAX_FAILURES) this.verifiedPeers.delete(peerId);
  }

  private pruneVerifiedPeers() {
    const expiresAt = Date.now() - VERIFIED_PEER_TTL_MS;
    for (const [peerId, peer] of this.verifiedPeers) {
      if (peer.lastVerifiedAt < expiresAt) this.verifiedPeers.delete(peerId);
    }
    while (this.verifiedPeers.size > MAX_VERIFIED_PEERS) {
      const oldest = [...this.verifiedPeers.entries()]
        .sort(([, left], [, right]) => left.lastVerifiedAt - right.lastVerifiedAt)[0];
      this.verifiedPeers.delete(oldest[0]);
    }
  }

  private cachedEndpoints(maxRecords: number): P2PEndpoint[] {
    return [...this.verifiedPeers.values()]
      .sort((left, right) => right.lastVerifiedAt - left.lastVerifiedAt)
      .slice(0, maxRecords)
      .map(({ endpoint }) => endpoint);
  }

  private toVerifiedEndpoint(peerId: string, address: string, latencyMs: number): P2PEndpoint {
    return this.endpoint({
      id: `ipfs-peer-${peerId}`,
      name: `IPFS peer ${peerId}`,
      address,
      latencyMs,
      status: "IPFS verified",
      metadata: {
        "Discovery source": "IPFS Amino DHT via Kubo",
        "Peer ID": peerId,
        Multiaddr: address,
        Transport: transportFromMultiaddr(address),
        Protocol: "IPFS Amino DHT / libp2p"
      }
    });
  }
}

function transportFromMultiaddr(address: string): string {
  if (address.includes("/quic")) return "QUIC";
  if (address.includes("/wss")) return "WebSocket Secure";
  if (address.includes("/ws")) return "WebSocket";
  if (address.includes("/tcp/")) return "TCP";
  return "libp2p";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
