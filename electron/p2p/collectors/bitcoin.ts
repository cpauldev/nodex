import { BaseP2PCollector } from "../base-collector.js";
import { probeBitcoinPeer, type BitcoinPeerProbe } from "../bitcoin-wire.js";
import { resolveHostAddresses } from "../dns.js";
import type { NetworkSettings, P2PCollectionConfig, P2PEndpoint } from "../types.js";

export const BITCOIN_MAINNET_DNS_SEEDS = [
  "seed.bitcoin.sipa.be",
  "dnsseed.bluematt.me",
  "seed.bitcoin.jonasschnelli.ch",
  "seed.btc.petertodd.net",
  "seed.bitcoin.sprovoost.nl",
  "dnsseed.emzy.de",
  "seed.bitcoin.wiz.biz",
  "seed.mainnet.achownodes.xyz"
] as const;
const EXPANDED_SCAN_CONCURRENCY = 10;
const MAX_CRAWL_DURATION_MS = 25_000;
const MAX_CANDIDATE_INVENTORY = 1_000;
const MAX_VERIFIED_INVENTORY = 500;
const MAX_FAILURES = 3;
const VERIFIED_PEER_TTL_MS = 24 * 60 * 60 * 1_000;

interface CandidatePeer {
  failures: number;
  lastAttemptedAt?: number;
  source: string;
}

interface VerifiedPeer {
  endpoint: P2PEndpoint;
  failures: number;
  lastVerifiedAt: number;
}

export class BitcoinCollector extends BaseP2PCollector {
  readonly networkId = "bitcoin" as const;
  readonly networkName = "Bitcoin Mainnet";
  private readonly candidates = new Map<string, CandidatePeer>();
  private readonly verifiedPeers = new Map<string, VerifiedPeer>();

  async collect(
    settings: NetworkSettings,
    options: Pick<P2PCollectionConfig, "maxRecordsPerNetwork" | "connectionTimeoutMs">,
    onEndpoint?: (endpoint: P2PEndpoint) => void
  ): Promise<P2PEndpoint[]> {
    const resolved = await Promise.all(BITCOIN_MAINNET_DNS_SEEDS.map(async (seed) => {
      const addresses = await resolveHostAddresses(seed);
      return addresses.map((host) => ({ host, seed }));
    }));
    if (settings.scope === "known") {
      return Promise.all(resolved.map(async (entries, index) => {
        const seed = BITCOIN_MAINNET_DNS_SEEDS[index];
        const verified = await this.findVerifiedAddress(
          entries.map((entry) => entry.host),
          options.connectionTimeoutMs
        );
        const endpoint = this.endpoint({
          id: `bitcoin-seed-${seed}`,
          name: seed,
          address: seed,
          latencyMs: verified?.probe.latencyMs,
          status: entries.length === 0
            ? "DNS unavailable"
            : verified ? "Bitcoin verified" : "No verified peer",
          metadata: {
            "Discovery source": "Bitcoin Core DNS seed",
            "Resolved addresses": entries.length,
            "Probed addresses": Math.min(entries.length, 5),
            "Verified address": verified?.host ?? null,
            "Protocol version": verified?.probe.protocolVersion ?? null,
            "User agent": verified?.probe.userAgent ?? null,
            Port: 8333
          }
        });
        onEndpoint?.(endpoint);
        return endpoint;
      }));
    }

    for (const { host, seed } of resolved.flat()) this.addCandidate(host, `DNS seed: ${seed}`);
    return this.refreshRollingInventory(options, onEndpoint);
  }

  private async findVerifiedAddress(
    addresses: string[],
    timeoutMs: number
  ): Promise<{ host: string; probe: BitcoinPeerProbe } | undefined> {
    for (const host of addresses.slice(0, 5)) {
      const probe = await probeBitcoinPeer(host, 8333, timeoutMs);
      if (probe) return { host, probe };
    }
    return undefined;
  }

  private async refreshRollingInventory(
    options: Pick<P2PCollectionConfig, "maxRecordsPerNetwork" | "connectionTimeoutMs">,
    onEndpoint?: (endpoint: P2PEndpoint) => void
  ): Promise<P2PEndpoint[]> {
    this.pruneInventory();
    const queue = [...this.candidates.entries()]
      .sort(([, left], [, right]) => (left.lastAttemptedAt ?? 0) - (right.lastAttemptedAt ?? 0))
      .slice(0, options.maxRecordsPerNetwork);
    let nextIndex = 0;
    const deadline = Date.now() + MAX_CRAWL_DURATION_MS;

    const worker = async () => {
      while (
        nextIndex < queue.length &&
        Date.now() < deadline
      ) {
        const [host, candidate] = queue[nextIndex++];
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) break;
        candidate.lastAttemptedAt = Date.now();
        const probe = await probeBitcoinPeer(
          host,
          8333,
          Math.min(options.connectionTimeoutMs, remainingMs)
        );
        if (!probe) {
          this.recordFailure(host, candidate);
          continue;
        }

        const endpoint = this.endpoint({
          id: `bitcoin-peer-${host}`,
          name: `Bitcoin peer ${host}`,
          address: host.includes(":") ? `[${host}]:8333` : `${host}:8333`,
          latencyMs: probe.latencyMs,
          status: "Bitcoin verified",
          metadata: {
            "Discovery source": candidate.source,
            Protocol: "Bitcoin P2P",
            "Protocol version": probe.protocolVersion,
            "User agent": probe.userAgent ?? null,
            "Advertised peers": probe.discoveredHosts.length,
            Port: 8333
          }
        });
        candidate.failures = 0;
        this.verifiedPeers.set(host, { endpoint, failures: 0, lastVerifiedAt: Date.now() });
        onEndpoint?.(endpoint);

        for (const discoveredHost of probe.discoveredHosts) {
          this.addCandidate(discoveredHost, `Peer ${host}`);
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(EXPANDED_SCAN_CONCURRENCY, queue.length) },
        () => worker()
      )
    );
    return [...this.verifiedPeers.values()]
      .sort((left, right) => right.lastVerifiedAt - left.lastVerifiedAt)
      .map(({ endpoint }) => endpoint);
  }

  private addCandidate(host: string, source: string) {
    const existing = this.candidates.get(host);
    if (existing) return;
    if (this.candidates.size >= MAX_CANDIDATE_INVENTORY) return;
    this.candidates.set(host, { failures: 0, source });
  }

  private recordFailure(host: string, candidate: CandidatePeer) {
    candidate.failures += 1;
    const verified = this.verifiedPeers.get(host);
    if (!verified) return;
    verified.failures += 1;
    if (verified.failures >= MAX_FAILURES) this.verifiedPeers.delete(host);
  }

  private pruneInventory() {
    const expiresAt = Date.now() - VERIFIED_PEER_TTL_MS;
    for (const [host, peer] of this.verifiedPeers) {
      if (peer.lastVerifiedAt < expiresAt) this.verifiedPeers.delete(host);
    }
    while (this.verifiedPeers.size > MAX_VERIFIED_INVENTORY) {
      const oldest = [...this.verifiedPeers.entries()]
        .sort(([, left], [, right]) => left.lastVerifiedAt - right.lastVerifiedAt)[0];
      this.verifiedPeers.delete(oldest[0]);
    }
  }
}
