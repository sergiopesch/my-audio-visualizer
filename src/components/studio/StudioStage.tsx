import type { ReactNode, RefObject } from "react";
import type { SourceMode } from "@/hooks/useAudioEngine";
import { PITCH_CLASS_NAMES } from "@/lib/audio/scientific-analysis";
import { findScene, type VisualSettings } from "@/lib/visualizer/types";
import type { Telemetry } from "./VisualizerCanvas";

interface StudioStageProps {
  containerRef: RefObject<HTMLDivElement | null>;
  visualizer: ReactNode;
  settings: VisualSettings;
  telemetry: Telemetry;
  sourceMode: SourceMode;
  isReferenceSignal: boolean;
  fileName: string;
  isPlaying: boolean;
}

function sourceLabel(mode: SourceMode): string {
  if (mode === "system") return "SYSTEM CAPTURE";
  if (mode === "microphone") return "MICROPHONE";
  return "LOCAL FILE";
}

function indexValue(value: number): string {
  return Math.max(0, Math.min(1, value)).toFixed(2);
}

function sceneReadouts(
  scene: VisualSettings["scene"],
  telemetry: Telemetry,
): readonly [string, string][] {
  if (scene === "field") {
    return [
      ["CENTROID", `${Math.round(telemetry.centroidHz)} Hz`],
      ["ROLLOFF", `${Math.round(telemetry.rolloffHz)} Hz`],
    ];
  }
  if (scene === "orbit") {
    return [
      [
        "STRONGEST CLASS",
        telemetry.dominantChroma >= 0
          ? PITCH_CLASS_NAMES[telemetry.dominantChroma] ?? "—"
          : "—",
      ],
      ["CONCENTRATION INDEX", indexValue(telemetry.chromaConcentration)],
    ];
  }
  if (scene === "trace") {
    return [
      ["RMS LEVEL", `${telemetry.levelDbFs.toFixed(1)} dBFS`],
      ["CREST", `${telemetry.crestFactor.toFixed(2)}×`],
    ];
  }
  if (scene === "lattice") {
    return [
      ["ONSET INDEX", indexValue(telemetry.onsetStrength)],
      [
        "PERIOD",
        telemetry.periodicityBpm > 0 ? `${telemetry.periodicityBpm.toFixed(1)} BPM-eq.` : "—",
      ],
      [
        "EVIDENCE",
        `${indexValue(telemetry.periodicityEvidence)} · ${telemetry.transientCandidateCount} candidates`,
      ],
    ];
  }
  return [
    ["COSINE SIMILARITY", indexValue(telemetry.recurrence)],
    ["HISTORY", `${(telemetry.similarityCount / 8).toFixed(1)} s`],
  ];
}

export function StudioStage({
  containerRef,
  visualizer,
  settings,
  telemetry,
  sourceMode,
  isReferenceSignal,
  fileName,
  isPlaying,
}: StudioStageProps) {
  const scene = findScene(settings.scene);
  const readouts = sceneReadouts(settings.scene, telemetry);

  return (
    <section className={`studio-stage aspect-${settings.aspect}`} ref={containerRef} aria-label="Visualizer stage">
      <div className="stage-canvas-wrap">{visualizer}</div>
      <div className="stage-chrome stage-chrome-top">
        <span>{String(scene.index + 1).padStart(2, "0")} / {scene.shortName.toUpperCase()}</span>
        <span>{isReferenceSignal ? "BUILT-IN REFERENCE" : sourceLabel(sourceMode)}</span>
      </div>
      <div className="stage-live-badge">
        <span className={isPlaying ? "is-live" : ""} />
        {isPlaying ? "PLAYING" : "HELD"}
      </div>
      <div className="stage-information">
        <div className="stage-track">
          <span>NOW VISUALIZING</span>
          <strong title={fileName}>{fileName || sourceLabel(sourceMode)}</strong>
        </div>
        <div className="stage-readouts" aria-label="Audio analysis summary">
          {readouts.map(([label, value]) => (
            <span key={label}>
              <small>{label}</small>
              {value}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
