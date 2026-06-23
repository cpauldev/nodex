import type { SignalRecord, RadioFilters } from "./types.js";
import { runPowerShell } from "./windows.js";

async function powershell(script: string): Promise<string> {
  const { stdout } = await runPowerShell(script);
  return stdout.trim();
}

function parseJson<T>(value: string): T[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as T | T[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

type WifiRow = {
  SSID?: string;
  BSSID?: string;
  Signal?: number;
  Channel?: number;
  Authentication?: string;
  Encryption?: string;
  RadioType?: string;
  Connected?: boolean;
  SavedProfile?: boolean;
};

export async function collectWifi(): Promise<SignalRecord[]> {
  const script = String.raw`
$text = netsh wlan show networks mode=bssid
$profileText = netsh wlan show profiles
$profiles = @($profileText | ForEach-Object { if ($_ -match ':\s*(.+)$' -and $_ -match 'Profile') { $matches[1].Trim() } } | Where-Object { $_ })
$interfaceText = netsh wlan show interfaces
$connectedSsid = $null
foreach ($line in $interfaceText) {
  if ($line -match '^\s*SSID\s*:\s*(.+)$' -and $line -notmatch 'BSSID') { $connectedSsid = $matches[1].Trim(); break }
}
$rows = @()
$ssid = $null; $auth = $null; $encryption = $null; $radio = $null; $bssid = $null; $signal = $null; $channel = $null
foreach ($line in $text) {
  if ($line -match '^\s*SSID\s+\d+\s*:\s*(.*)$') { $ssid = $matches[1].Trim(); $auth=$null; $encryption=$null }
  elseif ($line -match '^\s*Authentication\s*:\s*(.*)$') { $auth = $matches[1].Trim() }
  elseif ($line -match '^\s*Encryption\s*:\s*(.*)$') { $encryption = $matches[1].Trim() }
  elseif ($line -match '^\s*BSSID\s+\d+\s*:\s*(.*)$') {
    if ($bssid) { $rows += [pscustomobject]@{SSID=$ssid;BSSID=$bssid;Signal=$signal;Channel=$channel;Authentication=$auth;Encryption=$encryption;RadioType=$radio;Connected=($ssid -eq $connectedSsid);SavedProfile=($profiles -contains $ssid)} }
    $bssid=$matches[1].Trim(); $signal=$null; $channel=$null; $radio=$null
  }
  elseif ($line -match '^\s*Signal\s*:\s*(\d+)%') { $signal = [int]$matches[1] }
  elseif ($line -match '^\s*Radio type\s*:\s*(.*)$') { $radio = $matches[1].Trim() }
  elseif ($line -match '^\s*Channel\s*:\s*(\d+)') { $channel = [int]$matches[1] }
}
if ($bssid) { $rows += [pscustomobject]@{SSID=$ssid;BSSID=$bssid;Signal=$signal;Channel=$channel;Authentication=$auth;Encryption=$encryption;RadioType=$radio;Connected=($ssid -eq $connectedSsid);SavedProfile=($profiles -contains $ssid)} }
$rows | ConvertTo-Json -Compress
`;
  return parseJson<WifiRow>(await powershell(script)).map((row, index) => ({
    id: `wifi-${row.BSSID ?? index}`,
    kind: "wifi",
    recordClass: "observed",
    provenance: "Live Wi-Fi scan",
    name: row.SSID || "(hidden network)",
    address: row.BSSID,
    strength: row.Signal,
    status: row.Connected ? "Connected" : "In range",
    security: [row.Authentication, row.Encryption].filter(Boolean).join(" / "),
    channel: row.Channel?.toString(),
    band: row.Channel ? (row.Channel <= 14 ? "2.4 GHz" : row.Channel <= 177 ? "5 GHz" : "6 GHz") : undefined,
    details: {
      "Radio type": row.RadioType ?? null,
      Authentication: row.Authentication ?? null,
      Encryption: row.Encryption ?? null,
      "Saved profile": row.SavedProfile ?? false,
      Connected: row.Connected ?? false
    }
  }));
}

type DeviceRow = {
  FriendlyName?: string;
  InstanceId?: string;
  Status?: string;
  Class?: string;
  Present?: boolean;
};

export async function collectBluetooth(): Promise<SignalRecord[]> {
  const script = String.raw`
Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |
  Select-Object FriendlyName,InstanceId,Status,Class,Present |
  ConvertTo-Json -Compress
`;
  return parseJson<DeviceRow>(await powershell(script)).map((row, index) => ({
    id: `bluetooth-${row.InstanceId ?? index}`,
    kind: "bluetooth",
    recordClass: "known",
    provenance: "Windows device inventory",
    name: row.FriendlyName || "(unnamed Bluetooth device)",
    address: row.InstanceId?.match(/([0-9A-F]{12})/i)?.[1]?.match(/.{2}/g)?.join(":"),
    status: row.Status === "OK" ? "Known / available" : row.Status || "Known",
    details: {
      "Instance ID": row.InstanceId ?? null,
      Present: row.Present ?? null,
      Class: row.Class ?? null,
      Note: "Windows known-device inventory; live BLE advertisements require the optional native collector."
    }
  }));
}

type NeighborRow = {
  IPAddress?: string;
  LinkLayerAddress?: string;
  State?: string;
  InterfaceAlias?: string;
};

export async function collectNetwork(): Promise<SignalRecord[]> {
  const script = String.raw`
Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.LinkLayerAddress -and $_.LinkLayerAddress -ne '00-00-00-00-00-00' } |
  Select-Object IPAddress,LinkLayerAddress,State,InterfaceAlias |
  ConvertTo-Json -Compress
`;
  return parseJson<NeighborRow>(await powershell(script)).map((row, index) => {
    const isMulticast = row.IPAddress?.startsWith("224.") || row.IPAddress?.startsWith("239.");
    return {
    id: `network-${row.InterfaceAlias ?? "unknown"}-${row.IPAddress ?? index}-${row.LinkLayerAddress ?? "none"}`,
    kind: "network",
    recordClass: isMulticast ? "protocol" : "neighbor",
    provenance: isMulticast ? "Windows multicast table" : "Windows neighbor cache",
    name: isMulticast ? multicastName(row.IPAddress) : row.IPAddress || "(unknown address)",
    address: row.LinkLayerAddress?.replaceAll("-", ":"),
    status: isMulticast ? "Multicast group" : row.State || "Neighbor",
    details: {
      "IP address": row.IPAddress ?? null,
      Interface: row.InterfaceAlias ?? null,
      "Neighbor state": isMulticast ? null : row.State ?? null
    }
  };
  });
}

function multicastName(address?: string): string {
  if (address === "224.0.0.251") return "mDNS";
  if (address === "239.255.255.250") return "SSDP";
  if (address === "224.0.0.22") return "IGMP";
  return address ? `Multicast ${address}` : "Multicast group";
}

type AdapterRow = {
  Name?: string;
  InterfaceDescription?: string;
  Status?: string;
  MacAddress?: string;
  LinkSpeed?: string;
};

export async function collectAdapters(): Promise<SignalRecord[]> {
  const script = String.raw`
Get-NetAdapter -ErrorAction SilentlyContinue |
  Select-Object Name,InterfaceDescription,Status,MacAddress,LinkSpeed |
  ConvertTo-Json -Compress
`;
  return parseJson<AdapterRow>(await powershell(script)).map((row, index) => ({
    id: `adapter-${row.Name ?? index}`,
    kind: "adapter",
    recordClass: "infrastructure",
    provenance: "Windows adapter inventory",
    name: row.Name || row.InterfaceDescription || "(unnamed adapter)",
    address: row.MacAddress?.replaceAll("-", ":"),
    status: row.Status || "Unknown",
    details: {
      Description: row.InterfaceDescription ?? null,
      "Link speed": row.LinkSpeed ?? null,
      Status: row.Status ?? null
    }
  }));
}



type RadioBrowserStation = {
  stationuuid: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  country?: string;
  name?: string;
  codec?: string;
  bitrate?: number;
  tags?: string;
  language?: string;
  favicon?: string;
  votes?: number;
  state?: string;
};

export const RADIO_DIRECTORY_LIMITS = [40, 100, 250, 500] as const;
export type RadioDirectoryLimit = typeof RADIO_DIRECTORY_LIMITS[number];

export function isRadioDirectoryLimit(value: unknown): value is RadioDirectoryLimit {
  return typeof value === "number" && RADIO_DIRECTORY_LIMITS.includes(value as RadioDirectoryLimit);
}

export const DEFAULT_RADIO_FILTERS: RadioFilters = {
  tag: "",
  countrycode: "",
  codec: "",
  bitrateMin: "",
  hidebroken: false,
};

const radioCache = new Map<string, SignalRecord[]>();

async function prefetchRadioPage(limit: RadioDirectoryLimit, offset: number, filters: RadioFilters = DEFAULT_RADIO_FILTERS): Promise<void> {
  const cacheKey = `${limit}-${offset}-${filters.tag}-${filters.countrycode}-${filters.codec}-${filters.bitrateMin}-${filters.hidebroken}`;
  if (radioCache.has(cacheKey)) return;

  const mirrors = [
    "https://all.api.radio-browser.info",
    "https://de1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
    "https://fr1.api.radio-browser.info"
  ];

  let stations: RadioBrowserStation[] = [];
  for (const mirror of mirrors) {
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset), order: "votes", reverse: "true" });
      if (filters.tag) params.set("tag", filters.tag);
      if (filters.countrycode) params.set("countrycode", filters.countrycode);
      if (filters.codec) params.set("codec", filters.codec);
      if (filters.bitrateMin) params.set("bitrateMin", filters.bitrateMin);
      if (filters.hidebroken) params.set("hidebroken", "true");
      const res = await fetch(`${mirror}/json/stations/search?${params}`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        stations = await res.json();
        if (stations && stations.length > 0) break;
      }
    } catch {
      continue;
    }
  }

  const urlRewrites: Record<string, string> = {
    "http://livestreaming.esradio.fm/stream64.mp3": "https://libertaddigital-radio-live1.flumotion.com/libertaddigital/ld-live1-low.mp3"
  };

  const records: (SignalRecord | null)[] = stations.map((s) => {
    let resolvedUrl = s.url_resolved || s.url || "";
    if (!resolvedUrl) return null;
    if (urlRewrites[resolvedUrl]) {
      resolvedUrl = urlRewrites[resolvedUrl];
    }

    let hostname = "";
    try {
      hostname = new URL(resolvedUrl).hostname;
    } catch {
      hostname = resolvedUrl;
    }

    const record: SignalRecord = {
      id: `radio-${s.stationuuid}`,
      kind: "radio" as const,
      recordClass: "observed" as const,
      provenance: s.country || "Global Radio",
      name: s.name ? s.name.trim() : "Unknown Station",
      address: hostname,
      status: "Unverified",
      details: {
        "Stream URL": resolvedUrl,
        "Homepage": s.homepage || null,
        "Tags": s.tags || null,
        "Country": s.country || "Unknown",
        "Language": s.language || "Unknown",
        "Bitrate": s.bitrate ? `${s.bitrate} kbps` : null,
        "Codec": s.codec || null,
        "Latency (ms)": null,
        "Reachability": "Unverified",
        "Favicon": s.favicon || null,
        "Votes": s.votes || null,
        "State": s.state || null
      }
    };
    return record;
  });

  const validRecords = records.filter((r) => r !== null) as SignalRecord[];
  radioCache.set(cacheKey, validRecords);
}

export async function collectRadio(
  limit: RadioDirectoryLimit = 100,
  offset = 0,
  filters: RadioFilters = DEFAULT_RADIO_FILTERS,
  onRecord?: (record: SignalRecord) => void
): Promise<SignalRecord[]> {
  const cacheKey = `${limit}-${offset}-${filters.tag}-${filters.countrycode}-${filters.codec}-${filters.bitrateMin}-${filters.hidebroken}`;
  if (radioCache.has(cacheKey)) {
    const cachedRecords = radioCache.get(cacheKey)!;
    if (onRecord) {
      for (const record of cachedRecords) {
        onRecord(record);
      }
    }
    // Eagerly prefetch the next and previous pages in the background
    const nextOffset = offset + limit;
    void prefetchRadioPage(limit, nextOffset, filters);
    if (offset - limit >= 0) {
      void prefetchRadioPage(limit, offset - limit, filters);
    }
    return cachedRecords;
  }

  const mirrors = [
    "https://all.api.radio-browser.info",
    "https://de1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
    "https://fr1.api.radio-browser.info"
  ];

  let stations: RadioBrowserStation[] = [];
  for (const mirror of mirrors) {
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset), order: "votes", reverse: "true" });
      if (filters.tag) params.set("tag", filters.tag);
      if (filters.countrycode) params.set("countrycode", filters.countrycode);
      if (filters.codec) params.set("codec", filters.codec);
      if (filters.bitrateMin) params.set("bitrateMin", filters.bitrateMin);
      if (filters.hidebroken) params.set("hidebroken", "true");
      const res = await fetch(`${mirror}/json/stations/search?${params}`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        stations = await res.json();
        if (stations && stations.length > 0) break;
      }
    } catch {
      continue;
    }
  }

  const urlRewrites: Record<string, string> = {
    "http://livestreaming.esradio.fm/stream64.mp3": "https://libertaddigital-radio-live1.flumotion.com/libertaddigital/ld-live1-low.mp3"
  };

  const records: (SignalRecord | null)[] = stations.map((s) => {
    let resolvedUrl = s.url_resolved || s.url || "";
    if (!resolvedUrl) return null;
    if (urlRewrites[resolvedUrl]) {
      resolvedUrl = urlRewrites[resolvedUrl];
    }

    let hostname = "";
    try {
      hostname = new URL(resolvedUrl).hostname;
    } catch {
      hostname = resolvedUrl;
    }

    const record: SignalRecord = {
      id: `radio-${s.stationuuid}`,
      kind: "radio" as const,
      recordClass: "observed" as const,
      provenance: s.country || "Global Radio",
      name: s.name ? s.name.trim() : "Unknown Station",
      address: hostname,
      status: "Unverified",
      details: {
        "Stream URL": resolvedUrl,
        "Homepage": s.homepage || null,
        "Tags": s.tags || null,
        "Country": s.country || "Unknown",
        "Language": s.language || "Unknown",
        "Bitrate": s.bitrate ? `${s.bitrate} kbps` : null,
        "Codec": s.codec || null,
        "Latency (ms)": null,
        "Reachability": "Unverified",
        "Favicon": s.favicon || null,
        "Votes": s.votes || null,
        "State": s.state || null
      }
    };
    onRecord?.(record);
    return record;
  });

  const validRecords = records.filter((r) => r !== null) as SignalRecord[];
  radioCache.set(cacheKey, validRecords);

  // Eagerly prefetch the next and previous pages in the background
  const nextOffset = offset + limit;
  void prefetchRadioPage(limit, nextOffset, filters);
  if (offset - limit >= 0) {
    void prefetchRadioPage(limit, offset - limit, filters);
  }

  return validRecords;
}
