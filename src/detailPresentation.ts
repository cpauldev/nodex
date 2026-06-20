import type { SignalRecord } from "./types";

export type MetadataRow = readonly [label: string, value: string];

export function buildMetadataSections(record: SignalRecord) {
  const hidden = new Set([
    "saved profile", "connected", "name", "id",
    ...(record.security ? ["authentication", "encryption"] : [])
  ]);
  const filter = (rows: Array<[string, string | number | boolean | null | undefined]>): MetadataRow[] =>
    rows.filter(([label, value], index) =>
      value !== null &&
      value !== undefined &&
      value !== "" &&
      !hidden.has(label.toLowerCase()) &&
      rows.findIndex(([other]) => other.toLowerCase() === label.toLowerCase()) === index
    ).map(([label, value]) => [label, String(value)]);

  const primaryRows: Array<[string, string | number | boolean | null | undefined]> = [["Address", record.address]];
  if (record.strength !== undefined) primaryRows.push(["Signal strength", `${record.strength}%`]);
  else if (record.status) primaryRows.push(["Status", record.status]);

  return [
    { title: "Network", rows: filter(primaryRows) },
    { title: "Technical details", rows: filter([["Security", record.security], ["Band", record.band], ["Channel", record.channel], ["Manufacturer", record.manufacturer]]) },
    { title: "Additional information", rows: filter(Object.entries(record.details)) }
  ].filter((section) => section.rows.length > 0);
}
