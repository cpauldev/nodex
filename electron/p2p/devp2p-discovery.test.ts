import { describe, expect, test } from "bun:test";
import { createDiscoveryPingPacket, parseDiscoveryPacketType } from "./devp2p-discovery";

describe("devp2p discovery packets", () => {
  test("creates a hash-verified discovery ping packet", () => {
    const privateKey = new Uint8Array(32).fill(1);
    const packet = createDiscoveryPingPacket("127.0.0.1", 30301, privateKey);

    expect(packet.length).toBeGreaterThan(98);
    expect(parseDiscoveryPacketType(packet)).toBe(1);
  });

  test("rejects packets with invalid hash prefix", () => {
    const privateKey = new Uint8Array(32).fill(1);
    const packet = createDiscoveryPingPacket("127.0.0.1", 30301, privateKey);
    packet[0] ^= 0xff;

    expect(parseDiscoveryPacketType(packet)).toBeUndefined();
  });
});
