import type { ReactNode, RefObject } from "react";
import type { SourceMode } from "@/hooks/useAudioEngine";
import { findPalette, findScene, type VisualSettings } from "@/lib/visualizer/types";
import type { Telemetry } from "./VisualizerCanvas";

const METER_SEGMENTS = Array.from({ length: 18 }, (_, index) => index);

interface StudioStageProps {
  containerRef: RefObject<HTMLDivElement | null>;
  visualizer: ReactNode;
  settings: VisualSettings;
  telemetry: Telemetry;
  sourceMode: SourceMode;
  fileName: string;
  isPlaying: boolean;
}

function sourceLabel(mode: SourceMode): string {
  if (mode === "system") return "SYSTEM CAPTURE";
  if (mode === "microphone") return "MICROPHONE";
  return "LOCAL FILE";
}

export function StudioStage({
  containerRef,
  visualizer,
  settings,
  telemetry,
  sourceMode,
  fileName,
  isPlaying,
}: StudioStageProps) {
  const scene = findScene(settings.scene);
  const palette = findPalette(settings.palette);
  const meterLevel = Math.min(1, telemetry.energy * settings.sensitivity * 2.1);

  return (
    <section className={`studio-stage aspect-${settings.aspect}`} ref={containerRef} aria-label="Visualizer stage">
      <div className="stage-canvas-wrap">{visualizer}</div>
      <div className="stage-chrome stage-chrome-top" aria-hidden="true">
        <span>AV.01 / {scene.shortName.toUpperCase()}</span>
        <span>{sourceLabel(sourceMode)}</span>
      </div>
      <div className="stage-target" aria-hidden="true">
        <i />
        <i />
      </div>
      <div className="stage-live-badge">
        <span className={isPlaying ? "is-live" : ""} />
        {isPlaying ? "SIGNAL ACTIVE" : "SIGNAL HELD"}
      </div>
      <div className="stage-information">
        <div className="stage-track">
          <span>NOW VISUALIZING</span>
          <strong title={fileName}>{fileName || sourceLabel(sourceMode)}</strong>
        </div>
        <div className="stage-meter" aria-hidden="true">
          {METER_SEGMENTS.map((segment) => (
            <i
              key={segment}
              className={segment / METER_SEGMENTS.length < meterLevel ? "is-lit" : ""}
              style={{ backgroundColor: palette.css[segment > 14 ? 2 : segment > 9 ? 1 : 0] }}
            />
          ))}
        </div>
        <div className="stage-readouts" aria-label="Audio analysis summary">
          <span>
            <small>ENERGY</small>
            {Math.round(telemetry.energy * 100).toString().padStart(2, "0")}
          </span>
          <span>
            <small>CENTROID</small>
            {Math.round(telemetry.centroidHz)} Hz
          </span>
          <span>
            <small>ENGINE</small>
            {telemetry.renderer.toUpperCase()}
          </span>
        </div>
      </div>
    </section>
  );
}
