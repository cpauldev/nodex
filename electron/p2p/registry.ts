import type { P2PNetworkCollector, P2PNetworkId } from "./types.js";
import { XMTPCollector } from "./collectors/xmtp.js";
import { EthereumCollector } from "./collectors/ethereum.js";
import { IPFSCollector } from "./collectors/ipfs.js";
import { BitcoinCollector } from "./collectors/bitcoin.js";
import { BaseNetworkCollector } from "./collectors/base.js";

const collectors: P2PNetworkCollector[] = [
  new XMTPCollector(),
  new EthereumCollector(),
  new IPFSCollector(),
  new BitcoinCollector(),
  new BaseNetworkCollector()
];

export const p2pRegistry = new Map<P2PNetworkId, P2PNetworkCollector>(
  collectors.map((collector) => [collector.networkId, collector])
);
