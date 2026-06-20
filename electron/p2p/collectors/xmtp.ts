import { BaseP2PCollector } from "../base-collector.js";
import { resolveHostAddresses } from "../dns.js";
import type { NetworkSettings, P2PCollectionConfig, P2PEndpoint } from "../types.js";

export const XMTP_TESTNET_NODES = [
  { operator: "Artifact Capital", documentedHost: "xmtp-testnet.artifact.systems" },
  { operator: "Crystal One", documentedHost: "xmtp.node-op.com" },
  { operator: "Emerald Onion", documentedHost: "xmtp.disobey.net" },
  { operator: "Encapsulate", documentedHost: "lb.validator.xmtp.testnet.encapsulate.xyz" },
  { operator: "Ethereum Name Service (ENS)", documentedHost: "grpc.ens-xmtp.com" },
  { operator: "Laminated Labs", documentedHost: "xmtp-testnet.validators.laminatedlabs.net" },
  { operator: "Next.id", documentedHost: "xmtp.nextnext.id" },
  { operator: "Nodle", documentedHost: "xmtpd.nodleprotocol.io" },
  { operator: "XMTP Labs", documentedHost: "grpc.testnet.xmtp.network" },
  { operator: "XMTP Labs", documentedHost: "grpc2.testnet.xmtp.network" }
] as const;

export class XMTPCollector extends BaseP2PCollector {
  readonly networkId = "xmtp" as const;
  readonly networkName = "XMTP Testnet";

  async collect(
    _settings: NetworkSettings,
    options: Pick<P2PCollectionConfig, "maxRecordsPerNetwork" | "connectionTimeoutMs">,
    onEndpoint?: (endpoint: P2PEndpoint) => void
  ): Promise<P2PEndpoint[]> {
    return Promise.all(
      XMTP_TESTNET_NODES.slice(0, options.maxRecordsPerNetwork).map(async (node, index) => {
        const addresses = await resolveHostAddresses(node.documentedHost);
        const latencyMs = addresses.length > 0
          ? await this.measureTcpLatency(addresses[0], 443, options.connectionTimeoutMs)
          : undefined;
        const status = addresses.length === 0
          ? "DNS unavailable"
          : latencyMs === undefined ? "Unreachable" : "Reachable";

        const endpoint = this.endpoint({
          id: `xmtp-testnet-${index + 1}-${node.documentedHost}`,
          name: node.operator,
          address: `${node.documentedHost}:443`,
          latencyMs,
          status,
          metadata: {
            "Discovery source": "Official XMTP Testnet node list",
            Operator: node.operator,
            Environment: "Decentralized Testnet",
            Protocol: "gRPC over TLS",
            "Node number": index + 1,
            "Documented address": `${node.documentedHost}:443`,
            "Probed hostname": node.documentedHost,
            "DNS addresses": addresses.length > 0 ? addresses.join(", ") : null,
            "Probed address": addresses[0] ?? null
          }
        });
        onEndpoint?.(endpoint);
        return endpoint;
      })
    );
  }
}
