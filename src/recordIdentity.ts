import type { SignalRecord } from "./types";

function equalValues(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

export function recordsEqual(left: SignalRecord, right: SignalRecord) {
  return left.id === right.id
    && left.kind === right.kind
    && left.recordClass === right.recordClass
    && left.provenance === right.provenance
    && left.name === right.name
    && left.address === right.address
    && left.strength === right.strength
    && left.status === right.status
    && left.security === right.security
    && left.channel === right.channel
    && left.band === right.band
    && left.manufacturer === right.manufacturer
    && equalValues(left.details, right.details)
    && left.geo?.ip === right.geo?.ip
    && left.geo?.city === right.geo?.city
    && left.geo?.region === right.geo?.region
    && left.geo?.country === right.geo?.country
    && left.geo?.latitude === right.geo?.latitude
    && left.geo?.longitude === right.geo?.longitude
    && left.geo?.source === right.geo?.source;
}

export function reuseUnchangedRecords(previous: SignalRecord[], next: SignalRecord[]) {
  const previousById = new Map(previous.map((record) => [record.id, record]));
  return next.map((record) => {
    const prior = previousById.get(record.id);
    return prior && recordsEqual(prior, record) ? prior : record;
  });
}
