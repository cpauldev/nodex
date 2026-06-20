import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performRecordAction } from "./actions.js";
import {
  collectAdapters,
  collectBluetooth,
  collectNetwork,
  collectWifi
} from "./collectors.js";
import type {
  RecordActionInput,
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
const p2pCollectorLabels: Record<P2PNetworkId, string> = {
  xmtp: "XMTP",
  ethereum: "Ethereum",
  ipfs: "IPFS",
  bitcoin: "Bitcoin",
  base: "Base"
};

if (!hasLock) {
  app.quit();
}

const collectors: ReadonlyArray<{
  id: ScanCollectorId;
  label: string;
  collect: (onPartial: (records: SignalRecord[]) => void) => Promise<SignalRecord[]>;
}> = [
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

async function scan(onProgress?: (progress: ScanProgress) => void): Promise<ScanResult> {
  const started = Date.now();
  const warnings: string[] = [];

  const groups = await Promise.all(
    collectors.map(async ({ id, label, collect }) => {
      try {
        const records = enrichGeoLocations(await collect((partialRecords) => {
          onProgress?.({ collectorId: id, phase: "partial", records: partialRecords });
        }));
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
      nodeIntegration: false
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
      if (request.method === "GET" && url.pathname === "/scan") {
        response.writeHead(200, {
          "Access-Control-Allow-Origin": "http://localhost:5173",
          "Cache-Control": "no-store",
          "Content-Type": "application/x-ndjson"
        });
        const result = await scan((progress) =>
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
  app.setName("Nodex");
  app.setAppUserModelId("dev.nodex.app");
  ipcMain.handle("signals:scan", (event) =>
    scan((progress) => event.sender.send("signals:scan-progress", progress))
  );
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
