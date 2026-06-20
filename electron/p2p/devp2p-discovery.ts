import dgram from "node:dgram";
import { randomBytes } from "node:crypto";
import { RLP } from "@ethereumjs/rlp";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";

const PACKET_HASH_BYTES = 32;
const SIGNATURE_BYTES = 65;
const PACKET_TYPE_BYTES = 1;
const PACKET_PREFIX_BYTES = PACKET_HASH_BYTES + SIGNATURE_BYTES + PACKET_TYPE_BYTES;
const PING_PACKET_TYPE = 0x01;
const PONG_PACKET_TYPE = 0x02;
const DISCOVERY_VERSION = 4;

export interface DevP2PPingResult {
  latencyMs: number;
  packetType: number;
}

export function createDiscoveryPingPacket(targetHost: string, targetPort: number, privateKey = randomBytes(32)): Buffer {
  const expiration = Math.floor(Date.now() / 1000) + 60;
  const packetData = Buffer.concat([
    Buffer.from([PING_PACKET_TYPE]),
    Buffer.from(RLP.encode([
      DISCOVERY_VERSION,
      [ipv4Bytes("0.0.0.0"), 0, 0],
      [ipv4Bytes(targetHost), targetPort, targetPort],
      expiration
    ]))
  ]);
  const packetSignatureHash = keccak256(packetData);
  const signature = secp256k1.sign(packetSignatureHash, privateKey);
  const recoverableSignature = Buffer.concat([
    Buffer.from(signature.toCompactRawBytes()),
    Buffer.from([signature.recovery])
  ]);
  const signedPayload = Buffer.concat([recoverableSignature, packetData]);
  const packetHash = keccak256(signedPayload);
  return Buffer.concat([Buffer.from(packetHash), signedPayload]);
}

export function parseDiscoveryPacketType(packet: Buffer): number | undefined {
  if (packet.length <= PACKET_PREFIX_BYTES) return undefined;
  const expectedHash = Buffer.from(keccak256(packet.subarray(PACKET_HASH_BYTES)));
  const actualHash = packet.subarray(0, PACKET_HASH_BYTES);
  if (!actualHash.equals(expectedHash)) return undefined;
  return packet[PACKET_HASH_BYTES + SIGNATURE_BYTES];
}

export function measureDiscoveryPing(host: string, port: number, timeoutMs: number): Promise<DevP2PPingResult | undefined> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const started = Date.now();
    const packet = createDiscoveryPingPacket(host, port);
    const timeout = setTimeout(() => finish(), timeoutMs);

    const finish = (result?: DevP2PPingResult) => {
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.close();
      resolve(result);
    };

    socket.once("error", () => finish());
    socket.on("message", (message) => {
      const packetType = parseDiscoveryPacketType(message);
      if (packetType === undefined) return;
      finish({ latencyMs: Date.now() - started, packetType });
    });
    socket.send(packet, port, host, (error) => {
      if (error) finish();
    });
  });
}

export function isDiscoveryPong(result: DevP2PPingResult | undefined): boolean {
  return result?.packetType === PONG_PACKET_TYPE;
}

function ipv4Bytes(host: string): Uint8Array {
  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error(`devp2p discovery only supports IPv4 bootnodes: ${host}`);
  }
  return Uint8Array.from(octets);
}
