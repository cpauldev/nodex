import { LoaderCircle } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { SignalRecord } from "../../types";
import { latencyTone, projectGeoPoint, recordLatency } from "../../presentation";
import worldMapNaturalSvg from "../../world-map-natural.svg?url";
import { Badge } from "../ui/Badge";

interface PeerCluster { id: string; x: number; y: number; records: SignalRecord[]; }
interface RenderedPeerCluster extends PeerCluster { entering: boolean; leaving: boolean; }

function averageLatency(records: SignalRecord[]) {
  const values = records.map(recordLatency).filter((value): value is number => value !== undefined);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : undefined;
}

function clusterPeers(records: Array<SignalRecord & { geo: NonNullable<SignalRecord["geo"]> }>): PeerCluster[] {
  const clusters: PeerCluster[] = [];
  // Scan results are status-sorted upstream. Sort by stable record ID so a
  // latency/status change cannot change a cluster's React key.
  for (const record of [...records].sort((left, right) => left.id.localeCompare(right.id))) {
    const point = projectGeoPoint(record.geo.latitude, record.geo.longitude);
    const cluster = clusters.find((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < 4);
    if (cluster) {
      const count = cluster.records.length;
      cluster.x = (cluster.x * count + point.x) / (count + 1);
      cluster.y = (cluster.y * count + point.y) / (count + 1);
      cluster.records.push(record);
    } else clusters.push({ id: record.id, x: point.x, y: point.y, records: [record] });
  }
  return clusters;
}

function hasSameClusterData(current: RenderedPeerCluster, next: PeerCluster) {
  return !current.leaving
    && current.x === next.x
    && current.y === next.y
    && current.records.length === next.records.length
    && current.records.every((record, index) => record === next.records[index]);
}

const PeerClusterMarker = memo(function PeerClusterMarker({ cluster, open, closing, onSelect, onEntered, onActivate, onDeactivate, onPopoverExited }: {
  cluster: RenderedPeerCluster;
  open: boolean;
  closing: boolean;
  onSelect: (record: SignalRecord) => void;
  onEntered: (id: string) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onPopoverExited: (id: string) => void;
}) {
  const latency = averageLatency(cluster.records);
  const tone = latencyTone(latency);
  const renderPopover = open || closing;
  return <div className={["peer-cluster", `peer-cluster--${tone}`, open ? "is-open" : "", closing ? "is-closing" : "", cluster.entering ? "is-entering" : "", cluster.leaving ? "is-leaving" : "", cluster.x < 18 ? "is-near-left" : cluster.x > 82 ? "is-near-right" : "", cluster.y < 36 ? "is-near-top" : ""].filter(Boolean).join(" ")}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) onDeactivate(cluster.id);
    }}
    onFocus={() => onActivate(cluster.id)}
    onMouseEnter={() => onActivate(cluster.id)}
    onMouseLeave={(event) => {
      if (!event.currentTarget.contains(document.activeElement)) onDeactivate(cluster.id);
    }}
    onAnimationEnd={(event) => {
      if (event.target === event.currentTarget && cluster.entering) onEntered(cluster.id);
    }}
    style={{ "--cluster-x": `${cluster.x}%`, "--cluster-y": `${cluster.y}%` } as CSSProperties}>
    <button className={`peer-cluster__marker ui-tone--${tone}`} aria-label={`${cluster.records.length} peers near this location`}>{cluster.records.length}</button>
    {renderPopover ? <div className="peer-cluster__popover" onAnimationEnd={(event) => {
      if (closing && event.target === event.currentTarget) onPopoverExited(cluster.id);
    }}>
      {cluster.records.length > 1 ? <header><strong>{cluster.records.length} peers</strong><span>{latency === undefined ? "No latency" : `${Math.round(latency)} ms average`}</span></header> : null}
      <div>{cluster.records.map((record) => <button key={record.id} onClick={() => onSelect(record)}>
        <span><strong>{record.name}</strong><small>{record.geo ? [record.geo.city, record.geo.region, record.geo.country].filter(Boolean).join(", ") : "Unknown location"}</small></span>
        <Badge tone={latencyTone(recordLatency(record))}>{recordLatency(record) === undefined ? record.status : `${recordLatency(record)} ms`}</Badge>
      </button>)}</div>
    </div> : null}
  </div>;
});

export const PeerMap = memo(function PeerMap({ records, loading, onSelect }: { records: SignalRecord[]; loading: boolean; onSelect: (record: SignalRecord) => void }) {
  const located = useMemo(() => records.filter((record): record is SignalRecord & { geo: NonNullable<SignalRecord["geo"]> } => Boolean(record.geo)), [records]);
  const clusters = useMemo(() => clusterPeers(located), [located]);
  const [rendered, setRendered] = useState<RenderedPeerCluster[]>(() => clusters.map((cluster) => ({ ...cluster, entering: true, leaving: false })));
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);
  const [closingClusterId, setClosingClusterId] = useState<string | null>(null);
  const timers = useRef(new Map<string, number>());
  const movementFrames = useRef(new Map<string, number>());
  const markClusterEntered = useCallback((id: string) => {
    setRendered((current) => current.map((cluster) => cluster.id === id ? { ...cluster, entering: false } : cluster));
  }, []);
  const activateCluster = useCallback((id: string) => {
    setActiveClusterId(id);
    setClosingClusterId((current) => current === id ? null : current);
  }, []);
  const deactivateCluster = useCallback((id: string) => {
    setActiveClusterId((current) => current === id ? null : current);
    setClosingClusterId(id);
  }, []);
  const removeClosingPopover = useCallback((id: string) => {
    setClosingClusterId((current) => current === id ? null : current);
  }, []);

  useEffect(() => {
    const ids = new Set(clusters.map((cluster) => cluster.id));
    setRendered((current) => {
      const currentById = new Map(current.map((cluster) => [cluster.id, cluster]));
      const next = clusters.map((cluster) => {
        const previous = currentById.get(cluster.id);
        if (previous && hasSameClusterData(previous, cluster)) return previous;
        return { ...cluster, entering: previous?.entering ?? true, leaving: false };
      });
      for (const cluster of current) {
        if (ids.has(cluster.id)) continue;
        next.push({ ...cluster, entering: false, leaving: true });
        const recordIds = new Set(cluster.records.map((record) => record.id));
        const destination = clusters.find((candidate) => candidate.records.some((record) => recordIds.has(record.id)));
        if (destination && !movementFrames.current.has(cluster.id)) {
          movementFrames.current.set(cluster.id, window.requestAnimationFrame(() => {
            setRendered((latest) => latest.map((candidate) => candidate.id === cluster.id && candidate.leaving
              ? { ...candidate, x: destination.x, y: destination.y }
              : candidate));
            movementFrames.current.delete(cluster.id);
          }));
        }
        if (!timers.current.has(cluster.id)) timers.current.set(cluster.id, window.setTimeout(() => {
          setRendered((latest) => latest.filter(({ id }) => id !== cluster.id));
          timers.current.delete(cluster.id);
        }, 220));
      }
      return next;
    });
  }, [clusters]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    for (const frame of movementFrames.current.values()) window.cancelAnimationFrame(frame);
  }, []);

  return <div className="peer-map-panel">
    <div className="peer-map" role="img" aria-label={`Map of ${located.length} located peers`}>
      <img src={worldMapNaturalSvg} alt="" aria-hidden="true" />
      {rendered.map((cluster) => <PeerClusterMarker key={cluster.id} cluster={cluster} open={activeClusterId === cluster.id} closing={closingClusterId === cluster.id}
        onSelect={onSelect} onEntered={markClusterEntered} onActivate={activateCluster} onDeactivate={deactivateCluster} onPopoverExited={removeClosingPopover} />)}
      {loading ? <span className="peer-map__loading"><LoaderCircle className="ui-spin" size={16} /></span> : null}
    </div>
    <footer className="peer-map__footer"><span>{located.length} of {records.length} peers have approximate GeoIP locations</span>
      <div><Badge tone="success">Fast</Badge><Badge tone="warning">Medium</Badge><Badge tone="danger">Slow</Badge><Badge>Unknown</Badge></div>
    </footer>
  </div>;
});
