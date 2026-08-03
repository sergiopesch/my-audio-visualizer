import type { SourceMode } from "@/hooks/useAudioEngine";
import { Icon, SignalMark } from "./Icons";

interface StudioHeaderProps {
  fileName: string;
  sourceMode: SourceMode;
  isReferenceSignal: boolean;
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
  isReferenceSignal,
  isPlaying,
  onExit,
  onSnapshot,
  onFullscreen,
  onExport,
}: StudioHeaderProps) {
  return (
    <header className="studio-header">
      <button type="button" className="studio-brand" onClick={onExit} aria-label="Change audio source">
        <SignalMark size={24} />
        <span>AV / 01</span>
        <small>
          <Icon name="arrow-left" size={11} />
          CHANGE SOURCE
        </small>
      </button>
      <div className="studio-source-title">
        <span className={`source-state${isPlaying ? " is-active" : ""}`} />
        <div>
          <strong title={fileName}>{fileName || "Untitled signal"}</strong>
          <small>{isReferenceSignal ? "BUILT-IN REFERENCE" : `${modeName(sourceMode)} SOURCE`} · LOCAL SESSION</small>
        </div>
      </div>
      <div className="studio-actions">
        <button type="button" className="icon-button" onClick={onSnapshot} aria-label="Save a PNG snapshot">
          <Icon name="camera" />
        </button>
        <button type="button" className="icon-button" onClick={onFullscreen} aria-label="Open visualizer fullscreen">
          <Icon name="expand" />
        </button>
        <button type="button" className="export-button" onClick={onExport}>
          <Icon name="download" size={18} />
          RENDER
        </button>
      </div>
    </header>
  );
}
