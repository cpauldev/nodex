import { describe, expect, test } from "bun:test";
import { resolveHostAddresses } from "./dns";

describe("P2P DNS resolution", () => {
  test("returns literal IPv4 and IPv6 addresses without DNS resolution", async () => {
    expect(await resolveHostAddresses("127.0.0.1")).toEqual(["127.0.0.1"]);
    expect(await resolveHostAddresses("::1")).toEqual(["::1"]);
  });
});
