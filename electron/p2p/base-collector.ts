import net from "node:net";
import type { P2PEndpoint, P2PNetworkCollector, P2PNetworkId } from "./types.js";

export abstract class BaseP2PCollector implements P2PNetworkCollector {
  abstract readonly networkId: P2PNetworkId;
  abstract readonly networkName: string;
  abstract collect(...args: Parameters<P2PNetworkCollector["collect"]>): Promise<P2PEndpoint[]>;

  protected endpoint(partial: Omit<P2PEndpoint, "networkId" | "network">): P2PEndpoint {
    return { ...partial, networkId: this.networkId, network: this.networkName };
  }

  protected measureTcpLatency(host: string, port: number, timeoutMs: number): Promise<number | undefined> {
    return new Promise((resolve) => {
      const started = Date.now();
      const socket = net.connect({ host, port });
      const finish = (value?: number) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(timeoutMs);
      socket.once("connect", () => finish(Date.now() - started));
      socket.once("timeout", () => finish());
      socket.once("error", () => finish());
    });
  }
}
