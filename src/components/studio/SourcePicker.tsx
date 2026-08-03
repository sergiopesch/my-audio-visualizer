import type { ReactNode } from "react";
import {
  REFERENCE_SIGNALS,
  type ReferenceSignalId,
} from "@/lib/audio/reference-signals";
import { findScene } from "@/lib/visualizer/types";
import type { Telemetry } from "./VisualizerCanvas";
import { Icon, SignalMark } from "./Icons";

interface SourcePickerProps {
  preview: ReactNode;
  telemetry: Telemetry;
  demoPaused: boolean;
  busy: boolean;
  loadingReference: ReferenceSignalId | null;
  error: string | null;
  onToggleDemo: () => void;
  onChooseFile: () => void;
  onChooseReference: (id: ReferenceSignalId) => void;
  onSystemCapture: () => void;
  onMicrophone: () => void;
}

export function SourcePicker({
  preview,
  telemetry,
  demoPaused,
  busy,
  loadingReference,
  error,
  onToggleDemo,
  onChooseFile,
  onChooseReference,
  onSystemCapture,
  onMicrophone,
}: SourcePickerProps) {
  const loadingSignal = loadingReference
    ? REFERENCE_SIGNALS.find((signal) => signal.id === loadingReference) ?? null
    : null;

  return (
    <main className="entry-shell" id="top" aria-busy={busy}>
      {busy ? (
        <p className="sr-only" role="status" aria-live="polite">
          {loadingSignal
            ? `Generating ${loadingSignal.name} locally.`
            : "Preparing the local audio source."}
        </p>
      ) : null}
      <header className="entry-header">
        <a className="wordmark" href="#top" aria-label="AV/01 home">
          <SignalMark size={30} />
          <span>AV / 01</span>
        </a>
        <div className="entry-status" aria-label="Application status">
          <span className="status-pip" />
          LOCAL SIGNAL LAB
        </div>
      </header>

      <section className="entry-hero" aria-labelledby="entry-title">
        <div className="entry-copy">
          <p className="eyebrow">A SCIENTIFICALLY GROUNDED VISUAL INSTRUMENT</p>
          <h1 id="entry-title">
            Five views.
            <br />
            <em>One signal.</em>
          </h1>
          <p className="entry-deck">
            Explore spectrum, pitch class, waveform, onset periodicity and
            self-similarity while keeping each representation distinct. Each view
            states what it measures—and what it does not infer.
          </p>

          <div className="source-actions" aria-label="Choose your own audio source">
            <button
              className="source-primary"
              type="button"
              onClick={onChooseFile}
              disabled={busy}
            >
              <Icon name="upload" size={18} />
              OPEN AUDIO
            </button>
            <button type="button" className="source-secondary" onClick={onSystemCapture} disabled={busy}>
              <Icon name="screen" size={17} />
              SYSTEM
            </button>
            <button type="button" className="source-secondary" onClick={onMicrophone} disabled={busy}>
              <Icon name="mic" size={17} />
              MIC
            </button>
          </div>

          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="privacy-note">NO UPLOADS · BUILT-IN REFERENCES · LOCAL PROCESSING</p>
          )}
        </div>

        <div className="entry-preview-column">
          <div className="preview-heading">
            <span>LIVE PREVIEW</span>
            <span>{telemetry.renderer.toUpperCase()}</span>
          </div>
          <div className="entry-preview-frame">
            {preview}
            <div className="preview-label preview-label-top">
              <span>SYNTHETIC FEATURE PREVIEW</span>
              <span>NOT A MEASUREMENT</span>
            </div>
            <div className="preview-label preview-label-bottom">
              <span>{demoPaused ? "HELD" : `${String(Math.round(telemetry.fps)).padStart(2, "0")} FPS`}</span>
              <button
                type="button"
                className="preview-demo-toggle"
                onClick={onToggleDemo}
                aria-label={demoPaused ? "Play demo visualization" : "Pause demo visualization"}
              >
                <Icon name={demoPaused ? "play" : "pause"} size={12} />
                <span>{demoPaused ? "PLAY" : "PAUSE"}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="reference-library" aria-labelledby="reference-title">
        <div className="reference-intro">
          <div>
            <p className="eyebrow">CONTROLLED AUDIO REFERENCES</p>
            <h2 id="reference-title">Start with a known change.</h2>
          </div>
          <p>
            Five deterministic PCM signals are generated in your browser. Choose
            one to open the matching view, then listen and compare the expected
            visual response.
          </p>
        </div>

        <ol className="reference-grid">
          {REFERENCE_SIGNALS.map((signal) => {
            const scene = findScene(signal.scene);
            const loading = loadingReference === signal.id;
            return (
              <li key={signal.id}>
                <button
                  type="button"
                  className="reference-card"
                  onClick={() => onChooseReference(signal.id)}
                  disabled={busy}
                  aria-busy={loading || undefined}
                  aria-label={loading
                    ? `Generating ${signal.name}`
                    : `Open ${signal.name} in ${scene.name}`}
                >
                  <span className="reference-meta">
                    <span>{String(signal.index + 1).padStart(2, "0")}</span>
                    <span>{scene.shortName}</span>
                  </span>
                  <strong>{signal.name}</strong>
                  <small>{signal.signal}</small>
                  <span className="reference-watch">
                    <i aria-hidden="true" />
                    {signal.watchFor}
                  </span>
                  <span className="reference-action">
                    <span>00:{String(signal.durationSeconds).padStart(2, "0")}</span>
                    <span>{loading ? "GENERATING…" : "OPEN SIGNAL →"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <p className="reference-disclaimer">
          The methods are literature-backed and internally tested. The examples
          demonstrate implementation behavior; they are not peer review,
          perceptual proof or calibrated measurement.
        </p>
      </section>

      <footer className="entry-footer">
        <span>AV / 01 · BROWSER-NATIVE AUDIO ANALYSIS</span>
        <a
          href="https://github.com/sergiopesch/my-audio-visualizer/blob/main/docs/SCIENCE.md"
          target="_blank"
          rel="noreferrer"
        >
          METHODS, SOURCES &amp; LIMITS ↗
        </a>
      </footer>
    </main>
  );
}
