import { describe, expect, test } from "bun:test";
import { collectorForRecord, getSecondaryLabel, latencyTone, projectGeoPoint, signalTone } from "./presentation";
import type { SignalRecord } from "./types";

const record = (values: Partial<SignalRecord>): SignalRecord => ({
  id: "id", kind: "network", recordClass: "neighbor", name: "Example", provenance: "Windows", details: {}, ...values
});

describe("presentation helpers", () => {
  test("maps records to collectors", () => {
    expect(collectorForRecord(record({ kind: "wifi" }))).toBe("wifi");
    expect(collectorForRecord(record({ kind: "p2p", provenance: "Bitcoin Mainnet" }))).toBe("p2p-bitcoin");
  });

  test("builds concise secondary labels", () => {
    expect(getSecondaryLabel(record({ kind: "p2p", provenance: "Ethereum Mainnet" }))).toBe("Ethereum");
    expect(getSecondaryLabel(record({ kind: "wifi", status: "Connected" }))).toBe("Connected");
  });

  test("maps signal and latency to semantic tones", () => {
    expect(signalTone(80)).toBe("success");
    expect(signalTone(50)).toBe("warning");
    expect(latencyTone(300)).toBe("danger");
    expect(latencyTone(undefined)).toBe("neutral");
  });

  test("projects coordinates into map bounds", () => {
    expect(projectGeoPoint(0, 0)).toEqual({ x: 50, y: 50 });
  });
});
