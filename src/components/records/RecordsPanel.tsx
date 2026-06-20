import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LoaderCircle, Search } from "lucide-react";
import { memo } from "react";
import type { ScanCollectorId, SignalRecord } from "../../types";
import type { SortKey, SortState } from "../../presentation";
import { KindBadge, SignalBadge, StatusBadge } from "./RecordBadges";

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

const RecordRow = memo(function RecordRow({ record, refreshing, onSelect }: { record: SignalRecord; refreshing: boolean; onSelect: (record: SignalRecord) => void }) {
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
    <td><KindBadge record={record} /></td>
    <td className="records-primary">{record.name}</td>
    <td className="records-mono">{record.address ?? "—"}</td>
    <td>{refreshing ? <span className="records-refreshing" aria-label="Refreshing status"><LoaderCircle className="ui-spin" size={15} /></span> : record.strength !== undefined ? <SignalBadge value={record.strength} /> : record.status ? <StatusBadge record={record} /> : "—"}</td>
    <td><ChevronRight className="records-open-indicator" size={16} aria-hidden="true" /></td>
  </tr>;
});

export function RecordsPanel({ records, totalRecords, page, pageCount, onPageChange, query, onQueryChange, sort, onSort, loading, scanningCollectors, refreshedRecordIds, onSelect, map, toolbarRight }: {
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
  onSelect: (record: SignalRecord) => void;
  map?: React.ReactNode;
  toolbarRight?: React.ReactNode;
}) {
  return <section className="records-panel">
    <div className="records-toolbar">
      <label className="records-search">
        <Search size={16} aria-hidden="true" />
        <input aria-label="Search records" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search all record data…" />
      </label>
      {toolbarRight ? <div className="records-toolbar__right">{toolbarRight}</div> : null}
    </div>
    {map}
    <div className="records-table-wrap"><table className="records-table"><thead><tr>
      <SortHeader label="Type" sortKey="kind" sort={sort} onSort={onSort} />
      <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} />
      <SortHeader label="Address" sortKey="address" sort={sort} onSort={onSort} />
      <SortHeader label="Status" sortKey="strength" sort={sort} onSort={onSort} />
      <th><span className="sr-only">Open details</span></th>
    </tr></thead><tbody>
      {records.map((record) => {
        const refreshing = record.kind === "p2p" && !refreshedRecordIds.has(record.id) && scanningCollectors.has(`p2p-${record.provenance.toLowerCase().split(" ")[0]}` as ScanCollectorId);
        return <RecordRow key={record.id} record={record} refreshing={refreshing} onSelect={onSelect} />;
      })}
      {loading ? <SkeletonRows count={Math.min(records.length > 0 ? 2 : 5, 100 - records.length)} /> : null}
    </tbody></table>
    {!loading && records.length === 0 ? <div className="records-empty">No records match this view.</div> : null}
    </div>
    {pageCount > 1 ? <nav className="records-pagination" aria-label="Table pagination">
      <span>{(page - 1) * 100 + 1}–{Math.min(page * 100, totalRecords)} of {totalRecords}</span>
      <div>
        <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={16} /></button>
        <span>Page {page} of {pageCount}</span>
        <button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight size={16} /></button>
      </div>
    </nav> : null}
  </section>;
}
