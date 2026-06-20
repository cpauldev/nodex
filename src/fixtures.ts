import type { ScanResult } from "./types";

export const fixtureScan: ScanResult = {
  scannedAt: new Date().toISOString(),
  durationMs: 428,
  warnings: [],
  records: [
    {
      id: "wifi-1",
      kind: "wifi",
      recordClass: "observed",
      provenance: "Live Wi-Fi scan",
      name: "Studio Network",
      address: "84:3A:4B:12:9C:10",
      strength: 92,
      status: "Connected",
      security: "WPA2-Personal / CCMP",
      channel: "36",
      band: "5 GHz",
      details: { "Radio type": "802.11ax", Authentication: "WPA2-Personal", Encryption: "CCMP", "Saved profile": true, Connected: true }
    },
    {
      id: "wifi-2",
      kind: "wifi",
      recordClass: "observed",
      provenance: "Live Wi-Fi scan",
      name: "(hidden network)",
      address: "02:18:4A:DD:20:B1",
      strength: 38,
      status: "In range",
      security: "WPA3-Personal / GCMP",
      channel: "149",
      band: "5 GHz",
      details: { "Radio type": "802.11ax", Authentication: "WPA3-Personal", Encryption: "GCMP", "Saved profile": false, Connected: false }
    },
    {
      id: "wifi-3",
      kind: "wifi",
      recordClass: "observed",
      provenance: "Live Wi-Fi scan",
      name: "Guest Network",
      address: "02:18:4A:DD:20:B2",
      strength: 67,
      status: "In range",
      security: "WPA2-Personal / CCMP",
      channel: "6",
      band: "2.4 GHz",
      details: { "Radio type": "802.11n", Authentication: "WPA2-Personal", Encryption: "CCMP", "Saved profile": false, Connected: false }
    },
    {
      id: "bluetooth-1",
      kind: "bluetooth",
      recordClass: "known",
      provenance: "Windows device inventory",
      name: "iPhone",
      address: "A4:83:E7:25:01:9B",
      status: "Known / available",
      details: { Present: true, Class: "Bluetooth", Note: "Windows known-device inventory." }
    },
    {
      id: "network-1",
      kind: "network",
      recordClass: "neighbor",
      provenance: "Windows neighbor cache",
      name: "192.168.1.1",
      address: "A8:5E:45:09:77:20",
      status: "Reachable",
      details: { "IP address": "192.168.1.1", Interface: "Wi-Fi", State: "Reachable" }
    },
    {
      id: "adapter-1",
      kind: "adapter",
      recordClass: "infrastructure",
      provenance: "Windows adapter inventory",
      name: "Wi-Fi",
      address: "34:13:E8:BC:40:72",
      status: "Up",
      details: { Description: "Intel(R) Wi-Fi 6E AX210", "Link speed": "1.2 Gbps", Status: "Up" }
    }
  ]
};
