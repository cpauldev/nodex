import { useMemo } from "react";
import type { SignalRecord } from "../../types";
import { latencyTone, projectGeoPoint, recordLatency } from "../../presentation";
import { buildMetadataSections } from "../../detailPresentation";
import worldMapNaturalSvg from "../../world-map-natural.svg?url";
import { Drawer } from "../ui/Drawer";
import { SectionLabel } from "../ui/SectionLabel";
import { KindBadge } from "../records/RecordBadges";
import { CopyableMetadataTable, type MetadataRow } from "./CopyableMetadataTable";
import { RecordActionPanel } from "./RecordActionPanel";

function GeoMapCard({ record }: { record: SignalRecord }) {
  if (!record.geo) return null;
  const point = projectGeoPoint(record.geo.latitude, record.geo.longitude);
  const location = [record.geo.city, record.geo.region, record.geo.country].filter(Boolean).join(", ") || "Unknown location";
  const rows: MetadataRow[] = [["Location", location], ["IP address", record.geo.ip], ["Coordinates", `${record.geo.latitude.toFixed(2)}, ${record.geo.longitude.toFixed(2)}`]];
  return <section className="geo-card" aria-label={`Approximate IP location for ${record.geo.ip}`}>
    <div className="geo-card__map" role="img" aria-label={`Approximate GeoIP location at ${record.geo.latitude.toFixed(2)}, ${record.geo.longitude.toFixed(2)}`}>
      <img src={worldMapNaturalSvg} alt="" aria-hidden="true" />
      <span className={`geo-card__pin ui-tone--${latencyTone(recordLatency(record))}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} />
    </div>
    <CopyableMetadataTable rows={rows} />
    <p className="geo-card__note">Approximate GeoIP region, not the physical location of a device.</p>
  </section>;
}

export function RecordDrawer({ record, onClose, onChanged }: { record: SignalRecord; onClose: () => void; onChanged: () => Promise<void> }) {
  const sections = useMemo(() => buildMetadataSections(record), [record]);
  return <Drawer title={record.name} description={<KindBadge record={record} />} onClose={onClose}>
    <RecordActionPanel record={record} onChanged={onChanged} />
    <GeoMapCard record={record} />
    <div className="detail-sections">{sections.map((section) => <section key={section.title}>
      <SectionLabel>{section.title}</SectionLabel>
      <CopyableMetadataTable rows={section.rows} />
    </section>)}</div>
  </Drawer>;
}
