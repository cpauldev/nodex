import { describe, expect, test } from "bun:test";
import { fixtureScan } from "./fixtures";
import { matchesRecord } from "./search";

const wifi = fixtureScan.records[0];
const bluetooth = fixtureScan.records.find((record) => record.kind === "bluetooth")!;

describe("matchesRecord", () => {
  test.each([
    ["studio", wifi],
    ["84:3a", wifi],
    ["live wi-fi scan", wifi],
    ["observed now", wifi],
    ["wpa2", wifi],
    ["802.11ax", wifi],
    ["channel", wifi],
    ["bluetooth", bluetooth],
    ["present", bluetooth],
    ["true", bluetooth]
  ])("searches all public record metadata: %s", (query, record) => {
    expect(matchesRecord(record, query, [
      record.kind === "wifi" ? "Wi-Fi" : "Bluetooth",
      record.recordClass === "observed" ? "Observed now" : "Known inventory"
    ])).toBe(true);
  });

  test("returns false for unrelated content", () => {
    expect(matchesRecord(wifi, "not-present-anywhere", [])).toBe(false);
  });
});
