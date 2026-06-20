import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { LoaderCircle } from "lucide-react";
import type { P2PNetworkId, ScanCollectorId } from "../../types";
import { formatRelativeTime, localViews, p2pViews, type ViewId } from "../../presentation";
import { Button } from "../ui/Button";

function P2PNetworkIcon({ networkId }: { networkId: P2PNetworkId }) {
  const common = { className: "sidebar-network-icon", "aria-hidden": true } as const;
  switch (networkId) {
    case "base": return <svg {...common} viewBox="0 0 24 24"><path fill="currentColor" d="M3 4.706c0-.585 0-.877.11-1.101c.106-.215.28-.39.496-.495C3.83 3 4.122 3 4.706 3h14.588c.585 0 .876 0 1.101.11c.215.105.389.28.494.495c.111.225.111.517.111 1.101v14.588c0 .585 0 .876-.11 1.101c-.106.215-.28.389-.495.494c-.225.111-.517.111-1.101.111H4.706c-.585 0-.876 0-1.101-.11a1.08 1.08 0 0 1-.494-.495C3 20.17 3 19.878 3 19.294z" /></svg>;
    case "bitcoin": return <svg {...common} viewBox="0 0 24 24"><path fill="currentColor" d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105C1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153l-1.315-.33l-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127l-1.32-.33l-.54 2.165q-.428-.1-.84-.2l-1.815-.45l-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314c.015.02-.96-.24-.96-.24l-.66 1.51l1.71.426l.93.242l-.54 2.19l1.32.327l.54-2.17c.36.1.705.19 1.05.273l-.51 2.154l1.32.33l.545-2.19c2.24.427 3.93.257 4.64-1.774c.57-1.637-.03-2.58-1.217-3.196c.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37m.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084z" /></svg>;
    case "ethereum": return <svg {...common} viewBox="0 0 24 24"><path fill="currentColor" d="M11.944 17.97L4.58 13.62L11.943 24l7.37-10.38l-7.372 4.35zM12.056 0L4.69 12.223l7.365 4.354l7.365-4.35z" /></svg>;
    case "ipfs": return <svg {...common} viewBox="0 0 24 24"><path fill="currentColor" d="M12 0L1.608 6v12L12 24l10.392-6V6zm-1.073 1.445a1.8 1.8 0 0 0 2.138 0l7.534 4.35a1.8 1.8 0 0 0 0 .403l-7.535 4.35a1.8 1.8 0 0 0-2.137 0l-7.536-4.35a1.8 1.8 0 0 0 0-.402zM21.324 7.4q.164.12.349.201v8.7a1.8 1.8 0 0 0-1.069 1.852l-7.535 4.35a1.8 1.8 0 0 0-.349-.2l-.009-8.653a1.8 1.8 0 0 0 1.07-1.851zm-18.648.048l7.535 4.35a1.8 1.8 0 0 0 1.069 1.852v8.7q-.186.081-.349.202l-7.535-4.35a1.8 1.8 0 0 0-1.069-1.852v-8.7a2 2 0 0 0 .35-.202z" /></svg>;
    case "xmtp": return <svg {...common} viewBox="0 0 462 462"><path fill="currentColor" d="M1 231C1 103.422 104.422 0 232 0C359.495 0 458 101.5 461 230C461 271 447 305.5 412 338C382.424 365.464 332 369.5 295.003 349C268.597 333.767 248.246 301.326 231 277.5L199 326.5H130L195 229.997L132 135H203L231.5 184L259.5 135H331L266 230c0 0 31 47.5 48 66c17 18.5 48 19 68 0c21.989-21.989 26.912-39.498 27-65C409.343 131.294 330.941 52 232 52C133.141 52 53 132.141 53 231C53 329.859 133.141 410 232 410c13.674 0 26.781-1.149 39.5-4l12 50.5C265.401 460.558 249.778 462 232 462C104.422 462 1 358.578 1 231Z" /></svg>;
  }
}

function SidebarCount({ loading, count }: { loading: boolean; count: number }) {
  return <span className="sidebar-count" aria-label={loading ? "Scanning" : `${count} records`}>
    {loading ? <LoaderCircle className="ui-spin" size={13} /> : count}
  </span>;
}

export function AppSidebar({ activeView, collapsed, counts, scanningCollectors, scanning, scannedAt, currentTime, onRunScan, onViewChange }: {
  activeView: ViewId;
  collapsed: boolean;
  counts: Record<string, number>;
  scanningCollectors: Set<ScanCollectorId>;
  scanning: boolean;
  scannedAt?: string;
  currentTime: number;
  onRunScan: () => void;
  onViewChange: (view: ViewId) => void;
}) {
  const [p2pCollapsed, setP2pCollapsed] = useState(false);
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const [fadeProgress, setFadeProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  
  const scanMeta = scannedAt ? `Last scan ${formatRelativeTime(scannedAt, currentTime)}` : "Not scanned";
  useEffect(() => {
    const target = scrollRef.current;
    if (!target) return;
    const updateScrollState = () => {
      const maxScroll = target.scrollHeight - target.clientHeight;
      if (maxScroll <= 1) {
        setFadeProgress(0);
        return;
      }
      const distanceToBottom = Math.max(0, maxScroll - target.scrollTop);
      const fade = Math.min(1, distanceToBottom / 72);
      setFadeProgress(fade);
    };
    updateScrollState();
    target.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      target.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [activeView, collapsed, counts, localCollapsed, p2pCollapsed]);
  
  return <aside className="sidebar">
    <div className="sidebar-body">
      <div ref={scrollRef} className="sidebar-scroll" style={{ ["--sidebar-fade-progress"]: fadeProgress } as CSSProperties}>
        <button className="sidebar-group-label sidebar-group-label--button" onClick={() => setLocalCollapsed(!localCollapsed)}>
          <span>Local network</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: localCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <nav className={localCollapsed ? "sidebar-section is-collapsed" : "sidebar-section"} aria-label="Local network views">
          <div className="sidebar-section__inner">
            {localViews.map(({ id, label, icon: Icon, collectors }) => <button
              aria-current={activeView === id ? "page" : undefined}
              data-tooltip={label}
              className={activeView === id ? "sidebar-item is-active" : "sidebar-item"}
              key={id}
              onClick={() => onViewChange(id)}
            ><Icon size={17} /><span>{label}</span><SidebarCount loading={collectors.some((collector) => scanningCollectors.has(collector))} count={counts[id] ?? 0} /></button>)}
          </div>
        </nav>
        <button className={localCollapsed ? "sidebar-group-label sidebar-group-label--button sidebar-group-label--spaced" : "sidebar-group-label sidebar-group-label--button sidebar-group-label--spaced has-spacing"} onClick={() => setP2pCollapsed(!p2pCollapsed)}>
          <span>P2P networks</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: p2pCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <nav className={p2pCollapsed ? "sidebar-section is-collapsed" : "sidebar-section"} aria-label="P2P network views">
          <div className="sidebar-section__inner">
            {p2pViews.map(({ id, label, networkId }) => <button
              aria-current={activeView === id ? "page" : undefined}
              data-tooltip={label}
              className={activeView === id ? "sidebar-item is-active" : "sidebar-item"}
              key={id}
              onClick={() => onViewChange(id)}
            ><P2PNetworkIcon networkId={networkId} /><span>{label}</span><SidebarCount loading={scanningCollectors.has(id as ScanCollectorId)} count={counts[id] ?? 0} /></button>)}
          </div>
        </nav>
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-scan-area">
          <Button
            className="sidebar-scan-button"
            variant="primary"
            size="md"
            disabled={scanning}
            onClick={onRunScan}
          >
            <span className="sidebar-scan-button__copy">
              <span className="sidebar-scan-button__label">
                {scanning ? <><LoaderCircle className="ui-spin sidebar-scan-button__spinner" size={14} aria-hidden="true" /><span className="sidebar-scan-button__label-text sidebar-scan-button__label-text--shimmer">Scanning…</span></> : <span className="sidebar-scan-button__label-text">Scan</span>}
              </span>
              <span className="sidebar-scan-button__meta">{scanMeta}</span>
            </span>
          </Button>
        </div>
      </div>
    </div>
  </aside>;
}
