import type { SourceMode } from "@/hooks/useAudioEngine";
import { Icon } from "./Icons";
import { WaveformTimeline } from "./WaveformTimeline";

interface TransportBarProps {
  sourceMode: SourceMode;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  peaks: number[];
  accent: string;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onChangeSource: () => void;
}

function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

export function TransportBar({
  sourceMode,
  isPlaying,
  currentTime,
  duration,
  peaks,
  accent,
  onPlayPause,
  onStop,
  onSeek,
  onChangeSource,
}: TransportBarProps) {
  const fileMode = sourceMode === "file";
  return (
    <footer className="transport-bar">
      <div className="transport-controls">
        <button
          type="button"
          className="transport-play"
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
        >
          <Icon name={isPlaying ? "pause" : "play"} size={23} />
        </button>
        <button type="button" className="transport-secondary" onClick={onStop} aria-label="Stop audio">
          <Icon name="stop" size={18} />
        </button>
        <div className="transport-clock" aria-label="Playback time">
          <strong>{formatClock(currentTime)}</strong>
          <span>{fileMode ? formatClock(duration) : "LIVE"}</span>
        </div>
      </div>

      {fileMode ? (
        <WaveformTimeline
          peaks={peaks}
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
          accent={accent}
        />
      ) : (
        <div className="live-timeline" aria-label="Live input is active">
          <span className={isPlaying ? "is-active" : ""} />
          <div>
            <strong>LIVE SIGNAL</strong>
            <small>Recording and visualization are processed in real time.</small>
          </div>
          <i />
        </div>
      )}

      <div className="transport-tail">
        <button type="button" className="change-source-button" onClick={onChangeSource}>
          <Icon name="arrow-left" size={16} />
          SOURCE
        </button>
        <span className="shortcut-hint">SPACE · PLAY / PAUSE</span>
      </div>
    </footer>
  );
}
