import type { CSSProperties, KeyboardEvent } from "react";
import type {
  AudioCaptureSettings,
  AudioSourceDetails,
  SourceMode,
} from "@/hooks/useAudioEngine";
import { PITCH_CLASS_NAMES } from "@/lib/audio/scientific-analysis";
import {
  ASPECTS,
  findScene,
  type VisualSettings,
} from "@/lib/visualizer/types";
import { Icon } from "./Icons";
import type { Telemetry } from "./VisualizerCanvas";

interface InspectorPanelProps {
  settings: VisualSettings;
  telemetry: Telemetry;
  sourceMode: SourceMode;
  captureSettings: AudioCaptureSettings | null;
  sourceDetails: AudioSourceDetails | null;
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
      ["85% rolloff", `${Math.round(telemetry.rolloffHz)} Hz`],
      [">3 kHz power", percentage(telemetry.highFrequencyRatio)],
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
      ["Concentration index", indexValue(telemetry.chromaConcentration)],
      ["Scale", "Unitless · not probability"],
    ];
  }
  if (sceneId === "trace") {
    return [
      ["RMS level", `${telemetry.levelDbFs.toFixed(1)} dBFS`],
      ["Crest factor", `${telemetry.crestFactor.toFixed(2)}×`],
      ["Zero-crossing fraction", percentage(telemetry.zeroCrossingRate)],
    ];
  }
  if (sceneId === "lattice") {
    return [
      ["Onset index", indexValue(telemetry.onsetStrength)],
      ["Transient candidates", String(telemetry.transientCandidateCount)],
      [
        "Period candidate",
        telemetry.periodicityBpm > 0
          ? `${telemetry.periodicityBpm.toFixed(1)} BPM-eq.`
          : "Gathering evidence",
      ],
      [
        "Heuristic index / history",
        `${indexValue(telemetry.periodicityEvidence)} / ${telemetry.rhythmEvidenceSeconds.toFixed(1)} s`,
      ],
    ];
  }
  return [
    ["Cosine similarity >2 s", indexValue(telemetry.recurrence)],
    ["History compared", `${(telemetry.similarityCount / 8).toFixed(1)} s`],
    ["Matrix samples", `${telemetry.similarityCount} / 64`],
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
  onChange,
  onReset,
}: InspectorPanelProps) {
  const scene = findScene(settings.scene);
  const readouts = sceneReadouts(scene.id, telemetry);
  const windowMilliseconds = telemetry.sampleRate > 0
    ? (telemetry.fftSize / telemetry.sampleRate) * 1_000
    : 0;
  return (
    <aside className="inspector-panel" aria-label="Visual controls">
      <div className="inspector-title">
        <span>
          <Icon name="sliders" size={16} />
          SHAPE SIGNAL
        </span>
        <button type="button" onClick={onReset} className="text-button">
          RESET
        </button>
      </div>

      <section className="inspector-scene-note" aria-live="polite">
        <span className="eyebrow">ACTIVE SCENE</span>
        <h2>{scene.name}</h2>
        <p>{scene.description}</p>
        <small>{scene.mapping}</small>
      </section>

      <section className="inspector-section science-panel" aria-labelledby="science-title">
        <h3 id="science-title">HOW THIS SCENE LISTENS · AV01-SCI-00{scene.index + 1}</h3>
        <p className="science-representation">{scene.representation}</p>
        <p className="science-question">{scene.question}</p>
        <dl className="science-readouts">
          {readouts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="science-limitation">
          <strong>Does not infer:</strong> {scene.limitation}
        </p>
        <small className="science-method">
          {telemetry.fftSize || 4_096}-sample {scene.id === "trace"
            ? "unwindowed time-domain readout"
            : "browser Blackman spectrum"}
          {windowMilliseconds > 0 ? ` · ${windowMilliseconds.toFixed(1)} ms` : ""}
          {` · nominal ${telemetry.analysisRateHz} Hz · mono analysis graph ${telemetry.sampleRate} Hz`}
        </small>
        {sourceMode === "file" && sourceDetails ? (
          <small className="science-method">
            Decoded file overview: {sourceDetails.sampleRate} Hz · {sourceDetails.channelCount ?? "?"} ch
            {(sourceDetails.channelCount ?? 0) > 1 ? " · playback analyser downmixes to mono" : ""}
            {" · browser decode may resample"}
          </small>
        ) : null}
        {sourceMode !== "file" && sourceMode !== "none" && captureSettings ? (
          <small className="science-method">
            {sourceMode === "microphone" ? "Reported microphone" : "Reported capture"}: {captureSettings.sampleRate ?? "?"} Hz · {captureSettings.channelCount ?? "?"} ch
            {` · echo cancellation ${settingState(captureSettings.echoCancellation)}`}
            {` · noise suppression ${settingState(captureSettings.noiseSuppression)}`}
            {` · auto gain ${settingState(captureSettings.autoGainControl)}`}
          </small>
        ) : null}
        {sourceMode !== "file" && sourceMode !== "none" && !captureSettings && sourceDetails ? (
          <small className="science-method">
            Analysis graph fallback: {sourceDetails.sampleRate} Hz · ? ch · capture track did not report channel settings
          </small>
        ) : null}
        <a
          className="science-link"
          href="https://github.com/sergiopesch/my-audio-visualizer/blob/main/docs/SCIENCE.md"
          target="_blank"
          rel="noreferrer"
        >
          METHOD, SOURCES &amp; LIMITS ↗
        </a>
      </section>

      <section className="inspector-section" aria-labelledby="response-title">
        <h3 id="response-title">RESPONSE</h3>
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
      </section>

      <section className="inspector-section optical-key-panel" aria-labelledby="optical-key-title">
        <h3 id="optical-key-title">OPTICAL KEY</h3>
        <dl className="optical-key-list">
          <div>
            <dt><i className="optical-chip optical-chip-signal" aria-hidden="true" />Electric blue</dt>
            <dd>Signal-derived evidence</dd>
          </div>
          <div>
            <dt><i className="optical-chip optical-chip-reference" aria-hidden="true" />White</dt>
            <dd>References and annotation</dd>
          </div>
        </dl>
        <p>Extent, opacity and line form carry value. Hue never adds an undeclared audio dimension.</p>
      </section>

      <section className="inspector-section" aria-labelledby="frame-title">
        <h3 id="frame-title">FRAME</h3>
        <div className="aspect-grid" role="radiogroup" aria-label="Canvas aspect ratio">
          {ASPECTS.map((aspect, index) => (
            <button
              key={aspect.id}
              type="button"
              role="radio"
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
      </section>

      <section className="safety-row">
        <div>
          <strong>Visual comfort</strong>
          <small>Reduces glow and highlight contrast</small>
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
      </section>
    </aside>
  );
}
