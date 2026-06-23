import { Bluetooth, Cable, Network, Waypoints, Wifi, Music } from "lucide-react";
import { Badge } from "../ui/Badge";
import { getSecondaryLabel, kindLabel, latencyTone, recordLatency, signalTone, type Tone } from "../../presentation";
import type { SignalKind, SignalRecord } from "../../types";

const kindTone: Record<SignalKind, Tone> = {
  wifi: "accent", bluetooth: "info", network: "warning", adapter: "neutral", p2p: "purple", radio: "accent"
};

export function KindBadge({ record, isTunedIn, playingStatus }: { record: SignalRecord; isTunedIn?: boolean; playingStatus?: string }) {
  if (record.kind === "radio" && isTunedIn) {
    const statusText = playingStatus || "Playing Live";
    const tone: Tone = statusText === "Playing Live"
      ? "success"
      : statusText === "Disconnected"
      ? "neutral"
      : "warning";
    return <Badge tone={tone} icon={
      <div className="eq-badge-icon" style={{ marginRight: "4px" }}>
        <div id="eq-bar-1" className="eq-bar bar-1" style={{ height: "15%", animation: "none" }} />
        <div id="eq-bar-2" className="eq-bar bar-2" style={{ height: "15%", animation: "none" }} />
        <div id="eq-bar-3" className="eq-bar bar-3" style={{ height: "15%", animation: "none" }} />
        <div id="eq-bar-4" className="eq-bar bar-4" style={{ height: "15%", animation: "none" }} />
      </div>
    }>
      {statusText}
    </Badge>;
  }
  const Icon = record.kind === "wifi" ? Wifi : record.kind === "bluetooth" ? Bluetooth : record.kind === "network" ? Network : record.kind === "p2p" ? Waypoints : record.kind === "radio" ? Music : Cable;
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
  if (record.kind === "radio") {
    const votes = record.details.Votes ?? record.details.votes;
    const baseStatus = record.status.split(" • ")[0] || "Unverified";

    const primaryText = votes !== undefined && votes !== null ? `${Number(votes).toLocaleString()} votes` : "0 votes";
    const secondaryText = baseStatus === "Unverified" ? undefined : baseStatus;
    const tone = baseStatus === "Online" ? "success" : baseStatus === "Offline" ? "danger" : "neutral";

    return <Badge tone={tone} secondary={secondaryText}>
      {primaryText}
    </Badge>;
  }
  if (record.kind === "p2p") return <Badge tone={latencyTone(recordLatency(record))}>{record.status}</Badge>;
  return <Badge>{record.status}</Badge>;
}

export function LatencyBadge({ record }: { record: SignalRecord }) {
  const latency = recordLatency(record);
  return <Badge tone={latencyTone(latency)}>{latency === undefined ? record.status : `${latency} ms`}</Badge>;
}
