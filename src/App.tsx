import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Music, Settings, Square } from "lucide-react";
import type { P2PCollectionScope, P2PNetworkId, P2PSettingsState, RadioFilters, RadioSettingsState, ScanCollectorId, ScanProgress, ScanResult, SignalRecord, ThemeChoice } from "./types";
import { DEFAULT_RADIO_FILTERS } from "./types";
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
import { Favicon } from "./components/records/faviconCache";
import { RadioFiltersBar } from "./components/records/RadioFiltersBar";

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
  async scan(onProgress: (progress: ScanProgress) => void, targetCollectorIds?: ScanCollectorId[]): Promise<ScanResult> {
    if (window.nodex) return window.nodex.scan(onProgress, targetCollectorIds);
    const url = `${devBridgeUrl}/scan` + (targetCollectorIds ? `?collectors=${targetCollectorIds.join(",")}` : "");
    const response = await fetch(url);
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
  radio: {
    async getSettings(): Promise<RadioSettingsState> {
      if (window.nodex) return window.nodex.radio.getSettings();
      return fetchDevBridge<RadioSettingsState>("/radio/settings");
    },
    async setPage(page: number): Promise<void> {
      if (window.nodex) return window.nodex.radio.setPage(page);
      await fetchDevBridge("/radio/page", { method: "POST", body: JSON.stringify({ page }) });
    },
    async setFilters(filters: RadioFilters): Promise<void> {
      if (window.nodex) return window.nodex.radio.setFilters(filters);
      await fetchDevBridge("/radio/filters", { method: "POST", body: JSON.stringify(filters) });
    }
  },
  async setTheme(theme: ThemeChoice): Promise<void> {
    await window.nodex?.setTheme(theme);
  }
};

function FloatingPlayerIcon({ record }: { record: SignalRecord }) {
  const favicon = (record.details["Favicon"] || record.details["favicon"]) as string;
  return <Favicon url={favicon} seed={record.name} wrapperClassName="favicon-wrapper"
    wrapperStyle={{ position: "relative", width: "36px", height: "36px", borderRadius: "8px", flexShrink: 0 }}
    imageClassName="floating-player-bar__img"
    fallback={<Music size={18} />}
  />;
}

export default function App() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanningCollectors, setScanningCollectors] = useState<Set<ScanCollectorId>>(new Set());
  const [refreshedRecordIds, setRefreshedRecordIds] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<ViewId>("local-radio");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SignalRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPeerMap, setShowPeerMap] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [p2pSettings, setP2pSettings] = useState<P2PSettingsState | null>(null);
  const [radioSettings, setRadioSettings] = useState<RadioSettingsState | null>(null);
  const [radioFilters, setRadioFilters] = useState<RadioFilters>(DEFAULT_RADIO_FILTERS);
  const [expandedWarning, setExpandedWarning] = useState<P2PNetworkId | null>(null);
  const [theme, setTheme] = useState<ThemeChoice>(getSavedTheme);
  const [refreshSeconds, setRefreshSeconds] = useState(0);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [sort, setSort] = useState<SortState>({ key: "strength", direction: "desc" });
  const [page, setPage] = useState(1);

  const [playingRadioId, setPlayingRadioId] = useState<string | null>(null);
  const [playingStatus, setPlayingStatus] = useState<string>("Disconnected");
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const stallRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectAttemptRef = useRef<number>(0);
  const connectRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const latestRequestedPageRef = useRef<number>(1);

  const radioStatusCacheRef = useRef<Map<string, { status: string; reachability: string; dateField: string; date: string }>>(new Map());
  const radioPagesCacheRef = useRef<Map<number, SignalRecord[]>>(new Map());
  const lastLimitRef = useRef<number | null>(null);

  useEffect(() => {
    if (radioSettings?.directoryLimit) {
      if (lastLimitRef.current !== null && lastLimitRef.current !== radioSettings.directoryLimit) {
        radioPagesCacheRef.current.clear();
      }
      lastLimitRef.current = radioSettings.directoryLimit;
    }
  }, [radioSettings?.directoryLimit]);

  const applyCachedStatuses = useCallback((records: SignalRecord[]): SignalRecord[] => {
    return records.map((record) => {
      const cached = radioStatusCacheRef.current.get(record.id);
      if (!cached) return record;
      return {
        ...record,
        status: cached.status,
        details: {
          ...record.details,
          Reachability: cached.reachability,
          [cached.dateField]: cached.date
        }
      };
    });
  }, []);

  const updateRadioPlaybackStatus = useCallback((recordId: string, success: boolean) => {
    const status = success ? "Online" : "Offline";
    const reachability = success ? "Online" : "Offline";
    const dateField = success ? "Playback verified at" : "Playback failed at";
    const now = new Date().toISOString();

    // Cache the status change so it persists when paging back
    radioStatusCacheRef.current.set(recordId, { status, reachability, dateField, date: now });

    const updateRecord = (record: SignalRecord): SignalRecord => {
      if (record.id !== recordId) return record;
      return {
        ...record,
        status: status,
        details: {
          ...record.details,
          Reachability: reachability,
          [dateField]: now
        }
      };
    };

    setResult((current) => current ? { ...current, records: current.records.map(updateRecord) } : current);
    setSelected((current) => current?.id === recordId ? updateRecord(current) : current);
  }, []);


  const handleMuteToggle = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (activeAudioRef.current) {
      activeAudioRef.current.volume = nextMuted ? 0 : volume;
    }
  };

  const stopGlobalVisualizing = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  const startGlobalVisualizing = useCallback((audio: HTMLAudioElement) => {
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      sourceRef.current = source;
      analyserRef.current = analyser;

      const spectrum = new Uint8Array(analyser.frequencyBinCount);
      let visualPeak = 0.05;

      const update = () => {
        if (!analyserRef.current) return;
        analyser.getByteFrequencyData(spectrum);
        
        const bandSize = Math.floor(spectrum.length / 4);
        const rawLevels = [0, 0, 0, 0].map((_, index) => {
          const start = index * bandSize;
          const band = spectrum.slice(start, start + bandSize);
          return band.reduce((total, value) => total + value, 0) / (band.length * 255);
        });

        const maxRaw = Math.max(...rawLevels);
        visualPeak = Math.max(0.05, maxRaw, visualPeak * 0.96);

        const normalized = rawLevels.map((level) => Math.min(1, level / visualPeak));

        // Directly modify targeted DOM element styles to bypass page reflows
        const bar1 = document.getElementById("eq-bar-1");
        const bar2 = document.getElementById("eq-bar-2");
        const bar3 = document.getElementById("eq-bar-3");
        const bar4 = document.getElementById("eq-bar-4");
        const shadow = document.getElementById("radio-logo-shadow");

        if (bar1) bar1.style.height = `${Math.max(15, Math.round(normalized[0] * 100))}%`;
        if (bar2) bar2.style.height = `${Math.max(15, Math.round(normalized[1] * 100))}%`;
        if (bar3) bar3.style.height = `${Math.max(15, Math.round(normalized[2] * 100))}%`;
        if (bar4) bar4.style.height = `${Math.max(15, Math.round(normalized[3] * 100))}%`;

        if (shadow) {
          const avg = normalized.reduce((sum, val) => sum + val, 0) / normalized.length;
          const shadowScale = 0.88 + avg * 0.28;
          shadow.style.transform = `scale(${shadowScale}) translateY(8px)`;
        }

        animationFrameRef.current = requestAnimationFrame(update);
      };
      animationFrameRef.current = requestAnimationFrame(update);
      void context.resume();
    } catch {
      // Fallback
    }
  }, []);

  const stopRadio = useCallback(() => {
    // Null the ref first so every in-flight callback (onError, onPlaying,
    // scheduleRetry, the polling interval) sees null and bails before it can
    // queue a new reconnect timer.
    const audio = activeAudioRef.current;
    activeAudioRef.current = null;

    if (stallRetryTimerRef.current !== null) {
      clearInterval(stallRetryTimerRef.current);
      stallRetryTimerRef.current = null;
    }
    if (connectRetryTimerRef.current !== null) {
      clearTimeout(connectRetryTimerRef.current);
      connectRetryTimerRef.current = null;
    }
    connectAttemptRef.current = 0;

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlayingRadioId(null);
    setPlayingStatus("Disconnected");
    stopGlobalVisualizing();
  }, [stopGlobalVisualizing]);

  const MAX_CONNECT_ATTEMPTS = 3;
  const CONNECT_RETRY_DELAY_MS = 1_500;

  const playRadio = useCallback((record: SignalRecord) => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.removeAttribute("src");
      activeAudioRef.current.load();
    }
    if (stallRetryTimerRef.current !== null) {
      clearInterval(stallRetryTimerRef.current);
      stallRetryTimerRef.current = null;
    }
    if (connectRetryTimerRef.current !== null) {
      clearTimeout(connectRetryTimerRef.current);
      connectRetryTimerRef.current = null;
    }
    connectAttemptRef.current = 0;
    stopGlobalVisualizing();

    const streamUrl = record.details["Stream URL"] as string;

    const attempt = (audio: HTMLAudioElement) => {
      connectAttemptRef.current += 1;
      const attemptNum = connectAttemptRef.current;
      const freshUrl = `nodex-stream://proxy?url=${encodeURIComponent(streamUrl)}&_t=${Date.now()}`;

      if (attemptNum > 1) {
        audio.src = freshUrl;
        audio.load();
        setPlayingStatus(`Connecting (attempt ${attemptNum}/${MAX_CONNECT_ATTEMPTS})…`);
      }

      audio.play().catch((err) => {
        if (activeAudioRef.current !== audio) return;
        console.warn(`Playback attempt ${attemptNum} failed:`, err);
        scheduleRetry(audio, record);
      });
    };

    const scheduleRetry = (audio: HTMLAudioElement, rec: SignalRecord) => {
      if (activeAudioRef.current !== audio) return;
      if (connectAttemptRef.current >= MAX_CONNECT_ATTEMPTS) {
        setPlayingStatus("Playback failed");
        updateRadioPlaybackStatus(rec.id, false);
        stopRadio();
        return;
      }
      setPlayingStatus(`Connecting (attempt ${connectAttemptRef.current + 1}/${MAX_CONNECT_ATTEMPTS})…`);
      connectRetryTimerRef.current = setTimeout(() => {
        connectRetryTimerRef.current = null;
        if (activeAudioRef.current !== audio) return;
        attempt(audio);
      }, CONNECT_RETRY_DELAY_MS);
    };

    const proxiedUrl = `nodex-stream://proxy?url=${encodeURIComponent(streamUrl)}&_t=${Date.now()}`;

    const audio = document.createElement("audio");
    audio.crossOrigin = "anonymous";
    audio.src = proxiedUrl;
    audio.volume = isMuted ? 0 : volume;
    activeAudioRef.current = audio;
    setPlayingRadioId(record.id);
    setPlayingStatus("Connecting…");

    const onPlaying = () => {
      if (activeAudioRef.current !== audio) return;
      connectAttemptRef.current = 0;
      setPlayingStatus("Playing Live");
      updateRadioPlaybackStatus(record.id, true);
    };

    const onWaiting = () => {
      if (activeAudioRef.current !== audio) return;
      setPlayingStatus("Buffering…");
    };

    const onError = (e: Event) => {
      if (activeAudioRef.current !== audio) return;
      console.warn(`Audio error on attempt ${connectAttemptRef.current}:`, e);
      scheduleRetry(audio, record);
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("error", onError);

    // Poll currentTime every 500 ms to detect a frozen playhead.
    // The "stalled" event fires too late and triggers a seek; polling lets us
    // reconnect the instant the stream stops advancing (after 3 ticks = 1.5 s).
    let lastTime = -1;
    let frozenTicks = 0;
    stallRetryTimerRef.current = setInterval(() => {
      if (activeAudioRef.current !== audio) return;
      // Only check while the element believes it is playing
      if (audio.paused || audio.readyState < 2) return;
      const now = audio.currentTime;
      if (now === lastTime) {
        frozenTicks++;
        if (frozenTicks >= 3) {
          frozenTicks = 0;
          lastTime = -1;
          setPlayingStatus("Buffering…");
          const freshUrl = `nodex-stream://proxy?url=${encodeURIComponent(streamUrl)}&_t=${Date.now()}`;
          audio.src = freshUrl;
          audio.load();
          audio.play().catch(() => { /* surfaces via onError */ });
        }
      } else {
        lastTime = now;
        frozenTicks = 0;
      }
    }, 500) as unknown as ReturnType<typeof setTimeout>;

    startGlobalVisualizing(audio);
    attempt(audio);
  }, [isMuted, volume, updateRadioPlaybackStatus, startGlobalVisualizing, stopGlobalVisualizing, stopRadio]);

  const handleRemoteVolumeChange = useCallback((val: number) => {
    setVolume(val);
    let nextMuted = isMuted;
    if (val > 0) {
      setIsMuted(false);
      nextMuted = false;
    }
    if (activeAudioRef.current) {
      activeAudioRef.current.volume = nextMuted ? 0 : val;
    }
  }, [isMuted]);

  const handleVolumeChangeDirect = useCallback((val: number) => {
    if (activeAudioRef.current) {
      activeAudioRef.current.volume = isMuted ? 0 : val;
    }
  }, [isMuted]);

  useEffect(() => {
    return () => {
      stopRadio();
    };
  }, [stopRadio]);

  useEffect(() => {
    void nodexApi.p2p.getSettings().then(setP2pSettings).catch(() => undefined);
    void nodexApi.radio.getSettings().then((settings) => {
      setRadioSettings(settings);
      if (settings.filters) setRadioFilters(settings.filters);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (window.nodex && window.nodex.onRecordUpdate) {
      return window.nodex.onRecordUpdate((updatedRecord) => {
        setResult((current) => {
          if (!current) return current;
          return {
            ...current,
            records: current.records.map((r) => r.id === updatedRecord.id ? updatedRecord : r)
          };
        });
        setSelected((currentSelected) => currentSelected?.id === updatedRecord.id ? updatedRecord : currentSelected);
      });
    } else {
      const eventSource = new EventSource("/__nodex/events");
      eventSource.onmessage = (event) => {
        try {
          const updatedRecord = JSON.parse(event.data) as SignalRecord;
          setResult((current) => {
            if (!current) return current;
            return {
              ...current,
              records: current.records.map((r) => r.id === updatedRecord.id ? updatedRecord : r)
            };
          });
          setSelected((currentSelected) => currentSelected?.id === updatedRecord.id ? updatedRecord : currentSelected);
        } catch {
          // Ignore
        }
      };
      return () => {
        eventSource.close();
      };
    }
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

  const runScan = useCallback((targetCollectorIds?: ScanCollectorId[], silent = false) => {
    if (activeScan) {
      if (scanAbortControllerRef.current) {
        scanAbortControllerRef.current.abort();
      }
      activeScan = null;
    }

    const abortController = new AbortController();
    scanAbortControllerRef.current = abortController;
    const { signal } = abortController;

    const scan = async () => {
      const activeIds = targetCollectorIds ?? scanCollectorIds;
      let loadingTimeout: number | undefined;

      if (!silent) {
        // Delay showing the loader by 120ms to avoid flicker for fast/cached operations
        loadingTimeout = window.setTimeout(() => {
          setScanning(true);
          setScanningCollectors(new Set(activeIds));
          // Clear existing radio records if we show the loader for radio scanning
          if (activeIds.includes("radio")) {
            setResult((current) => current ? { ...current, records: current.records.filter((record) => record.kind !== "radio") } : current);
            setSelected((current) => current?.kind === "radio" ? null : current);
          }
        }, 120);
      }
      setRefreshedRecordIds(new Set());
      try {
        if (new URLSearchParams(window.location.search).has("demo")) {
          if (signal.aborted) return;
          setResult({ ...fixtureScan, scannedAt: new Date().toISOString() });
          if (!silent) {
            if (loadingTimeout !== undefined) window.clearTimeout(loadingTimeout);
            setScanningCollectors(new Set());
          }
        } else {
          const scannedAt = new Date().toISOString();
          if (signal.aborted) return;
          setResult((current) => current ? { ...current, scannedAt, durationMs: 0, warnings: [] } : { scannedAt, durationMs: 0, records: [], warnings: [] });
          const finalResult = await nodexApi.scan((progress) => {
            if (signal.aborted) return;
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
                records: applyCachedStatuses(reuseUnchangedRecords(previous.records, [...retained, ...progress.records])),
                warnings: progress.warning ? [...previous.warnings, progress.warning] : previous.warnings
              };
            });
            if (progress.phase === "complete" && !silent) {
              setScanningCollectors((current) => {
                const next = new Set(current);
                next.delete(progress.collectorId);
                return next;
              });
            }
            if (progress.collectorId === "radio" && progress.phase === "complete") {
              void nodexApi.radio.getSettings().then((settings) => {
                if (!signal.aborted) setRadioSettings(settings);
              }).catch(() => undefined);
            }
          }, targetCollectorIds);
          if (signal.aborted) return;
          setResult((current) => {
            const previous = current ?? { scannedAt, durationMs: 0, records: [], warnings: [] };
            const retained = previous.records.filter((record) =>
              !activeIds.includes(collectorForRecord(record))
            );
            const mergedRecords = applyCachedStatuses(reuseUnchangedRecords(previous.records, [...retained, ...finalResult.records]));
            
            // Cache the radio records when the scan finishes!
            if (activeIds.includes("radio")) {
              const radioRecords = mergedRecords.filter((record) => record.kind === "radio");
              radioPagesCacheRef.current.set(latestRequestedPageRef.current, radioRecords);
            }

            return {
              ...finalResult,
              records: mergedRecords
            };
          });
        }
      } catch (error) {
        if (signal.aborted) return;
        const warning = error instanceof Error ? error.message : String(error);
        setResult((current) => current ? { ...current, warnings: [...current.warnings, warning] } : {
          scannedAt: new Date().toISOString(), durationMs: 0, records: [], warnings: [warning]
        });
      } finally {
        if (loadingTimeout !== undefined) {
          window.clearTimeout(loadingTimeout);
        }
        if (!signal.aborted) {
          if (!silent) {
            setScanning(false);
            setScanningCollectors(new Set());
          }
          setRefreshedRecordIds(new Set());
        }
      }
    };
    activeScan = scan().finally(() => {
      if (scanAbortControllerRef.current === abortController) {
        activeScan = null;
      }
    });
    return activeScan;
  }, [applyCachedStatuses]);

  const handleFilterChange = useCallback((newFilters: RadioFilters) => {
    setRadioFilters(newFilters);
    // Bust the frontend radio pages cache so stale results aren't shown
    radioPagesCacheRef.current.clear();
    // Reset to page 1
    setRadioSettings((current) => current ? { ...current, page: 1 } : current);
    latestRequestedPageRef.current = 1;
    void nodexApi.radio.setPage(1)
      .then(() => nodexApi.radio.setFilters(newFilters))
      .then(() => runScan(["radio"]))
      .catch(() => undefined);
  }, [runScan]);

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
  const playingRecord = useMemo(() => {
    if (!playingRadioId) return null;
    return records.find((r) => r.id === playingRadioId) || null;
  }, [playingRadioId, records]);
  const [lastPlayingRecord, setLastPlayingRecord] = useState<SignalRecord | null>(null);
  const [prevPlayingRecord, setPrevPlayingRecord] = useState<SignalRecord | null>(null);

  if (playingRecord !== prevPlayingRecord) {
    setPrevPlayingRecord(playingRecord);
    if (playingRecord) {
      setLastPlayingRecord(playingRecord);
    }
  }
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
      if (sort.key === "strength" && a.kind === "radio" && b.kind === "radio") {
        const aVotes = Number(a.details.Votes ?? a.details.votes ?? 0);
        const bVotes = Number(b.details.Votes ?? b.details.votes ?? 0);
        const comparison = aVotes - bVotes;
        return sort.direction === "asc" ? comparison : -comparison;
      }
      const aValue = value(a, sort.key);
      const bValue = value(b, sort.key);
      const comparison = typeof aValue === "number" && typeof bValue === "number" ? aValue - bValue : String(aValue).localeCompare(String(bValue));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [activeView, query, records, sort]);

  const counts = useMemo<Record<string, number>>(() => {
    const next = Object.fromEntries([
      ...localViews.map((view) => [view.id, records.filter(view.matches).length]),
      ...p2pViews.map((view) => [view.id, records.filter((record) => record.kind === "p2p" && record.provenance === view.networkName).length])
    ]) as Record<string, number>;
    if (radioSettings?.total) next["local-radio"] = radioSettings.total;
    return next;
  }, [radioSettings, records]);
  const selectedP2P = p2pViews.find((view) => view.id === activeView);
  const expanded = selectedP2P ? p2pSettings?.[selectedP2P.networkId]?.scope === "expanded" : false;
  const activeDetails = localViews.find((view) => view.id === activeView) ?? p2pViews.find((view) => view.id === activeView) ?? localViews[0];
  const activeLoading = "collectors" in activeDetails
    ? activeDetails.collectors.some((collector) => scanningCollectors.has(collector))
    : scanningCollectors.has(activeDetails.id as ScanCollectorId);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 100));
  const radioPageCount = radioSettings ? Math.max(1, Math.ceil(radioSettings.total / radioSettings.directoryLimit)) : 1;
  const currentPage = activeView === "local-radio" ? radioSettings?.page ?? 1 : Math.min(page, pageCount);
  const visiblePageCount = activeView === "local-radio" ? radioPageCount : pageCount;
  const paginatedRecords = useMemo(() => activeView === "local-radio" ? filtered : filtered.slice((currentPage - 1) * 100, currentPage * 100), [activeView, currentPage, filtered]);

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

  async function changePage(nextPage: number) {
    if (activeView === "local-radio") {
      latestRequestedPageRef.current = nextPage;
      const currentRequest = nextPage;

      // Check if this page is already cached in our frontend radio cache
      const cached = radioPagesCacheRef.current.get(nextPage);
      if (cached) {
        // Swap the records instantly!
        setResult((current) => {
          if (!current) return current;
          const retained = current.records.filter((record) => record.kind !== "radio");
          return {
            ...current,
            records: [...retained, ...applyCachedStatuses(cached)]
          };
        });
        setSelected((current) => current?.kind === "radio" ? null : current);
        
        // Update settings page locally
        setRadioSettings((current) => current ? { ...current, page: nextPage } : { directoryLimit: 100, page: nextPage, total: 50000, filters: DEFAULT_RADIO_FILTERS });

        // Set the page on the backend and trigger a silent update scan in the background
        void nodexApi.radio.setPage(nextPage).then(() => {
          if (latestRequestedPageRef.current === currentRequest) {
            void runScan(["radio"], true);
          }
        });
        return;
      }

      // If NOT cached, update page locally and fetch it
      setRadioSettings((current) => current ? { ...current, page: nextPage } : { directoryLimit: 100, page: nextPage, total: 50000, filters: DEFAULT_RADIO_FILTERS });

      await nodexApi.radio.setPage(nextPage);
      if (latestRequestedPageRef.current !== currentRequest) return;

      void runScan(["radio"]);
      return;
    }
    setPage(nextPage);
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
      <div className="titlebar__brand"><img src="./icon.png" alt="" /><span>Nodex</span></div>
    </header>
    <AppSidebar activeView={activeView} collapsed={sidebarCollapsed} counts={counts} scanningCollectors={scanningCollectors}
      scanning={scanning} scannedAt={result?.scannedAt} currentTime={currentTime} onRunScan={() => void runScan()}
      onViewChange={(view) => { setActiveView(view); setQuery(""); setPage(1); }} />
    <main className="main-content">
      <section className="view-heading">
        <div><h1>{activeDetails.label}</h1><p>{activeDetails.description}</p></div>
      </section>
      <RecordsPanel records={paginatedRecords} totalRecords={activeView === "local-radio" ? radioSettings?.total ?? 0 : filtered.length} page={currentPage} pageCount={visiblePageCount} onPageChange={changePage} query={query} onQueryChange={changeQuery} sort={sort} onSort={changeSort}
        loading={activeLoading} scanningCollectors={scanningCollectors}
        refreshedRecordIds={refreshedRecordIds} selectedRecordId={playingRadioId || selected?.id} playingStatus={playingStatus} onSelect={setSelected}
        map={activeView.startsWith("p2p-") && showPeerMap ? <PeerMap records={filtered} loading={activeLoading} onSelect={setSelected} /> : undefined}
        toolbarRight={
          activeView === "local-radio" ? <RadioFiltersBar filters={radioFilters} onChange={handleFilterChange} /> :
          selectedP2P && p2pSettings ? <div className="records-discovery">
          <div className={expandedWarning === selectedP2P.networkId ? "records-discovery__row is-dialog-open" : "records-discovery__row"} onClick={() => !selectedP2P.supportsExpandedDiscovery ? undefined : void changeScope(selectedP2P.networkId, !expanded)} style={{ cursor: selectedP2P.supportsExpandedDiscovery ? 'pointer' : 'default' }}>
            <Switch checked={expanded} disabled={!selectedP2P.supportsExpandedDiscovery} label={`Discover more ${selectedP2P.label} peers`} onCheckedChange={(checked: boolean) => void changeScope(selectedP2P.networkId, checked)} />
            <div><strong>Discover more peers</strong><span>{selectedP2P.footerDescription}</span></div>
          </div>
        </div> : undefined} />
    </main>
    {selected ? <RecordDrawer
      record={selected}
      onClose={() => setSelected(null)}
      onChanged={runScan}
      playingRadioId={playingRadioId}
      playingStatus={playingStatus}
      volume={volume}
      isMuted={isMuted}
      onPlayRadio={playRadio}
      onStopRadio={stopRadio}
      onVolumeChange={handleRemoteVolumeChange}
      onVolumeChangeDirect={handleVolumeChangeDirect}
      onMuteToggle={handleMuteToggle}
    /> : null}
    {settingsOpen ? <SettingsDrawer theme={theme} onTheme={setTheme} refreshSeconds={refreshSeconds} onRefreshSeconds={setRefreshSeconds}
      showPeerMap={showPeerMap} onShowPeerMap={setShowPeerMap} onExport={exportJson} exportDisabled={!result} onClose={() => setSettingsOpen(false)} /> : null}
    {expandedWarning ? <Dialog title="Discover more peers?" confirmLabel="Enable" onClose={() => setExpandedWarning(null)} onConfirm={() => void enableExpandedDiscovery()}>
      <p>This makes outbound connection attempts to discover more <strong>{networkLabels[expandedWarning]}</strong> peers. Remote peers can see your IP address.</p>
      <p>Use a VPN or proxy if you want to limit that exposure.</p>
    </Dialog> : null}
    {lastPlayingRecord && (
      <div className={`floating-player-bar${playingRadioId ? " is-visible" : ""}${selected?.id === lastPlayingRecord.id ? " is-expanded" : ""}`} onClick={() => setSelected(lastPlayingRecord)}>
        <div className="floating-player-bar__icon-container">
          <FloatingPlayerIcon record={lastPlayingRecord} />
        </div>
        <div className="floating-player-bar__content">
          <strong className="floating-player-bar__title">{lastPlayingRecord.name}</strong>
          <span className="floating-player-bar__info">
            {((lastPlayingRecord.details["Country"] as string) || "Global")} &bull; {((lastPlayingRecord.details["Codec"] as string) || "MP3")} &bull; {(lastPlayingRecord.details["Bitrate"] ? `${lastPlayingRecord.details["Bitrate"]}` : "128 kbps")}
          </span>
        </div>
        <div className="floating-player-bar__action-icon">
          <Square size={18} fill="currentColor" />
        </div>
      </div>
    )}
  </div>;
}
