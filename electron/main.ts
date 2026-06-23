process.env.UV_THREADPOOL_SIZE = "64";
import { app, BrowserWindow, ipcMain, nativeTheme, protocol } from "electron";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performRecordAction } from "./actions.js";
import {
  collectAdapters,
  collectBluetooth,
  collectNetwork,
  collectWifi,
  collectRadio,
  isRadioDirectoryLimit,
  type RadioDirectoryLimit
} from "./collectors.js";
import type {
  RecordActionInput,
  RadioFilters,
  ScanCollectorId,
  ScanProgress,
  ScanResult,
  SignalRecord
} from "./types.js";
import {
  collectP2PNetwork,
  isCollectionScope,
  isP2PNetworkId,
  p2pSettings,
  type P2PNetworkId
} from "./p2p/index.js";
import { enrichGeoLocations } from "./geoip.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const hasLock = app.requestSingleInstanceLock();
let mainWindow: BrowserWindow | null = null;
let devBridgeServer: ReturnType<typeof createServer> | null = null;
const DEV_BRIDGE_PORT = 5174;
const devBridgeClients = new Set<ServerResponse>();


let radioDirectoryLimit: RadioDirectoryLimit = 100;
let radioDirectoryPage = 1;
let radioDirectoryTotal = 50000;
let radioFilters: RadioFilters = { tag: "", countrycode: "", codec: "", bitrateMin: "", hidebroken: false };
const p2pCollectorLabels: Record<P2PNetworkId, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  base: "Base",
  ipfs: "IPFS",
  xmtp: "XMTP"
};
const STREAM_RESPONSE_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified"
] as const;

if (!hasLock) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  { scheme: "nodex-stream", privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
]);

const collectors: ReadonlyArray<{
  id: ScanCollectorId;
  label: string;
  collect: (onPartial: (records: SignalRecord[]) => void) => Promise<SignalRecord[]>;
}> = [
  { id: "radio", label: "Radio", collect: (onPartial) => collectRadio(radioDirectoryLimit, (radioDirectoryPage - 1) * radioDirectoryLimit, radioFilters, (record) => onPartial([record])) },
  { id: "wifi", label: "Wi-Fi", collect: () => collectWifi() },
  { id: "bluetooth", label: "Bluetooth", collect: () => collectBluetooth() },
  { id: "network", label: "Network", collect: () => collectNetwork() },
  { id: "adapters", label: "Adapters", collect: () => collectAdapters() },
  ...Object.entries(p2pCollectorLabels).map(([networkId, label]) => ({
    id: `p2p-${networkId}` as ScanCollectorId,
    label,
    collect: (onPartial: (records: SignalRecord[]) => void) => collectP2PNetwork(
      networkId as P2PNetworkId,
      p2pSettings.getCollectionConfig(),
      (record) => onPartial(enrichGeoLocations([record]))
    )
  }))
];

async function refreshRadioDirectoryTotal(): Promise<void> {
  try {
    const response = await fetch("https://all.api.radio-browser.info/json/stats", { signal: AbortSignal.timeout(10_000) });
    const stats = await response.json() as { stations?: unknown };
    if (typeof stats.stations === "number") radioDirectoryTotal = stats.stations;
  } catch {
    // Keep the last known total when the directory statistics endpoint is unavailable.
  }
}

async function scan(targetCollectorIds?: ScanCollectorId[], onProgress?: (progress: ScanProgress) => void): Promise<ScanResult> {
  const started = Date.now();
  const warnings: string[] = [];

  const targetCollectors = targetCollectorIds
    ? collectors.filter((c) => targetCollectorIds.includes(c.id))
    : collectors;

  const groups = await Promise.all(
    targetCollectors.map(async ({ id, label, collect }) => {
      try {
        const records = enrichGeoLocations(await collect((partialRecords) => {
          onProgress?.({ collectorId: id, phase: "partial", records: enrichGeoLocations(partialRecords) });
        }));
        if (id === "radio") await refreshRadioDirectoryTotal();
        onProgress?.({ collectorId: id, phase: "complete", records });
        return records;
      } catch (error) {
        const warning = `${label}: ${error instanceof Error ? error.message : String(error)}`;
        warnings.push(warning);
        onProgress?.({ collectorId: id, phase: "complete", records: [], warning });
        return [] as SignalRecord[];
      }
    })
  );

  return {
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    records: groups.flat(),
    warnings
  };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 850,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: "#10131a",
    icon: path.join(dirname, "../build/icon.ico"),
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "rgba(0, 0, 0, 0)", // Transparent background
      symbolColor: "#e3e9f5",
      height: 42
    },
    webPreferences: {
      preload: path.join(dirname, "../electron/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });
  mainWindow = window;

  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`Renderer failed to load ${url}: ${code} ${description}`);
  });
  if (!app.isPackaged) {
    void window.loadURL("http://localhost:5173");
    if (process.argv.includes("--devtools")) {
      window.webContents.openDevTools();
    }
  } else {
    void window.loadFile(path.join(dirname, "../dist/index.html"));
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(body));
}

function sendJsonLine(response: ServerResponse, body: unknown) {
  response.write(`${JSON.stringify(body)}\n`);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : null;
}

function startDevBridge() {
  if (app.isPackaged || devBridgeServer) return;

  devBridgeServer = createServer(async (request, response) => {
    if (!request.url) {
      sendJson(response, 400, { error: "Missing URL." });
      return;
    }

    if (request.method === "OPTIONS") {
      sendJson(response, 204, null);
      return;
    }

    const url = new URL(request.url, `http://127.0.0.1:${DEV_BRIDGE_PORT}`);

    try {
      if (request.method === "GET" && url.pathname === "/events") {
        response.writeHead(200, {
          "Access-Control-Allow-Origin": "http://localhost:5173",
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });
        devBridgeClients.add(response);
        request.on("close", () => {
          devBridgeClients.delete(response);
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/scan") {
        response.writeHead(200, {
          "Access-Control-Allow-Origin": "http://localhost:5173",
          "Cache-Control": "no-store",
          "Content-Type": "application/x-ndjson"
        });
        const collectorsParam = url.searchParams.get("collectors");
        const targetIds = collectorsParam ? collectorsParam.split(",") as ScanCollectorId[] : undefined;
        const result = await scan(targetIds, (progress) =>
          sendJsonLine(response, { type: "progress", progress })
        );
        sendJsonLine(response, { type: "complete", result });
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/p2p/settings") {
        sendJson(response, 200, p2pSettings.getCollectionConfig().networks);
        return;
      }

      if (request.method === "POST" && url.pathname === "/p2p/scope") {
        const body = await readJson(request) as { networkId?: unknown; scope?: unknown } | null;
        if (!body || !isP2PNetworkId(body.networkId) || !isCollectionScope(body.scope)) {
          sendJson(response, 400, { error: "Invalid P2P settings." });
          return;
        }
        p2pSettings.setScope(body.networkId, body.scope);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/radio/settings") {
        sendJson(response, 200, { directoryLimit: radioDirectoryLimit, page: radioDirectoryPage, total: radioDirectoryTotal, filters: radioFilters });
        return;
      }

      if (request.method === "POST" && url.pathname === "/radio/settings") {
        const body = await readJson(request) as { directoryLimit?: unknown } | null;
        if (!body || !isRadioDirectoryLimit(body.directoryLimit)) {
          sendJson(response, 400, { error: "Invalid radio directory limit." });
          return;
        }
        radioDirectoryLimit = body.directoryLimit;
        radioDirectoryPage = 1;
        sendJson(response, 200, { directoryLimit: radioDirectoryLimit, page: radioDirectoryPage, total: radioDirectoryTotal });
        return;
      }

      if (request.method === "POST" && url.pathname === "/radio/page") {
        const body = await readJson(request) as { page?: unknown } | null;
        if (!body || typeof body.page !== "number" || !Number.isInteger(body.page) || body.page < 1) {
          sendJson(response, 400, { error: "Invalid radio directory page." });
          return;
        }
        radioDirectoryPage = body.page;
        sendJson(response, 200, { page: radioDirectoryPage });
        return;
      }

      if (request.method === "POST" && url.pathname === "/radio/filters") {
        const body = await readJson(request) as RadioFilters | null;
        if (!body || typeof body !== "object" || typeof body.tag !== "string") {
          sendJson(response, 400, { error: "Invalid radio filters." });
          return;
        }
        radioFilters = body;
        sendJson(response, 200, { ok: true });
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  devBridgeServer.listen(DEV_BRIDGE_PORT, "127.0.0.1", () => {
    console.log(`Nodex dev bridge listening on http://127.0.0.1:${DEV_BRIDGE_PORT}`);
  });
}

app.whenReady().then(() => {
  void refreshRadioDirectoryTotal();
  app.setName("Nodex");
  app.setAppUserModelId("dev.nodex.app");

  protocol.handle("nodex-stream", async (request) => {
    const url = new URL(request.url);
    const targetUrlString = url.searchParams.get("url");
    if (!targetUrlString) {
      return new Response("Missing url parameter", { status: 400 });
    }

    try {
      const targetUrl = new URL(targetUrlString);
      if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
        return new Response("Only HTTP(S) streams are supported", { status: 400 });
      }
      const response = await fetch(targetUrlString, {
        signal: AbortSignal.timeout(15_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Icy-MetaData": "0",
          "Accept": "audio/aac, audio/aacp, audio/mpeg, audio/ogg, audio/*;q=0.9, */*;q=0.1",
          ...(request.headers.get("range") ? { Range: request.headers.get("range")! } : {})
        }
      });

      // Do not pass through transfer/content encodings. Node can decode a
      // response body before exposing it, while leaving the original header
      // intact; that makes Chromium try to decode already-decoded audio.
      const headers = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin"
      });
      for (const name of STREAM_RESPONSE_HEADERS) {
        const value = response.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(response.body, {
        status: response.status,
        headers
      });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Unable to load stream", { status: 502 });
    }
  });

  ipcMain.handle("signals:scan", (event, targetCollectorIds?: unknown) => {
    const ids = Array.isArray(targetCollectorIds) ? (targetCollectorIds as ScanCollectorId[]) : undefined;
    return scan(ids, (progress) => event.sender.send("signals:scan-progress", progress));
  });
  ipcMain.handle("records:action", (_event, input: RecordActionInput) => performRecordAction(input));
  ipcMain.handle("theme:set", (_event, theme: "system" | "light" | "dark") => {
    nativeTheme.themeSource = theme;
    mainWindow?.setTitleBarOverlay({
      color: "rgba(0, 0, 0, 0)", // Transparent background
      symbolColor: nativeTheme.shouldUseDarkColors ? "#e3e9f5" : "#20283a",
      height: 42
    });
  });

  ipcMain.handle("p2p:getSettings", async () => {
    return p2pSettings.getCollectionConfig().networks;
  });

  ipcMain.handle("p2p:setScope", async (_event, networkId: unknown, scope: unknown) => {
    if (!isP2PNetworkId(networkId) || !isCollectionScope(scope)) throw new Error("Invalid P2P settings.");
    p2pSettings.setScope(networkId, scope);
  });
  ipcMain.handle("radio:getSettings", () => ({ directoryLimit: radioDirectoryLimit, page: radioDirectoryPage, total: radioDirectoryTotal, filters: radioFilters }));
  ipcMain.handle("radio:setDirectoryLimit", (_event, limit: unknown) => {
    if (!isRadioDirectoryLimit(limit)) throw new Error("Invalid radio directory limit.");
    radioDirectoryLimit = limit;
    radioDirectoryPage = 1;
  });
  ipcMain.handle("radio:setPage", (_event, page: unknown) => {
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1) throw new Error("Invalid radio directory page.");
    radioDirectoryPage = page;
  });
  ipcMain.handle("radio:setFilters", (_event, filters: unknown) => {
    if (!filters || typeof filters !== "object") throw new Error("Invalid radio filters.");
    radioFilters = filters as RadioFilters;
  });

  startDevBridge();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  devBridgeServer?.close();
  devBridgeServer = null;
  if (process.platform !== "darwin") app.quit();
});
