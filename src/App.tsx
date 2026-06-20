import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Globe2, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import type { P2PCollectionScope, P2PNetworkId, P2PSettingsState, ScanCollectorId, ScanProgress, ScanResult, SignalRecord, ThemeChoice } from "./types";
import { fixtureScan } from "./fixtures";
import { reuseUnchangedRecords } from "./recordIdentity";
import { matchesRecord } from "./search";
import { applyTheme, getSavedTheme, saveTheme } from "./theme";
import {
  classLabel, collectorForRecord, kindLabel, localViews, networkLabels, p2pViews,
  recordLatency, scanCollectorIds, type SortKey, type SortState, type ViewId
} from "./presentation";
import { AppSidebar } from "./components/app-shell/AppSidebar";
import { Button } from "./components/ui/Button";
import { Dialog } from "./components/ui/Dialog";
import { PeerMap } from "./components/records/PeerMap";
import { RecordsPanel } from "./components/records/RecordsPanel";
import { RecordDrawer } from "./components/details/RecordDrawer";
import { SettingsDrawer } from "./components/settings/SettingsDrawer";
import { Switch } from "./components/ui/Switch";

const devBridgeUrl = "/__nodex";
let activeScan: Promise<void> | null = null;

async function fetchDevBridge<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${devBridgeUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) throw new Error(`Nodex dev bridge returned ${response.status}.`);
  return response.json() as Promise<T>;
}

const nodexApi = {
  async scan(onProgress: (progress: ScanProgress) => void): Promise<ScanResult> {
    if (window.nodex) return window.nodex.scan(onProgress);
    const response = await fetch(`${devBridgeUrl}/scan`);
    if (!response.ok || !response.body) throw new Error(`Nodex dev bridge returned ${response.status}.`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: ScanResult | undefined;
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const event = JSON.parse(line) as { type: "progress"; progress: ScanProgress } | { type: "complete"; result: ScanResult };
        if (event.type === "progress") onProgress(event.progress);
        else result = event.result;
      }
      if (done) break;
    }
    if (!result) throw new Error("Nodex scan ended without a result.");
    return result;
  },
  p2p: {
    async getSettings(): Promise<P2PSettingsState> {
      if (window.nodex) return window.nodex.p2p.getSettings();
      return fetchDevBridge<P2PSettingsState>("/p2p/settings");
    },
    async setScope(networkId: P2PNetworkId, scope: P2PCollectionScope): Promise<void> {
      if (window.nodex) return window.nodex.p2p.setScope(networkId, scope);
      await fetchDevBridge("/p2p/scope", { method: "POST", body: JSON.stringify({ networkId, scope }) });
    }
  },
  async setTheme(theme: ThemeChoice): Promise<void> {
    await window.nodex?.setTheme(theme);
  }
};

export default function App() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanningCollectors, setScanningCollectors] = useState<Set<ScanCollectorId>>(new Set());
  const [refreshedRecordIds, setRefreshedRecordIds] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<ViewId>("local-all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SignalRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPeerMap, setShowPeerMap] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [p2pSettings, setP2pSettings] = useState<P2PSettingsState | null>(null);
  const [expandedWarning, setExpandedWarning] = useState<P2PNetworkId | null>(null);
  const [theme, setTheme] = useState<ThemeChoice>(getSavedTheme);
  const [refreshSeconds, setRefreshSeconds] = useState(0);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [sort, setSort] = useState<SortState>({ key: "strength", direction: "desc" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    void nodexApi.p2p.getSettings().then(setP2pSettings).catch(() => undefined);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    saveTheme(theme);
    let disposed = false;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyCurrentTheme = () => applyTheme(theme);

    if (theme !== "system") applyCurrentTheme();
    if (theme === "system") systemTheme.addEventListener("change", applyCurrentTheme);

    void nodexApi.setTheme(theme).then(() => {
      if (!disposed) applyCurrentTheme();
    });

    return () => {
      disposed = true;
      systemTheme.removeEventListener("change", applyCurrentTheme);
    };
  }, [theme]);

  const runScan = useCallback(() => {
    if (activeScan) return activeScan;
    const scan = async () => {
      setScanning(true);
      setScanningCollectors(new Set(scanCollectorIds));
      setRefreshedRecordIds(new Set());
      try {
        if (new URLSearchParams(window.location.search).has("demo")) {
          setResult({ ...fixtureScan, scannedAt: new Date().toISOString() });
          setScanningCollectors(new Set());
        } else {
          const scannedAt = new Date().toISOString();
          setResult((current) => current ? { ...current, scannedAt, durationMs: 0, warnings: [] } : { scannedAt, durationMs: 0, records: [], warnings: [] });
          const finalResult = await nodexApi.scan((progress) => {
            if (progress.records.length) setRefreshedRecordIds((current) => {
              const next = new Set(current);
              for (const record of progress.records) next.add(record.id);
              return next;
            });
            setResult((current) => {
              const previous = current ?? { scannedAt, durationMs: 0, records: [], warnings: [] };
              const incomingIds = new Set(progress.records.map((record) => record.id));
              const retained = previous.records.filter((record) =>
                collectorForRecord(record) !== progress.collectorId || (progress.phase === "partial" && !incomingIds.has(record.id))
              );
              return {
                ...previous,
                records: reuseUnchangedRecords(previous.records, [...retained, ...progress.records]),
                warnings: progress.warning ? [...previous.warnings, progress.warning] : previous.warnings
              };
            });
            if (progress.phase === "complete") setScanningCollectors((current) => {
              const next = new Set(current);
              next.delete(progress.collectorId);
              return next;
            });
          });
          setResult((current) => current ? { ...finalResult, records: reuseUnchangedRecords(current.records, finalResult.records) } : finalResult);
        }
      } catch (error) {
        const warning = error instanceof Error ? error.message : String(error);
        setResult((current) => current ? { ...current, warnings: [...current.warnings, warning] } : {
          scannedAt: new Date().toISOString(), durationMs: 0, records: [], warnings: [warning]
        });
      } finally {
        setScanning(false);
        setScanningCollectors(new Set());
        setRefreshedRecordIds(new Set());
      }
    };
    activeScan = scan().finally(() => { activeScan = null; });
    return activeScan;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void runScan(), 0);
    return () => window.clearTimeout(timer);
  }, [runScan]);
  useEffect(() => {
    if (!refreshSeconds) return;
    const timer = window.setInterval(() => void runScan(), refreshSeconds * 1_000);
    return () => window.clearInterval(timer);
  }, [refreshSeconds, runScan]);

  const records = useMemo(() => result?.records ?? [], [result]);
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const p2pView = p2pViews.find((view) => view.id === activeView);
    const localView = localViews.find((view) => view.id === activeView);
    const value = (record: SignalRecord, key: SortKey): string | number => {
      if (key === "strength") {
        // For P2P records, use latency (lower is better), or fall back to status text
        if (record.kind === "p2p") {
          const latency = recordLatency(record);
          return latency !== undefined ? latency : record.status;
        }
        // For local records with strength, use negative value (higher strength = better)
        if (record.strength !== undefined) return -record.strength;
        // Fall back to status text for adapters, neighbors, etc.
        return record.status;
      }
      if (key === "kind") return kindLabel[record.kind];
      return String(record[key] ?? "");
    };
    return records.filter((record) => {
      const matchesView = p2pView
        ? record.kind === "p2p" && record.provenance === p2pView.networkName
        : Boolean(localView?.matches(record));
      return matchesView && matchesRecord(record, normalized, [kindLabel[record.kind], classLabel[record.recordClass]]);
    }).sort((a, b) => {
      const aValue = value(a, sort.key);
      const bValue = value(b, sort.key);
      const comparison = typeof aValue === "number" && typeof bValue === "number" ? aValue - bValue : String(aValue).localeCompare(String(bValue));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [activeView, query, records, sort]);

  const counts = useMemo(() => Object.fromEntries([
    ...localViews.map((view) => [view.id, records.filter(view.matches).length]),
    ...p2pViews.map((view) => [view.id, records.filter((record) => record.kind === "p2p" && record.provenance === view.networkName).length])
  ]), [records]);
  const selectedP2P = p2pViews.find((view) => view.id === activeView);
  const expanded = selectedP2P ? p2pSettings?.[selectedP2P.networkId]?.scope === "expanded" : false;
  const activeDetails = localViews.find((view) => view.id === activeView) ?? p2pViews.find((view) => view.id === activeView) ?? localViews[0];
  const activeLoading = "collectors" in activeDetails
    ? activeDetails.collectors.some((collector) => scanningCollectors.has(collector))
    : scanningCollectors.has(activeDetails.id as ScanCollectorId);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 100));
  const currentPage = Math.min(page, pageCount);
  const paginatedRecords = useMemo(() => filtered.slice((currentPage - 1) * 100, currentPage * 100), [currentPage, filtered]);

  async function changeScope(networkId: P2PNetworkId, expanded: boolean) {
    if (expanded) {
      setExpandedWarning(networkId);
      return;
    }
    await nodexApi.p2p.setScope(networkId, "known");
    setP2pSettings(await nodexApi.p2p.getSettings());
    void runScan();
  }

  async function enableExpandedDiscovery() {
    if (!expandedWarning) return;
    const networkId = expandedWarning;
    await nodexApi.p2p.setScope(networkId, "expanded");
    setP2pSettings(await nodexApi.p2p.getSettings());
    setExpandedWarning(null);
    const network = p2pViews.find((view) => view.networkId === networkId);
    if (network) {
      setResult((current) => current ? { ...current, records: current.records.filter((record) => record.kind !== "p2p" || record.provenance !== network.networkName) } : current);
      setSelected((current) => current?.kind === "p2p" && current.provenance === network.networkName ? null : current);
    }
    if (!refreshSeconds) setRefreshSeconds(15);
    void runScan();
  }

  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    setPage(1);
  }, []);

  const changeSort = useCallback((key: SortKey) => {
    setPage(1);
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "strength" ? "desc" : "asc" });
  }, []);

  function exportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nodex-${new Date().toISOString().replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className={sidebarCollapsed ? "app-shell is-sidebar-collapsed" : "app-shell"}>
    <header className="titlebar">
      <Button variant="ghost" size="sm" icon={sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />} iconOnly
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => {
          setSidebarCollapsed((current) => !current);
          setSettingsOpen(false);
        }} />
      <Button
        variant="ghost"
        size="sm"
        icon={<Settings size={17} />}
        iconOnly
        aria-label={settingsOpen ? "Close settings" : "Open settings"}
        onClick={() => setSettingsOpen((current) => !current)}
      />
      <div className="titlebar__brand"><img src="/icon.png" alt="" /><span>Nodex</span></div>
    </header>
    <AppSidebar activeView={activeView} collapsed={sidebarCollapsed} counts={counts} scanningCollectors={scanningCollectors}
      scanning={scanning} scannedAt={result?.scannedAt} currentTime={currentTime} onRunScan={() => void runScan()}
      onViewChange={(view) => { setActiveView(view); setQuery(""); setPage(1); }} />
    <main className="main-content">
      <section className="view-heading">
        <div><h1>{activeDetails.label}</h1><p>{activeDetails.description}</p></div>
      </section>
      <RecordsPanel records={paginatedRecords} totalRecords={filtered.length} page={currentPage} pageCount={pageCount} onPageChange={setPage} query={query} onQueryChange={changeQuery} sort={sort} onSort={changeSort}
        loading={activeLoading} scanningCollectors={scanningCollectors}
        refreshedRecordIds={refreshedRecordIds} onSelect={setSelected}
        map={activeView.startsWith("p2p-") && showPeerMap ? <PeerMap records={filtered} loading={activeLoading} onSelect={setSelected} /> : undefined}
        toolbarRight={selectedP2P && p2pSettings ? <div className="records-discovery">
          <div className={expandedWarning === selectedP2P.networkId ? "records-discovery__row is-dialog-open" : "records-discovery__row"} onClick={() => !selectedP2P.supportsExpandedDiscovery ? undefined : void changeScope(selectedP2P.networkId, !expanded)} style={{ cursor: selectedP2P.supportsExpandedDiscovery ? 'pointer' : 'default' }}>
            <Switch checked={expanded} disabled={!selectedP2P.supportsExpandedDiscovery} label={`Discover more ${selectedP2P.label} peers`} onCheckedChange={(checked: boolean) => void changeScope(selectedP2P.networkId, checked)} />
            <div><strong>Discover more peers</strong><span>{selectedP2P.footerDescription}</span></div>
          </div>
        </div> : undefined} />
    </main>
    {selected ? <RecordDrawer record={selected} onClose={() => setSelected(null)} onChanged={runScan} /> : null}
    {settingsOpen ? <SettingsDrawer theme={theme} onTheme={setTheme} refreshSeconds={refreshSeconds} onRefreshSeconds={setRefreshSeconds}
      showPeerMap={showPeerMap} onShowPeerMap={setShowPeerMap} onExport={exportJson} exportDisabled={!result} onClose={() => setSettingsOpen(false)} /> : null}
    {expandedWarning ? <Dialog title="Discover more peers?" confirmLabel="Enable" onClose={() => setExpandedWarning(null)} onConfirm={() => void enableExpandedDiscovery()}>
      <p>This makes outbound connection attempts to discover more <strong>{networkLabels[expandedWarning]}</strong> peers. Remote peers can see your IP address.</p>
      <p>Use a VPN or proxy if you want to limit that exposure.</p>
    </Dialog> : null}
  </div>;
}
