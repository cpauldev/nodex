import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

export interface KuboSwarmPeer {
  peerId: string;
  address: string;
  latencyMs?: number;
}

export interface KuboRuntimeOptions {
  binaryPath?: string;
  bootstrapPeers?: readonly string[];
  repoPath?: string;
  startupTimeoutMs?: number;
}

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;

/**
 * An isolated Kubo process used for IPFS bootstrap checks and expanded crawls.
 * Its repo is temporary, its API is loopback-only, telemetry and mDNS are
 * disabled, and it never opens swarm listeners or a gateway.
 */
export class KuboRuntime {
  private readonly binaryPath: string;
  private readonly bootstrapPeers: readonly string[];
  private readonly repoPath: string;
  private readonly startupTimeoutMs: number;
  private daemon?: ChildProcessWithoutNullStreams;
  private apiAddress?: string;

  constructor(options: KuboRuntimeOptions = {}) {
    this.binaryPath = options.binaryPath ?? resolveKuboBinary();
    this.bootstrapPeers = options.bootstrapPeers ?? [];
    this.repoPath = options.repoPath ?? path.join(tmpdir(), `nodex-kubo-${randomUUID()}`);
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  }

  async start(): Promise<void> {
    await access(this.binaryPath);
    await mkdir(this.repoPath, { recursive: true });
    await this.run(["init", "--empty-repo"], this.startupTimeoutMs);
    await rm(path.join(this.repoPath, "telemetry_uuid"), { force: true });

    const port = await allocateLoopbackPort();
    this.apiAddress = `/ip4/127.0.0.1/tcp/${port}`;
    await this.run(["config", "Addresses.API", this.apiAddress], this.startupTimeoutMs);
    await this.run(["config", "Addresses.Gateway", ""], this.startupTimeoutMs);
    await this.run(["config", "--json", "Addresses.Swarm", "[]"], this.startupTimeoutMs);
    await this.run(["config", "--json", "Addresses.Announce", "[]"], this.startupTimeoutMs);
    await this.run(["config", "--json", "Addresses.AppendAnnounce", "[]"], this.startupTimeoutMs);
    await this.run(["config", "--json", "Addresses.NoAnnounce", "[]"], this.startupTimeoutMs);
    if (this.bootstrapPeers.length > 0) {
      await this.run(
        ["config", "--json", "Bootstrap", JSON.stringify(this.bootstrapPeers)],
        this.startupTimeoutMs
      );
    }
    await this.run(["config", "--json", "Discovery.MDNS.Enabled", "false"], this.startupTimeoutMs);

    this.daemon = spawn(this.binaryPath, ["daemon", "--migrate=false", "--routing=dhtclient"], {
      env: this.environment(),
      stdio: "pipe",
      windowsHide: true
    });
    const startupError = new Promise<never>((_, reject) => {
      this.daemon?.once("error", reject);
      this.daemon?.once("exit", (code) => reject(new Error(`Kubo exited during startup (${code ?? "unknown"}).`)));
    });
    await Promise.race([this.waitForReady(), startupError]);
  }

  async swarmPeers(): Promise<KuboSwarmPeer[]> {
    const stdout = await this.run(["swarm", "peers", "--enc=json"], 5_000);
    return parseKuboSwarmPeers(stdout);
  }

  async connect(address: string, timeoutMs: number): Promise<void> {
    await this.run(["swarm", "connect", address], timeoutMs);
  }

  async queryDht(peerId: string, timeoutMs: number): Promise<string[]> {
    const stdout = await this.run(["dht", "query", peerId], timeoutMs);
    return stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  }

  async stop(): Promise<void> {
    const daemon = this.daemon;
    this.daemon = undefined;
    if (daemon && !daemon.killed) {
      daemon.kill();
      await Promise.race([
        new Promise<void>((resolve) => daemon.once("exit", () => resolve())),
        delay(3_000)
      ]);
    }
    await rm(this.repoPath, { recursive: true, force: true, maxRetries: 3 });
  }

  private async waitForReady(): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        await this.run(["id", "--enc=json"], 2_000);
        return;
      } catch (error) {
        lastError = error;
        await delay(200);
      }
    }
    throw new Error(`Kubo API did not become ready: ${errorMessage(lastError)}`);
  }

  private run(args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, { env: this.environment(), windowsHide: true });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Kubo command timed out: ipfs ${args.join(" ")}`));
      }, timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(stdout);
        else reject(new Error(`Kubo command failed (${code ?? "unknown"}): ${stderr.trim() || args.join(" ")}`));
      });
    });
  }

  private environment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      IPFS_PATH: this.repoPath,
      IPFS_FD_MAX: "128",
      IPFS_TELEMETRY: "off"
    };
  }
}

export function parseKuboSwarmPeers(value: string): KuboSwarmPeer[] {
  const parsed: unknown = JSON.parse(value);
  const peers = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).Peers)
      ? (parsed as { Peers: unknown[] }).Peers
      : [];
  const seen = new Set<string>();
  return peers.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const peer = item as Record<string, unknown>;
    const peerId = typeof peer.Peer === "string" ? peer.Peer : "";
    const address = typeof peer.Addr === "string" ? peer.Addr : "";
    if (!peerId || !address || seen.has(peerId)) return [];
    seen.add(peerId);
    return [{ peerId, address, latencyMs: parseLatencyMs(peer.Latency) }];
  });
}

function parseLatencyMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value / 1_000_000);
  if (typeof value !== "string") return undefined;
  const match = value.match(/^([\d.]+)\s*(ns|µs|us|ms|s)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const multiplier = { ns: 1 / 1_000_000, "µs": 1 / 1_000, us: 1 / 1_000, ms: 1, s: 1_000 }[match[2] as "ns" | "µs" | "us" | "ms" | "s"];
  return Math.round(amount * multiplier);
}

function resolveKuboBinary(): string {
  const executable = process.platform === "win32" ? "ipfs.exe" : "ipfs";
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "kubo", "bin", executable);
    if (existsSync(packagedPath)) return packagedPath;
  }
  return path.join(process.cwd(), "node_modules", "kubo", "bin", executable);
}

async function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
