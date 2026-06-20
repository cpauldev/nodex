import { expect, test } from "bun:test";
import { reuseUnchangedRecords } from "./recordIdentity";
import type { SignalRecord } from "./types";

const record = (id: string, status = "Connected"): SignalRecord => ({
  id, kind: "p2p", recordClass: "p2p-network", provenance: "IPFS", name: id, status, details: {}
});

test("reuseUnchangedRecords preserves only unchanged record identities", () => {
  const first = record("first");
  const second = record("second");
  const next = reuseUnchangedRecords([first, second], [record("first"), record("second", "Timed out")]);
  expect(next[0]).toBe(first);
  expect(next[1]).not.toBe(second);
});
