import type { SignalRecord } from "./types";

function flatten(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (typeof value === "object") return Object.entries(value).flatMap(([key, item]) => [key, ...flatten(item)]);
  return [String(value)];
}

export function matchesRecord(record: SignalRecord, query: string, labels: string[]): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [...labels, ...flatten(record)].some((value) => value.toLocaleLowerCase().includes(normalized));
}
