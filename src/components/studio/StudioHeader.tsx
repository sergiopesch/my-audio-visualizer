import type { SourceMode } from "@/hooks/useAudioEngine";
import { Icon, SignalMark } from "./Icons";

interface StudioHeaderProps {
  fileName: string;
  sourceMode: SourceMode;
  isPlaying: boolean;
  onExit: () => void;
  onSnapshot: () => void;
  onFullscreen: () => void;
  onExport: () => void;
}

function modeName(mode: SourceMode): string {
  if (mode === "system") return "SYSTEM";
  if (mode === "microphone") return "MIC";
  return "FILE";
}

export function StudioHeader({
  fileName,
  sourceMode,
  isPlaying,
  onExit,
  onSnapshot,
  onFullscreen,
  onExport,
}: StudioHeaderProps) {
  return (
    <header className="studio-header">
      <button type="button" className="studio-brand" onClick={onExit} aria-label="Return to source picker">
        <SignalMark size={32} />
        <span>AUDIO / VISUALIZER</span>
        <small>AV.01</small>
      </button>
      <div className="studio-source-title">
        <span className={`source-state${isPlaying ? " is-active" : ""}`} />
        <div>
          <strong title={fileName}>{fileName || "Untitled signal"}</strong>
          <small>{modeName(sourceMode)} SOURCE · LOCAL SESSION</small>
        </div>
      </div>
      <div className="studio-actions">
        <button type="button" className="icon-button" onClick={onSnapshot} aria-label="Save a PNG snapshot" data-tooltip="Snapshot">
          <Icon name="camera" />
        </button>
        <button type="button" className="icon-button" onClick={onFullscreen} aria-label="Open visualizer fullscreen" data-tooltip="Fullscreen">
          <Icon name="expand" />
        </button>
        <button type="button" className="export-button" onClick={onExport}>
          <Icon name="download" size={18} />
          EXPORT
        </button>
      </div>
    </header>
  );
}
