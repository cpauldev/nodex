import { describe, expect, test } from "bun:test";
import { buildMetadataSections } from "./detailPresentation";
import type { SignalRecord } from "./types";

describe("buildMetadataSections", () => {
  test("removes duplicate and hidden values", () => {
    const record: SignalRecord = {
      id: "one", kind: "wifi", recordClass: "observed", name: "Network", provenance: "Windows",
      address: "aa:bb", strength: 77, security: "WPA2", details: { Name: "Network", Channel: 6, channel: 11 }
    };
    const sections = buildMetadataSections(record);
    expect(sections[0].rows).toContainEqual(["Signal strength", "77%"]);
    expect(sections.flatMap((section) => section.rows).filter(([label]) => label.toLowerCase() === "channel")).toHaveLength(1);
    expect(sections.flatMap((section) => section.rows).some(([label]) => label.toLowerCase() === "name")).toBe(false);
  });
});
