import { expect, test } from "bun:test";
import { parseKuboSwarmPeers } from "./kubo-runtime";

test("parses unique Kubo swarm peers and normalizes latency", () => {
  expect(parseKuboSwarmPeers(JSON.stringify({ Peers: [
    { Peer: "12D3KooWpeer", Addr: "/ip4/203.0.113.9/tcp/4001", Latency: "12.4ms" },
    { Peer: "12D3KooWsecond", Addr: "/ip4/203.0.113.10/udp/4001/quic-v1", Latency: "2500000ns" },
    { Peer: "12D3KooWpeer", Addr: "/ip4/203.0.113.11/tcp/4001", Latency: "4ms" },
    { Peer: "", Addr: "/ip4/203.0.113.12/tcp/4001" }
  ] }))).toEqual([
    { peerId: "12D3KooWpeer", address: "/ip4/203.0.113.9/tcp/4001", latencyMs: 12 },
    { peerId: "12D3KooWsecond", address: "/ip4/203.0.113.10/udp/4001/quic-v1", latencyMs: 3 }
  ]);
});
