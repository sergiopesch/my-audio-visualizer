import type { CSSProperties } from "react";
import {
  ASPECTS,
  PALETTES,
  findScene,
  type VisualSettings,
} from "@/lib/visualizer/types";
import { Icon } from "./Icons";

interface InspectorPanelProps {
  settings: VisualSettings;
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

export function InspectorPanel({ settings, onChange, onReset }: InspectorPanelProps) {
  const scene = findScene(settings.scene);
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
            id="motion-control"
            label="Motion"
            value={settings.motion}
            display={`${Math.round(settings.motion * 100)}`}
            onChange={(motion) => onChange({ motion })}
          />
          <ParameterSlider
            id="bloom-control"
            label="Bloom"
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

      <section className="inspector-section" aria-labelledby="palette-title">
        <h3 id="palette-title">COLOR SYSTEM</h3>
        <div className="palette-grid" role="radiogroup" aria-label="Color palette">
          {PALETTES.map((palette) => {
            const selected = settings.palette === palette.id;
            return (
              <button
                type="button"
                key={palette.id}
                className={`palette-button${selected ? " is-active" : ""}`}
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ palette: palette.id })}
              >
                <span className="palette-swatches" aria-hidden="true">
                  {palette.css.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </span>
                <span>{palette.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="inspector-section" aria-labelledby="frame-title">
        <h3 id="frame-title">FRAME</h3>
        <div className="aspect-grid" role="radiogroup" aria-label="Canvas aspect ratio">
          {ASPECTS.map((aspect) => (
            <button
              key={aspect.id}
              type="button"
              role="radio"
              aria-checked={settings.aspect === aspect.id}
              className={settings.aspect === aspect.id ? "is-active" : ""}
              onClick={() => onChange({ aspect: aspect.id })}
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
          <small>Softens rapid flashes and bloom</small>
        </div>
        <button
          type="button"
          className={`switch-control${settings.flashSafe ? " is-on" : ""}`}
          role="switch"
          aria-checked={settings.flashSafe}
          aria-label="Visual comfort mode"
          onClick={() => onChange({ flashSafe: !settings.flashSafe })}
        >
          <span />
        </button>
      </section>
    </aside>
  );
}
