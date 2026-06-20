import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import { isPublicIpv4 } from "../geoip.js";

const MAINNET_MAGIC = Buffer.from([0xf9, 0xbe, 0xb4, 0xd9]);
const HEADER_BYTES = 24;
const PROTOCOL_VERSION = 70_016;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_DISCOVERED_ADDRESSES = 1_000;

export interface BitcoinPeerProbe {
  latencyMs: number;
  protocolVersion: number;
  userAgent?: string;
  discoveredHosts: string[];
}

export async function probeBitcoinPeer(
  host: string,
  port: number,
  timeoutMs: number
): Promise<BitcoinPeerProbe | undefined> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const started = Date.now();
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let version: { protocolVersion: number; userAgent?: string } | undefined;
    let receivedVerack = false;
    let handshakeLatencyMs: number | undefined;
    let settled = false;
    let discoveryTimer: ReturnType<typeof setTimeout> | undefined;
    const deadlineTimer = setTimeout(() => finish(), timeoutMs);

    const finish = (result?: BitcoinPeerProbe) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      clearTimeout(discoveryTimer);
      socket.destroy();
      resolve(result);
    };

    const finishVerified = (discoveredHosts: string[] = []) => {
      if (!version || !receivedVerack) return;
      finish({
        latencyMs: handshakeLatencyMs ?? Date.now() - started,
        protocolVersion: version.protocolVersion,
        userAgent: version.userAgent,
        discoveredHosts
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.write(encodeMessage("version", encodeVersionPayload()));
    });
    socket.once("timeout", () => finish());
    socket.once("error", () => finish());
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const parsed = parseMessages(buffer);
        buffer = parsed.remaining;
        for (const message of parsed.messages) {
          if (message.command === "version") {
            version = parseVersionPayload(message.payload);
            socket.write(encodeMessage("verack"));
          } else if (message.command === "verack") {
            receivedVerack = true;
          } else if (message.command === "ping") {
            socket.write(encodeMessage("pong", message.payload));
          } else if (message.command === "addr") {
            finishVerified(parseAddrPayload(message.payload));
            return;
          }
        }

        if (version && receivedVerack && !discoveryTimer) {
          handshakeLatencyMs = Date.now() - started;
          socket.write(encodeMessage("getaddr"));
          discoveryTimer = setTimeout(() => finishVerified(), Math.min(750, timeoutMs));
        }
      } catch {
        finish();
      }
    });
  });
}

export function encodeMessage(command: string, payload: Uint8Array = new Uint8Array()): Buffer {
  const payloadBuffer = Buffer.from(payload);
  const header = Buffer.alloc(HEADER_BYTES);
  MAINNET_MAGIC.copy(header, 0);
  header.write(command, 4, 12, "ascii");
  header.writeUInt32LE(payloadBuffer.length, 16);
  doubleSha256(payloadBuffer).copy(header, 20, 0, 4);
  return Buffer.concat([header, payloadBuffer]);
}

export function parseMessages(buffer: Buffer<ArrayBufferLike>): {
  messages: Array<{ command: string; payload: Buffer }>;
  remaining: Buffer<ArrayBufferLike>;
} {
  const messages: Array<{ command: string; payload: Buffer }> = [];
  let offset = 0;

  while (buffer.length - offset >= HEADER_BYTES) {
    if (!buffer.subarray(offset, offset + 4).equals(MAINNET_MAGIC)) {
      throw new Error("Invalid Bitcoin mainnet message magic.");
    }
    const payloadLength = buffer.readUInt32LE(offset + 16);
    if (payloadLength > MAX_PAYLOAD_BYTES) throw new Error("Bitcoin message payload is too large.");
    const messageLength = HEADER_BYTES + payloadLength;
    if (buffer.length - offset < messageLength) break;

    const payload = buffer.subarray(offset + HEADER_BYTES, offset + messageLength);
    const checksum = buffer.subarray(offset + 20, offset + 24);
    if (!doubleSha256(payload).subarray(0, 4).equals(checksum)) {
      throw new Error("Invalid Bitcoin message checksum.");
    }
    const command = buffer.subarray(offset + 4, offset + 16)
      .toString("ascii")
      .replace(/\0+$/, "");
    messages.push({ command, payload });
    offset += messageLength;
  }

  return { messages, remaining: buffer.subarray(offset) };
}

export function parseAddrPayload(payload: Buffer): string[] {
  const { value: count, bytes } = readCompactSize(payload, 0);
  const hosts: string[] = [];
  let offset = bytes;

  for (let index = 0; index < Math.min(count, MAX_DISCOVERED_ADDRESSES); index++) {
    if (payload.length - offset < 30) break;
    const ip = payload.subarray(offset + 12, offset + 28);
    const host = decodeIpv4MappedAddress(ip);
    if (host && isPublicIpv4(host)) hosts.push(host);
    offset += 30;
  }
  return [...new Set(hosts)];
}

function encodeVersionPayload(): Buffer {
  const userAgent = Buffer.from("/nodex:0.1.0/", "utf8");
  const payload = Buffer.alloc(86 + userAgent.length);
  let offset = 0;
  payload.writeInt32LE(PROTOCOL_VERSION, offset);
  offset += 4;
  payload.writeBigUInt64LE(0n, offset);
  offset += 8;
  payload.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1_000)), offset);
  offset += 8;
  offset = writeNetworkAddress(payload, offset);
  offset = writeNetworkAddress(payload, offset);
  randomBytes(8).copy(payload, offset);
  offset += 8;
  payload[offset++] = userAgent.length;
  userAgent.copy(payload, offset);
  offset += userAgent.length;
  payload.writeInt32LE(0, offset);
  offset += 4;
  payload[offset] = 0;
  return payload;
}

function writeNetworkAddress(buffer: Buffer, offset: number): number {
  buffer.writeBigUInt64LE(0n, offset);
  offset += 8;
  Buffer.from("00000000000000000000ffff00000000", "hex").copy(buffer, offset);
  offset += 16;
  buffer.writeUInt16BE(8333, offset);
  return offset + 2;
}

function parseVersionPayload(payload: Buffer): { protocolVersion: number; userAgent?: string } {
  if (payload.length < 80) throw new Error("Bitcoin version message is truncated.");
  const protocolVersion = payload.readInt32LE(0);
  if (protocolVersion < 70_001) throw new Error("Unsupported Bitcoin protocol version.");
  const userAgentLength = readCompactSize(payload, 80);
  const start = 80 + userAgentLength.bytes;
  const end = start + userAgentLength.value;
  if (end > payload.length) throw new Error("Bitcoin version user agent is truncated.");
  return {
    protocolVersion,
    userAgent: payload.subarray(start, end).toString("utf8") || undefined
  };
}

function readCompactSize(buffer: Buffer, offset: number): { value: number; bytes: number } {
  if (offset >= buffer.length) throw new Error("CompactSize value is missing.");
  const prefix = buffer[offset];
  if (prefix < 0xfd) return { value: prefix, bytes: 1 };
  if (prefix === 0xfd) return { value: buffer.readUInt16LE(offset + 1), bytes: 3 };
  if (prefix === 0xfe) return { value: buffer.readUInt32LE(offset + 1), bytes: 5 };
  const value = buffer.readBigUInt64LE(offset + 1);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CompactSize value is too large.");
  return { value: Number(value), bytes: 9 };
}

function decodeIpv4MappedAddress(value: Buffer): string | undefined {
  if (!value.subarray(0, 12).equals(Buffer.from("00000000000000000000ffff", "hex"))) return undefined;
  return [...value.subarray(12)].join(".");
}

function doubleSha256(value: Buffer): Buffer {
  const first = createHash("sha256").update(value).digest();
  return createHash("sha256").update(first).digest();
}
