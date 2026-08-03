import type { CSSProperties, KeyboardEvent } from "react";
import type {
  AudioCaptureSettings,
  AudioSourceDetails,
  SourceMode,
} from "@/hooks/useAudioEngine";
import type { ReferenceSignalDefinition } from "@/lib/audio/reference-signals";
import { PITCH_CLASS_NAMES } from "@/lib/audio/scientific-analysis";
import {
  ASPECTS,
  findScene,
  type VisualSettings,
} from "@/lib/visualizer/types";
import type { Telemetry } from "./VisualizerCanvas";

interface InspectorPanelProps {
  settings: VisualSettings;
  telemetry: Telemetry;
  sourceMode: SourceMode;
  captureSettings: AudioCaptureSettings | null;
  sourceDetails: AudioSourceDetails | null;
  referenceSignal: ReferenceSignalDefinition | null;
  onChange: (patch: Partial<VisualSettings>) => void;
  onReset: () => void;
}

interface ParameterSliderProps {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  display: string;
  onChange: (value: number) => void;
}

function ParameterSlider({
  id,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  display,
  onChange,
}: ParameterSliderProps) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <div className="parameter-row">
      <div className="parameter-label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--range-progress": `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function indexValue(value: number): string {
  return Math.max(0, Math.min(1, value)).toFixed(2);
}

function moveRadioFocus(
  event: KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  count: number,
  select: (index: number) => void,
): void {
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % count;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + count) % count;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = count - 1;
  }
  if (nextIndex === null) return;
  event.preventDefault();
  select(nextIndex);
  const radios = event.currentTarget
    .closest('[role="radiogroup"]')
    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
  radios?.[nextIndex]?.focus();
}

function sceneReadouts(
  sceneId: VisualSettings["scene"],
  telemetry: Telemetry,
): readonly [string, string][] {
  if (sceneId === "field") {
    return [
      ["Centroid", `${Math.round(telemetry.centroidHz)} Hz`],
      [`${Math.round(telemetry.rolloffPercent * 100)}% rolloff`, `${Math.round(telemetry.rolloffHz)} Hz`],
      [`>${Math.round(telemetry.highFrequencyCutoffHz / 1_000)} kHz power`, percentage(telemetry.highFrequencyRatio)],
    ];
  }
  if (sceneId === "orbit") {
    return [
      [
        "Strongest class",
        telemetry.dominantChroma >= 0
          ? PITCH_CLASS_NAMES[telemetry.dominantChroma] ?? "—"
          : "—",
      ],
      ["Concentration", indexValue(telemetry.chromaConcentration)],
    ];
  }
  if (sceneId === "trace") {
    return [
      ["RMS level", `${telemetry.levelDbFs.toFixed(1)} dBFS`],
      ["Crest factor", `${telemetry.crestFactor.toFixed(2)}×`],
      ["Zero crossings", percentage(telemetry.zeroCrossingRate)],
    ];
  }
  if (sceneId === "lattice") {
    return [
      ["Onset index", indexValue(telemetry.onsetStrength)],
      [
        "Period candidate",
        telemetry.periodicityBpm > 0
          ? `${telemetry.periodicityBpm.toFixed(1)} BPM-eq.`
          : "Gathering…",
      ],
      ["Evidence / events", `${indexValue(telemetry.periodicityEvidence)} / ${telemetry.transientCandidateCount}`],
    ];
  }
  return [
    ["Recurrence", indexValue(telemetry.recurrence)],
    ["History", `${(telemetry.similarityCount / 8).toFixed(1)} s`],
    ["Matrix", `${telemetry.similarityCount} / 64`],
  ];
}

function settingState(value: boolean | undefined): string {
  if (value === undefined) return "not reported";
  return value ? "on" : "off";
}

export function InspectorPanel({
  settings,
  telemetry,
  sourceMode,
  captureSettings,
  sourceDetails,
  referenceSignal,
  onChange,
  onReset,
}: InspectorPanelProps) {
  const scene = findScene(settings.scene);
  const readouts = sceneReadouts(scene.id, telemetry);
  const windowMilliseconds = telemetry.sampleRate > 0
    ? (telemetry.fftSize / telemetry.sampleRate) * 1_000
    : 0;

  return (
    <aside className="inspector-panel" aria-label="View details and controls">
      <div className="inspector-title">
        <span>VIEW {String(scene.index + 1).padStart(2, "0")} / 05</span>
        <button type="button" onClick={onReset} className="text-button">
          RESET
        </button>
      </div>

      <section className="inspector-scene-note" aria-live="polite">
        <p className="eyebrow">{scene.claimId}</p>
        <h2>{scene.name}</h2>
        <p>{scene.description}</p>
        <div className="scene-question">
          <span>ASKS</span>
          <strong>{scene.question}</strong>
        </div>
      </section>

      <dl className="science-readouts" aria-label="Live measurements">
        {readouts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {referenceSignal ? (
        <section className="reference-experiment" aria-labelledby="reference-experiment-title">
          <p className="eyebrow">BUILT-IN REFERENCE</p>
          <h3 id="reference-experiment-title">{referenceSignal.name}</h3>
          <p>{referenceSignal.signal}</p>
          <dl>
            <div>
              <dt>LISTEN</dt>
              <dd>{referenceSignal.listenFor}</dd>
            </div>
            <div>
              <dt>WATCH</dt>
              <dd>{referenceSignal.watchFor}</dd>
            </div>
            <div>
              <dt>CONTROL</dt>
              <dd>{referenceSignal.controlledVariable}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="evidence-boundary" aria-labelledby="evidence-title">
        <h3 id="evidence-title">EVIDENCE BOUNDARY</h3>
        <p className="science-representation">{scene.representation}</p>
        <p className="science-limitation">
          <strong>Does not infer</strong>
          {scene.limitation}
        </p>
        <a
          className="science-link"
          href="https://github.com/sergiopesch/my-audio-visualizer/blob/main/docs/SCIENCE.md"
          target="_blank"
          rel="noreferrer"
        >
          METHOD &amp; PRIMARY SOURCES ↗
        </a>
      </section>

      <details className="inspector-details">
        <summary>Appearance <span>04 controls</span></summary>
        <div className="parameter-stack">
          <ParameterSlider
            id="sensitivity-control"
            label="Sensitivity"
            value={settings.sensitivity}
            min={0.45}
            max={2.2}
            step={0.05}
            display={`${settings.sensitivity.toFixed(2)}×`}
            onChange={(sensitivity) => onChange({ sensitivity })}
          />
          <ParameterSlider
            id="intensity-control"
            label="Intensity"
            value={settings.intensity}
            display={`${Math.round(settings.intensity * 100)}`}
            onChange={(intensity) => onChange({ intensity })}
          />
          <ParameterSlider
            id="bloom-control"
            label="Glow"
            value={settings.bloom}
            display={`${Math.round(settings.bloom * 100)}`}
            onChange={(bloom) => onChange({ bloom })}
          />
          <ParameterSlider
            id="detail-control"
            label="Detail"
            value={settings.detail}
            display={`${Math.round(settings.detail * 100)}`}
            onChange={(detail) => onChange({ detail })}
          />
        </div>
      </details>

      <details className="inspector-details">
        <summary>Frame &amp; comfort <span>{settings.aspect}</span></summary>
        <div className="aspect-grid" role="radiogroup" aria-label="Canvas aspect ratio">
          {ASPECTS.map((aspect, index) => (
            <button
              key={aspect.id}
              type="button"
              role="radio"
              aria-label={aspect.ratio}
              aria-checked={settings.aspect === aspect.id}
              tabIndex={settings.aspect === aspect.id ? 0 : -1}
              className={settings.aspect === aspect.id ? "is-active" : ""}
              onClick={() => onChange({ aspect: aspect.id })}
              onKeyDown={(event) => moveRadioFocus(
                event,
                index,
                ASPECTS.length,
                (nextIndex) => onChange({ aspect: ASPECTS[nextIndex].id }),
              )}
            >
              <i className={`aspect-icon aspect-${aspect.id}`} aria-hidden="true" />
              <span>{aspect.ratio}</span>
            </button>
          ))}
        </div>
        <div className="safety-row">
          <div>
            <strong>Visual comfort</strong>
            <small>Reduce glow and highlight contrast</small>
          </div>
          <button
            type="button"
            className={`switch-control${settings.highlightCompression ? " is-on" : ""}`}
            role="switch"
            aria-checked={settings.highlightCompression}
            aria-label="Visual comfort mode"
            onClick={() => onChange({
              highlightCompression: !settings.highlightCompression,
            })}
          >
            <span />
          </button>
        </div>
      </details>

      <details className="inspector-details">
        <summary>Signal provenance <span>{telemetry.sampleRate || "—"} Hz</span></summary>
        <div className="provenance-copy">
          <p>
            {telemetry.fftSize || 4_096}-sample {scene.id === "trace"
              ? "peak-preserving time-domain reduction"
              : "browser Blackman spectrum"}
            {windowMilliseconds > 0 ? ` · ${windowMilliseconds.toFixed(1)} ms` : ""}
            {` · nominal ${telemetry.analysisRateHz} Hz · mono graph`}
          </p>
          {sourceMode === "file" && sourceDetails ? (
            <p>
              Decoded overview: {sourceDetails.sampleRate} Hz · {sourceDetails.channelCount ?? "?"} ch
              {(sourceDetails.channelCount ?? 0) > 1 ? " · analyser downmixes to mono" : ""}
              {" · browser decode may resample"}
            </p>
          ) : null}
          {sourceMode !== "file" && sourceMode !== "none" && captureSettings ? (
            <p>
              Reported capture: {captureSettings.sampleRate ?? "?"} Hz · {captureSettings.channelCount ?? "?"} ch
              {` · echo cancellation ${settingState(captureSettings.echoCancellation)}`}
              {` · noise suppression ${settingState(captureSettings.noiseSuppression)}`}
              {` · auto gain ${settingState(captureSettings.autoGainControl)}`}
            </p>
          ) : null}
          {sourceMode !== "file" && sourceMode !== "none" && !captureSettings && sourceDetails ? (
            <p>
              Analysis graph fallback: {sourceDetails.sampleRate} Hz · channel count not reported.
            </p>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
