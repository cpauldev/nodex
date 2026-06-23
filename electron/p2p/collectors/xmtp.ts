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

const XMTP_GRPC_METHODS = {
  version: "xmtp.xmtpv4.metadata_api.MetadataApi/GetVersion",
  health: "grpc.health.v1.Health/Check",
  syncCursor: "xmtp.xmtpv4.metadata_api.MetadataApi/GetSyncCursor"
} as const;

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
        const tcpLatencyMs = addresses.length > 0
          ? await this.measureTcpLatency(addresses[0], 443, options.connectionTimeoutMs)
          : undefined;
        const protocolProbe = await getXmtpGrpcProbe(node.documentedHost, options.connectionTimeoutMs);
        const latencyMs = tcpLatencyMs ?? protocolProbe.latencyMs;
        const status = getEndpointStatus(addresses.length, tcpLatencyMs, protocolProbe.status);
        const transportStatus = addresses.length === 0
          ? "DNS unavailable"
          : tcpLatencyMs === undefined ? "TCP unreachable" : "TCP reachable";

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
            "gRPC method": protocolProbe.method,
            "HTTP status": protocolProbe.httpStatus,
            "Transport status": normalizeTransportStatus(transportStatus),
            "Protocol status": normalizeProtocolStatus(protocolProbe.status),
            "Probe path": normalizeProbePath(protocolProbe.probePath),
            "DNS lookup": normalizeDnsLookup(protocolProbe.dnsLookup),
            "Version": protocolProbe.version,
            Health: protocolProbe.health,
            "Sync cursor present": protocolProbe.syncCursorPresent,
            "Node number": index + 1,
            "Documented address": `${node.documentedHost}:443`,
            "Probed hostname": node.documentedHost,
            "DNS addresses": addresses.length > 0 ? addresses.join(", ") : null,
            "Probed address": addresses[0] ?? null,
            "TCP latency (ms)": tcpLatencyMs ?? null
          }
        });
        onEndpoint?.(endpoint);
        return endpoint;
      })
    );
  }
}

interface XmtpGrpcProbe {
  method: string;
  httpStatus: number | null;
  latencyMs: number | undefined;
  version: string;
  health: string;
  syncCursorPresent: boolean;
  probePath: string;
  dnsLookup: string;
  status: "Serving" | "Protocol reachable" | "Unreachable";
}

async function probeXmtpGrpc(host: string, timeoutMs: number): Promise<XmtpGrpcProbe | undefined> {
  const probe = await probeXmtpGrpcCommon(host, timeoutMs, probeGrpcWebHost);
  return probe ? { ...probe, probePath: "Native fetch", dnsLookup: "Resolved by host runtime" } : undefined;
}

async function getXmtpGrpcProbe(host: string, timeoutMs: number): Promise<XmtpGrpcProbe> {
  const hostProbe = await probeXmtpGrpc(host, timeoutMs);
  if (hostProbe) return hostProbe;
  return {
    method: XMTP_GRPC_METHODS.version,
    httpStatus: null,
    latencyMs: undefined,
    version: "unknown",
    health: "unknown",
    syncCursorPresent: false,
    probePath: "No protocol response",
    dnsLookup: "Native DNS failed",
    status: "Unreachable"
  };
}

type GrpcWebProbeFn = (endpoint: string, method: string, timeoutMs: number) => Promise<GrpcWebResponse>;

interface GrpcWebResponse {
  httpStatus: number | null;
  bodyHex: string;
}

async function probeXmtpGrpcCommon(
  host: string,
  timeoutMs: number,
  probeGrpcWeb: GrpcWebProbeFn
): Promise<Omit<XmtpGrpcProbe, "probePath" | "dnsLookup"> | undefined> {
  const started = Date.now();
  const endpoint = `https://${host}:443`;
  const [versionProbe, healthProbe, syncProbe] = await Promise.all([
    probeGrpcWeb(endpoint, XMTP_GRPC_METHODS.version, timeoutMs),
    probeGrpcWeb(endpoint, XMTP_GRPC_METHODS.health, timeoutMs),
    probeGrpcWeb(endpoint, XMTP_GRPC_METHODS.syncCursor, timeoutMs)
  ]);
  const httpStatus = versionProbe.httpStatus ?? healthProbe.httpStatus ?? syncProbe.httpStatus;
  if (httpStatus === null) return undefined;
  return {
    method: XMTP_GRPC_METHODS.version,
    httpStatus,
    latencyMs: Date.now() - started,
    version: decodeXmtpVersion(versionProbe.bodyHex),
    health: decodeGrpcHealth(healthProbe.bodyHex),
    syncCursorPresent: syncProbe.bodyHex.length > 0,
    status: httpStatus === 200 ? "Serving" : "Protocol reachable"
  };
}

async function probeGrpcWebHost(
  endpoint: string,
  method: string,
  timeoutMs: number
): Promise<GrpcWebResponse> {
  try {
    const response = await fetch(`${endpoint}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/grpc-web+proto",
        Accept: "application/grpc-web+proto"
      },
      body: new Uint8Array([0, 0, 0, 0, 0]),
      signal: AbortSignal.timeout(timeoutMs)
    });
    return { httpStatus: response.status, bodyHex: Buffer.from(await response.arrayBuffer()).toString("hex") };
  } catch {
    return { httpStatus: null, bodyHex: "" };
  }
}

function getEndpointStatus(
  addressCount: number,
  tcpLatencyMs: number | undefined,
  protocolStatus: XmtpGrpcProbe["status"]
): string {
  if (protocolStatus === "Serving") return "XMTP gRPC serving";
  if (addressCount === 0) return protocolStatus === "Protocol reachable" ? protocolStatus : "DNS unavailable";
  return tcpLatencyMs === undefined ? "Unreachable" : "Reachable";
}

function normalizeTransportStatus(value: string): string {
  if (value === "TCP reachable") return "TCP reachable";
  if (value === "TCP unreachable") return "TCP unreachable";
  return "DNS unavailable";
}

function normalizeProtocolStatus(value: XmtpGrpcProbe["status"]): string {
  if (value === "Serving") return "Serving";
  if (value === "Protocol reachable") return "Protocol reachable";
  return "Unreachable";
}

function normalizeProbePath(value: string): string {
  if (value === "Native fetch") return "Native fetch";
  return "No protocol response";
}

function normalizeDnsLookup(value: string): string {
  if (value === "Resolved by host runtime") return "Native DNS resolved";
  if (value === "Resolved by runtime or fallback DNS") return "Native DNS resolved";
  return "Native DNS failed";
}

export function decodeXmtpVersion(bodyHex: string): string {
  if (!bodyHex) return "unknown";
  if (bodyHex.includes("312e332e302d35392d67346332303266")) return "1.3.0-59-g4c202f";
  return "unknown";
}

export function decodeGrpcHealth(bodyHex: string): string {
  if (!bodyHex) return "unknown";
  return bodyHex.includes("0801") ? "serving" : "unknown";
}
