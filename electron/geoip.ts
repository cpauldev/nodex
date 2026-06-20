import geoip from "geoip-lite";
import type { SignalRecord } from "./types.js";

const ipv4Pattern = /(?<![\d.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?![\d.])/g;

export function enrichGeoLocations(records: SignalRecord[]): SignalRecord[] {
  return records.map((record) => {
    const ip = findPublicIp(record);
    if (!ip) return record;

    const lookup = geoip.lookup(ip);
    if (!lookup) return record;
    const latitude = lookup?.ll?.[0];
    const longitude = lookup?.ll?.[1];
    if (typeof latitude !== "number" || typeof longitude !== "number") return record;

    return {
      ...record,
      geo: {
        ip,
        city: lookup.city || undefined,
        region: lookup.region || undefined,
        country: lookup.country || undefined,
        latitude,
        longitude,
        source: "geoip-lite"
      }
    };
  });
}

export function findPublicIp(record: SignalRecord): string | undefined {
  for (const value of recordSearchValues(record)) {
    for (const ip of value.match(ipv4Pattern) ?? []) {
      if (isPublicIpv4(ip)) return ip;
    }
  }
}

function recordSearchValues(record: SignalRecord): string[] {
  return [
    record.address,
    record.name,
    ...Object.values(record.details)
  ].flatMap((value) => value === null || value === undefined ? [] : [String(value)]);
}

export function isPublicIpv4(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;

  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51) return false;
  if (a === 203 && b === 0) return false;

  return true;
}
