import type { ReactNode, RefObject } from "react";
import type { SourceMode } from "@/hooks/useAudioEngine";
import { PITCH_CLASS_NAMES } from "@/lib/audio/scientific-analysis";
import { findOpticalSystem, findScene, type VisualSettings } from "@/lib/visualizer/types";
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
  fileName,
  isPlaying,
}: StudioStageProps) {
  const scene = findScene(settings.scene);
  const opticalSystem = findOpticalSystem(settings.opticalSystem);
  const meterLevel = Math.min(1, telemetry.energy * settings.sensitivity * 2.1);
  const readouts = sceneReadouts(settings.scene, telemetry);

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
      <div className="stage-optical-key" aria-label="Optical encoding: electric blue is signal evidence; white is reference geometry">
        <span><i className="optical-chip optical-chip-signal" aria-hidden="true" />SIGNAL</span>
        <span><i className="optical-chip optical-chip-reference" aria-hidden="true" />REFERENCE</span>
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
              style={{ backgroundColor: opticalSystem.css[0] }}
            />
          ))}
        </div>
        <div className="stage-readouts" aria-label="Audio analysis summary">
          {readouts.map(([label, value]) => (
            <span key={label}>
              <small>{label}</small>
              {value}
            </span>
          ))}
          <span>
            <small>ENGINE</small>
            {telemetry.renderer.toUpperCase()}
          </span>
        </div>
      </div>
    </section>
  );
}
