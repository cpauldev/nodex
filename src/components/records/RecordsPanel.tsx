import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LoaderCircle, Music, Search } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { ScanCollectorId, SignalRecord } from "../../types";
import type { SortKey, SortState } from "../../presentation";
import { KindBadge, SignalBadge, StatusBadge } from "./RecordBadges";
import { Favicon } from "./faviconCache";

function SortHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  return <th aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
    <button className={active ? "records-sort is-active" : "records-sort"} aria-label={`Sort by ${label}`} onClick={() => onSort(sortKey)}>
      {label}{active ? sort.direction === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} /> : null}
    </button>
  </th>;
}

function SkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => <tr className="records-skeleton-row" key={index} aria-hidden="true">
    <td><span className="records-skeleton records-skeleton--pill" /></td>
    <td><span className="records-skeleton records-skeleton--name" /></td>
    <td><span className="records-skeleton records-skeleton--address" /></td>
    <td><span className="records-skeleton records-skeleton--status" /></td><td />
  </tr>);
}

function TableFavicon({ record }: { record: SignalRecord }) {
  const favicon = (record.details["Favicon"] || record.details["favicon"]) as string;
  return <Favicon url={favicon} seed={record.name} wrapperClassName="favicon-wrapper"
    wrapperStyle={{ position: "relative", width: "32px", height: "32px", borderRadius: "6px", flexShrink: 0 }}
    imageStyle={{ width: "32px", height: "32px", borderRadius: "6px", objectFit: "cover", background: "var(--color-surface-raised)", display: "block" }}
    fallback={<Music size={16} />}
  />;
}

const RecordRow = memo(function RecordRow({ record, refreshing, selectedRecordId, playingStatus, onSelect }: { record: SignalRecord; refreshing: boolean; selectedRecordId?: string; playingStatus?: string; onSelect: (record: SignalRecord) => void }) {
  const isTunedIn = record.id === selectedRecordId;

  return <tr
    aria-label={`Open details for ${record.name}`}
    onClick={() => onSelect(record)}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(record);
      }
    }}
    role="button"
    tabIndex={0}
  >
    <td><KindBadge record={record} isTunedIn={isTunedIn} playingStatus={playingStatus} /></td>
    <td className="records-primary">
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {record.kind === "radio" && <TableFavicon record={record} />}
        <span>{record.name}</span>
      </div>
    </td>
    <td className="records-mono">{record.address ?? "—"}</td>
    <td>{refreshing ? <span className="records-refreshing" aria-label="Refreshing status"><LoaderCircle className="ui-spin" size={15} /></span> : record.strength !== undefined ? <SignalBadge value={record.strength} /> : record.status ? <StatusBadge record={record} /> : "—"}</td>
    <td><ChevronRight className="records-open-indicator" size={16} aria-hidden="true" /></td>
  </tr>;
});

export function RecordsPanel({ records, totalRecords, page, pageCount, onPageChange, query, onQueryChange, sort, onSort, loading, scanningCollectors, refreshedRecordIds, selectedRecordId, playingStatus, onSelect, map, toolbarRight }: {
  records: SignalRecord[];
  totalRecords: number;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  query: string;
  onQueryChange: (value: string) => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
  loading: boolean;
  scanningCollectors: Set<ScanCollectorId>;
  refreshedRecordIds: Set<string>;
  selectedRecordId?: string;
  playingStatus?: string;
  onSelect: (record: SignalRecord) => void;
  map?: React.ReactNode;
  toolbarRight?: React.ReactNode;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableInView, setTableInView] = useState(false);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const observer = new IntersectionObserver(([entry]) => setTableInView(entry.isIntersecting), { threshold: 0.08 });
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return <section className="records-panel">
    <div className="records-toolbar">
      <label className="records-search">
        <Search size={16} aria-hidden="true" />
        <input aria-label="Search records" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search all record data…" />
      </label>
      {toolbarRight ? <div className="records-toolbar__right">{toolbarRight}</div> : null}
    </div>
    {map}
    <div className="records-table-wrap"><table className="records-table" ref={tableRef}><thead><tr>
      <SortHeader label="Type" sortKey="kind" sort={sort} onSort={onSort} />
      <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} />
      <SortHeader label="Address" sortKey="address" sort={sort} onSort={onSort} />
      <SortHeader label="Status" sortKey="strength" sort={sort} onSort={onSort} />
      <th><span className="sr-only">Open details</span></th>
    </tr></thead><tbody>
      {records.map((record) => {
        const refreshing = record.kind === "p2p" && !refreshedRecordIds.has(record.id) && scanningCollectors.has(`p2p-${record.provenance.toLowerCase().split(" ")[0]}` as ScanCollectorId);
        return <RecordRow key={record.id} record={record} refreshing={refreshing} selectedRecordId={selectedRecordId} playingStatus={playingStatus} onSelect={onSelect} />;
      })}
      {loading ? <SkeletonRows count={Math.min(2, 100 - records.length)} /> : null}
    </tbody>{pageCount > 1 ? <tfoot className={`records-pagination-footer${tableInView ? " is-visible" : ""}`}><tr><td colSpan={5}>
      <nav className={`records-pagination${tableInView ? " is-visible" : ""}`} aria-label="Table pagination">
        <span className="records-pagination__range">{(page - 1) * 100 + 1}–{Math.min(page * 100, totalRecords)} of {totalRecords}</span>
        <div>
          <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={16} /></button>
          <span className="records-pagination__page">Page {page} of {pageCount}</span>
          <button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight size={16} /></button>
        </div>
      </nav>
    </td></tr></tfoot> : null}</table>
    {!loading && records.length === 0 ? <div className="records-empty">No records match this view.</div> : null}
    </div>
  </section>;
}
