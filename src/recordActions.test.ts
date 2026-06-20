import { describe, expect, test } from "bun:test";
import { fixtureScan } from "./fixtures";
import { getRecordActions } from "./recordActions";
import type { SignalRecord } from "./types";

function record(id: string): SignalRecord {
  return fixtureScan.records.find((item) => item.id === id)!;
}

describe("getRecordActions", () => {
  test("offers disconnect for connected Wi-Fi", () => {
    expect(getRecordActions(record("wifi-1")).map((action) => action.id)).toEqual(["wifi-disconnect"]);
  });

  test("requests a password for unsaved Wi-Fi", () => {
    const actions = getRecordActions(record("wifi-3"));
    expect(actions[0].id).toBe("wifi-connect");
    expect(actions[0].password).toBe(true);
  });

  test("does not offer connection for hidden Wi-Fi", () => {
    expect(getRecordActions(record("wifi-2"))).toEqual([]);
  });

  test("offers pairing controls and device state for Bluetooth", () => {
    expect(getRecordActions(record("bluetooth-1")).map((action) => action.id)).toEqual([
      "bluetooth-settings",
      "bluetooth-disable"
    ]);
  });

  test("offers reachability for neighbors", () => {
    expect(getRecordActions(record("network-1")).map((action) => action.id)).toEqual(["network-ping"]);
  });

  test("offers adapter state changes", () => {
    expect(getRecordActions(record("adapter-1")).map((action) => action.id)).toEqual(["adapter-disable"]);
  });
});
