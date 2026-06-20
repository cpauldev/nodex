import { describe, expect, test } from "bun:test";
import { findPublicIp, isPublicIpv4 } from "./geoip";
import type { SignalRecord } from "./types";

function record(overrides: Partial<SignalRecord>): SignalRecord {
  return {
    id: "record",
    kind: "p2p",
    recordClass: "p2p-network",
    provenance: "Test",
    name: "Test record",
    status: "Reachable",
    details: {},
    ...overrides
  };
}

describe("geoip helpers", () => {
  test("rejects private and reserved IPv4 addresses", () => {
    expect(isPublicIpv4("192.168.1.1")).toBe(false);
    expect(isPublicIpv4("10.0.0.1")).toBe(false);
    expect(isPublicIpv4("172.16.0.1")).toBe(false);
    expect(isPublicIpv4("127.0.0.1")).toBe(false);
    expect(isPublicIpv4("203.0.113.10")).toBe(false);
  });

  test("extracts public IPs from address and metadata", () => {
    expect(findPublicIp(record({ address: "3.231.138.188:30301" }))).toBe("3.231.138.188");
    expect(findPublicIp(record({ address: "seed.example", details: { "Reachable address": "86.15.80.13" } }))).toBe("86.15.80.13");
  });

  test("ignores local-only records", () => {
    expect(findPublicIp(record({ address: "a8:5e:45:09:77:20", details: { "IP address": "192.168.1.1" } }))).toBeUndefined();
  });
});
