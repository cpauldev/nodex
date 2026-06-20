import { describe, expect, test } from "bun:test";
import { encodeMessage, parseAddrPayload, parseMessages } from "./bitcoin-wire";

describe("Bitcoin wire messages", () => {
  test("encodes and parses checksum-verified messages", () => {
    const encoded = encodeMessage("ping", Buffer.from("01020304", "hex"));
    const parsed = parseMessages(encoded);

    expect(parsed.remaining).toHaveLength(0);
    expect(parsed.messages).toEqual([{
      command: "ping",
      payload: Buffer.from("01020304", "hex")
    }]);
  });

  test("extracts public IPv4 addresses from addr messages", () => {
    const payload = Buffer.alloc(61);
    payload[0] = 2;
    writeAddr(payload, 1, [8, 8, 8, 8]);
    writeAddr(payload, 31, [192, 168, 1, 1]);

    expect(parseAddrPayload(payload)).toEqual(["8.8.8.8"]);
  });
});

function writeAddr(buffer: Buffer, offset: number, octets: number[]) {
  buffer.writeUInt32LE(0, offset);
  buffer.writeBigUInt64LE(1n, offset + 4);
  Buffer.from("00000000000000000000ffff", "hex").copy(buffer, offset + 12);
  Buffer.from(octets).copy(buffer, offset + 24);
  buffer.writeUInt16BE(8333, offset + 28);
}
