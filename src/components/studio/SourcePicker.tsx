import type { ReactNode } from "react";
import type { Telemetry } from "./VisualizerCanvas";
import { Icon, SignalMark } from "./Icons";

interface SourcePickerProps {
  preview: ReactNode;
  telemetry: Telemetry;
  demoPaused: boolean;
  busy: boolean;
  error: string | null;
  onToggleDemo: () => void;
  onChooseFile: () => void;
  onSystemCapture: () => void;
  onMicrophone: () => void;
}

export function SourcePicker({
  preview,
  telemetry,
  demoPaused,
  busy,
  error,
  onToggleDemo,
  onChooseFile,
  onSystemCapture,
  onMicrophone,
}: SourcePickerProps) {
  return (
    <main className="entry-shell">
      <header className="entry-header">
        <a className="wordmark" href="#top" aria-label="Audio Visualizer home">
          <SignalMark />
          <span>
            AUDIO
            <br />
            VISUALIZER
          </span>
        </a>
        <div className="entry-status" aria-label="Application status">
          <span className="status-pip" />
          REAL-TIME / LOCAL
        </div>
      </header>

      <section className="entry-grid" id="top">
        <div className="entry-copy">
          <p className="eyebrow">AV / 01 — VISUAL INSTRUMENT</p>
          <h1>
            Sound,
            <br />
            <em>seen.</em>
          </h1>
          <p className="entry-deck">
            Five explicit views of one signal: auditory spectrum, pitch class,
            waveform, onset-envelope periodicity and recent self-similarity. Every
            signal stays on your device.
          </p>

          <div className="source-stack" aria-label="Choose an audio source">
            <button
              className="source-card source-card-primary"
              type="button"
              onClick={onChooseFile}
              disabled={busy}
            >
              <span className="source-index">01</span>
              <span className="source-icon">
                <Icon name="upload" size={23} />
              </span>
              <span className="source-card-copy">
                <strong>Open a track</strong>
                <small>MP3, WAV, M4A, FLAC, OGG</small>
              </span>
              <span className="source-arrow">↗</span>
            </button>
            <div className="source-split">
              <button type="button" className="source-card source-card-compact" onClick={onSystemCapture} disabled={busy}>
                <span className="source-index">02</span>
                <Icon name="screen" size={21} />
                <span className="source-card-copy">
                  <strong>Capture audio</strong>
                  <small>Tab or application</small>
                </span>
              </button>
              <button type="button" className="source-card source-card-compact" onClick={onMicrophone} disabled={busy}>
                <span className="source-index">03</span>
                <Icon name="mic" size={21} />
                <span className="source-card-copy">
                  <strong>Use microphone</strong>
                  <small>Room or instrument</small>
                </span>
              </button>
            </div>
          </div>

          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="privacy-note">NO UPLOADS · NO ACCOUNTS · NO TRACKING</p>
          )}
        </div>

        <div className="entry-preview-column">
          <div className="entry-preview-frame">
            <div className="preview-registration preview-registration-tl" />
            <div className="preview-registration preview-registration-br" />
            {preview}
            <div className="preview-label preview-label-top">
              <span>SYNTHETIC FEATURE PREVIEW</span>
              <span>{telemetry.renderer.toUpperCase()}</span>
            </div>
            <div className="preview-label preview-label-bottom">
              <span>{demoPaused ? "00" : String(Math.round(telemetry.fps)).padStart(2, "0")} FPS</span>
              <span>ILLUSTRATIVE · NOT MEASURED</span>
              <span>{demoPaused ? "HELD" : "ACTIVE"}</span>
            </div>
            <button
              type="button"
              className="preview-demo-toggle"
              onClick={onToggleDemo}
              aria-label={demoPaused ? "Play demo visualization" : "Pause demo visualization"}
            >
              <Icon name={demoPaused ? "play" : "pause"} size={14} />
              <span>{demoPaused ? "PLAY DEMO" : "PAUSE DEMO"}</span>
            </button>
          </div>
          <div className="entry-annotation">
            <span>←</span>
            <p>
              <strong>Five distinct representations</strong>
              This preview animates synthetic feature data. Load a real signal to
              test the documented methods.
            </p>
          </div>
        </div>
      </section>

      <footer className="entry-footer">
        <span>BUILT FOR HEADPHONES, SCREENS &amp; STAGES</span>
        <span>SPACE · PAUSE / PLAY DEMO</span>
      </footer>
    </main>
  );
}
