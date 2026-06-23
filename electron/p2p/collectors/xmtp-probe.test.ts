import { describe, expect, test } from "bun:test";
import { decodeGrpcHealth, decodeXmtpVersion } from "./xmtp.js";

describe("XMTP probe decoding", () => {
  test("detects the documented testnet version payload", () => {
    expect(decodeXmtpVersion("00000000130a11312e332e302d35392d67346332303266628000000010677270632d7374617475733a20300d0a0a"))
      .toBe("1.3.0-59-g4c202f");
  });

  test("treats a non-empty health payload as serving", () => {
    expect(decodeGrpcHealth("000000000208018000000010677270632d7374617475733a20300d0a0a"))
      .toBe("serving");
  });

  test("falls back to unknown for unrecognized payloads", () => {
    expect(decodeXmtpVersion("0a")).toBe("unknown");
    expect(decodeGrpcHealth("")).toBe("unknown");
  });
});
