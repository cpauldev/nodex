import type { SignalRecord } from "./types.js";
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
