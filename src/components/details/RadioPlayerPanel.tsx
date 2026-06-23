import { useEffect, useRef, useState } from "react";
import { Play, Music, Square, Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import type { SignalRecord } from "../../types";
import { Button } from "../ui/Button";
import { Favicon } from "../records/faviconCache";

export interface RadioPlayerPanelProps {
  record: SignalRecord;
  playingRadioId: string | null;
  isPlaying: boolean;
  isBuffering: boolean;
  status: string;
  volume: number;
  isMuted: boolean;
  onPlay: (record: SignalRecord) => void;
  onStop: () => void;
  onVolumeChange: (volume: number) => void;
  onVolumeChangeDirect: (volume: number) => void;
  onMuteToggle: () => void;
}

export function RadioPlayerPanel({
  record,
  playingRadioId,
  isPlaying,
  isBuffering,
  status,
  volume,
  isMuted,
  onPlay,
  onStop,
  onVolumeChange,
  onVolumeChangeDirect,
  onMuteToggle
}: RadioPlayerPanelProps) {
  const country = (record.details["Country"] as string) || "Global";
  const codec = (record.details["Codec"] as string) || "MP3";
  const bitrate = record.details["Bitrate"] ? `${record.details["Bitrate"]}` : "128 kbps";

  const [localVolume, setLocalVolume] = useState(isMuted ? 0 : volume);
  const [prevVolume, setPrevVolume] = useState(volume);
  const [prevMuted, setPrevMuted] = useState(isMuted);

  if (volume !== prevVolume || isMuted !== prevMuted) {
    setPrevVolume(volume);
    setPrevMuted(isMuted);
    setLocalVolume(isMuted ? 0 : volume);
  }

  const onPlayRef = useRef(onPlay);
  useEffect(() => {
    onPlayRef.current = onPlay;
  }, [onPlay]);

  const playingRadioIdRef = useRef(playingRadioId);
  useEffect(() => {
    playingRadioIdRef.current = playingRadioId;
  }, [playingRadioId]);

  // Auto-play once when the drawer mounts for this station, but only if
  // something else isn't already playing. Never re-run when playingRadioId
  // changes — that caused stopRadio() to immediately re-trigger playRadio().
  useEffect(() => {
    if (playingRadioIdRef.current !== record.id) {
      const timer = window.setTimeout(() => {
        onPlayRef.current(record);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);


  const togglePlayback = () => {
    if (isPlaying || isBuffering) {
      onStop();
    } else {
      onPlay(record);
    }
  };

  const isTuning = isPlaying || isBuffering;
  const favicon = (record.details["Favicon"] || record.details["favicon"]) as string;

  return (
    <section className="record-actions" style={{ marginBottom: "var(--space-6)" }}>
      <div className="record-action" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "var(--space-6) var(--space-4)", gap: "var(--space-5)" }}>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-5)", width: "100%" }}>
          <div style={{ transform: isPlaying ? "scale(1)" : "scale(0.82)", transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
            <Favicon url={favicon} seed={record.name} wrapperClassName="favicon-wrapper"
              wrapperStyle={{ position: "relative", width: "96px", height: "96px", borderRadius: "16px", flexShrink: 0 }}
              imageStyle={{ position: "relative", width: "96px", height: "96px", borderRadius: "16px", objectFit: "cover", background: "var(--color-surface-raised)", display: "block", zIndex: 1 }}
              fallback={<Music size={36} />}
              renderBackdrop={(src) => <img id="radio-logo-shadow" src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "16px", objectFit: "cover", filter: "blur(22px) saturate(2.4) brightness(0.9)", zIndex: 0, transform: "scale(0.85) translateY(8px)", opacity: isPlaying ? 0.72 : 0.35, transition: "opacity 0.5s ease" }} />}
              renderFallbackBackdrop={(background) => <div id="radio-logo-shadow" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "16px", background, filter: "blur(22px) saturate(1.4) brightness(0.9)", zIndex: 0, transform: "scale(0.85) translateY(8px)", opacity: isPlaying ? 0.72 : 0.35, transition: "opacity 0.5s ease" }} />}
            />
          </div>
          
          <div style={{ minWidth: 0, width: "100%", position: "relative", zIndex: 2 }}>
            <strong style={{ margin: 0, display: "block", fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text)", lineHeight: "1.3" }}>{record.name}</strong>
            <span style={{ textWrap: "balance", marginTop: "6px", display: "block", fontSize: "var(--text-supporting)", color: "var(--color-text-muted)", lineHeight: "1.4" }}>
              {country} &bull; {codec} &bull; {bitrate}
            </span>
            <span style={{ marginTop: "6px", display: "block", fontSize: "var(--text-supporting)", color: status === "Playing Live" ? "var(--color-success)" : status === "Disconnected" ? "var(--color-text-muted)" : "var(--color-warning)", fontWeight: 600 }}>
              {status}
            </span>
          </div>

          <Button
            variant={isTuning ? "primary" : "secondary"}
            icon={isTuning ? <Square size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: isTuning ? "0px" : "3px" }} />}
            iconOnly
            aria-label={isPlaying ? "Disconnect" : isBuffering ? "Cancel" : "Tune In"}
            onClick={togglePlayback}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          />

          <div className="radio-player__controls" style={{ display: "flex", alignItems: "center", width: "100%", maxWidth: "240px", marginTop: "var(--space-2)" }}>
            <div 
              className="radio-player__volume-slider" 
              style={{ 
                position: "relative", 
                height: "var(--control-sm)", 
                width: "100%",
                display: "flex", 
                alignItems: "center", 
                paddingLeft: "8px",
                paddingRight: "8px",
                cursor: "pointer",
                flexShrink: 0,
                "--volume-pct": `${Math.round((isMuted ? 0 : localVolume) * 100)}%`
              } as React.CSSProperties}
            >
              <button
                type="button"
                onClick={onMuteToggle}
                style={{ background: "none", border: "none", display: "flex", alignItems: "center", zIndex: 3, cursor: "pointer", padding: 0, color: "var(--color-text-muted)" }}
              >
                {isMuted || localVolume === 0 ? (
                  <VolumeX size={14} />
                ) : localVolume < 0.33 ? (
                  <Volume size={14} />
                ) : localVolume < 0.67 ? (
                  <Volume1 size={14} />
                ) : (
                  <Volume2 size={14} />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : localVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setLocalVolume(val);
                  onVolumeChangeDirect(val);
                }}
                onMouseUp={() => {
                  onVolumeChange(localVolume);
                }}
                onTouchEnd={() => {
                  onVolumeChange(localVolume);
                }}
                aria-label="Volume"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                  cursor: "pointer",
                  margin: 0,
                  padding: 0,
                  zIndex: 2
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
