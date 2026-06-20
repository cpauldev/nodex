import { Bluetooth, Cable, Network, Waypoints, Wifi } from "lucide-react";
import { Badge } from "../ui/Badge";
import { getSecondaryLabel, kindLabel, latencyTone, recordLatency, signalTone, type Tone } from "../../presentation";
import type { SignalKind, SignalRecord } from "../../types";

const kindTone: Record<SignalKind, Tone> = {
  wifi: "accent", bluetooth: "info", network: "warning", adapter: "neutral", p2p: "purple"
};

export function KindBadge({ record }: { record: SignalRecord }) {
  const Icon = record.kind === "wifi" ? Wifi : record.kind === "bluetooth" ? Bluetooth : record.kind === "network" ? Network : record.kind === "p2p" ? Waypoints : Cable;
  return <Badge tone={kindTone[record.kind]} icon={<Icon size={14} aria-hidden="true" />} secondary={getSecondaryLabel(record)}>
    {kindLabel[record.kind]}
  </Badge>;
}

export function SignalBadge({ value }: { value: number }) {
  const tone = signalTone(value);
  const label = tone === "success" ? "strong" : tone === "warning" ? "medium" : "weak";
  return <Badge tone={tone} secondary={label}>{value}%</Badge>;
}

export function StatusBadge({ record }: { record: SignalRecord }) {
  if (record.kind === "p2p") return <Badge tone={latencyTone(recordLatency(record))}>{record.status}</Badge>;
  return <Badge>{record.status}</Badge>;
}

export function LatencyBadge({ record }: { record: SignalRecord }) {
  const latency = recordLatency(record);
  return <Badge tone={latencyTone(latency)}>{latency === undefined ? record.status : `${latency} ms`}</Badge>;
}
