import { describe, expect, test } from "bun:test";
import { XMTP_TESTNET_NODES } from "./xmtp.js";

describe("XMTP Testnet node inventory", () => {
  test("contains every officially documented operator endpoint", () => {
    expect(XMTP_TESTNET_NODES).toHaveLength(10);
    expect(XMTP_TESTNET_NODES.map((node) => node.documentedHost)).toEqual([
      "xmtp-testnet.artifact.systems",
      "xmtp.node-op.com",
      "xmtp.disobey.net",
      "lb.validator.xmtp.testnet.encapsulate.xyz",
      "grpc.ens-xmtp.com",
      "xmtp-testnet.validators.laminatedlabs.net",
      "xmtp.nextnext.id",
      "xmtpd.nodleprotocol.io",
      "grpc.testnet.xmtp.network",
      "grpc2.testnet.xmtp.network"
    ]);
  });
});
