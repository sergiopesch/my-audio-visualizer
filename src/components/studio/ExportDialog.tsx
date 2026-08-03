"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { RecorderStatus } from "@/hooks/useCanvasRecorder";
import { ASPECTS, type AspectId } from "@/lib/visualizer/types";
import { Icon } from "./Icons";

interface ExportDialogProps {
  open: boolean;
  sourceMode: "file" | "system" | "microphone";
  status: RecorderStatus;
  progress: number;
  elapsed: number;
  error: string | null;
  notice: string | null;
  downloadUrl: string | null;
  mimeType: string;
  extension: string;
  fileName: string;
  aspect: AspectId;
  onAspectChange: (aspect: AspectId) => void;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onReset: () => void;
  onClose: () => void;
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60)
    .toString()
    .padStart(2, "0")}`;
}

function downloadName(fileName: string, extension: string): string {
  const stem = fileName.replace(/\.[^/.]+$/, "") || "audio-visualizer";
  return `${stem}-visual.${extension}`;
}

function formatName(mimeType: string): string {
  if (!mimeType) return "BROWSER-NEGOTIATED VIDEO · 30 FPS · LOCAL";
  const normalized = mimeType
    .replace(/^video\//i, "")
    .replace(/;\s*codecs?=/i, " · ")
    .replaceAll(",", " + ")
    .toUpperCase();
  return `${normalized} · 30 FPS · LOCAL`;
}

export function ExportDialog({
  open,
  sourceMode,
  status,
  progress,
  elapsed,
  error,
  notice,
  downloadUrl,
  mimeType,
  extension,
  fileName,
  aspect,
  onAspectChange,
  onStart,
  onStop,
  onCancel,
  onReset,
  onClose,
}: ExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const aspectButtonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const recording = status === "preparing" || status === "recording";
  const fileMode = sourceMode === "file";

  const handleAspectKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + ASPECTS.length) % ASPECTS.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % ASPECTS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = ASPECTS.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    onAspectChange(ASPECTS[nextIndex].id);
    aspectButtonsRef.current[nextIndex]?.focus();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="export-dialog"
      onCancel={(event) => {
        if (recording) {
          event.preventDefault();
          return;
        }
        onClose();
      }}
      onClose={() => {
        if (open && !recording) onClose();
      }}
      aria-labelledby="export-title"
    >
      <div className="export-dialog-header">
        <div>
          <span className="eyebrow">OUTPUT / REAL-TIME RENDER</span>
          <h2 id="export-title">Render the performance</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} disabled={recording} aria-label="Close export dialog">
          <Icon name="close" />
        </button>
      </div>

      {status === "ready" && downloadUrl ? (
        <div className="export-ready-panel">
          <span className="export-ready-mark">
            <Icon name="check" size={30} />
          </span>
          <h3>Your visual is ready.</h3>
          <p>The recording uses the same scene, fixed optical system and audio graph as the live stage.</p>
          {notice ? <p className="export-completion-notice" role="status">{notice}</p> : null}
          <a className="export-download-link" href={downloadUrl} download={downloadName(fileName, extension)}>
            <Icon name="download" />
            DOWNLOAD {extension.toUpperCase()}
          </a>
          <button type="button" className="text-button" onClick={onReset}>
            RECORD ANOTHER
          </button>
        </div>
      ) : (
        <>
          <div className="export-dialog-body">
            <section className="export-format-section" aria-labelledby="export-format-title">
              <h3 id="export-format-title">01 / FRAME</h3>
              <div className="export-aspect-grid" role="radiogroup" aria-label="Export aspect ratio">
                {ASPECTS.map((option, index) => (
                  <button
                    key={option.id}
                    ref={(button) => {
                      aspectButtonsRef.current[index] = button;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={aspect === option.id}
                    tabIndex={aspect === option.id ? 0 : -1}
                    className={aspect === option.id ? "is-active" : ""}
                    onClick={() => onAspectChange(option.id)}
                    onKeyDown={(event) => handleAspectKeyDown(event, index)}
                    disabled={recording}
                  >
                    <i className={`aspect-icon aspect-${option.id}`} aria-hidden="true" />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.ratio} · {option.width}×{option.height}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="export-format-section" aria-labelledby="export-behavior-title">
              <h3 id="export-behavior-title">02 / CAPTURE</h3>
              <div className="export-behavior-card">
                <span className={`record-orbit${recording ? " is-recording" : ""}`} aria-hidden="true">
                  <i />
                </span>
                <div>
                  <strong>{fileMode ? "Full track from 00:00" : "Live performance"}</strong>
                  <p>
                    {fileMode
                      ? "Playback and recording start together, then stop automatically at the end."
                      : "Capture continues until you press stop. Audio never leaves this device."}
                  </p>
                </div>
              </div>
            </section>

            {recording ? (
              <div className="recording-progress" aria-live="polite">
                <div className="recording-progress-line">
                  <span className="recording-dot" />
                  <strong>{status === "preparing" ? "PREPARING" : "RECORDING"}</strong>
                  <time>{formatElapsed(elapsed)}</time>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={fileMode ? "Track render progress" : "Live capture progress"}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fileMode ? Math.round(progress * 100) : undefined}
                >
                  <i style={{ width: fileMode ? `${progress * 100}%` : "38%" }} />
                </div>
                <p>{fileMode ? `${Math.round(progress * 100)}% of track rendered` : "Live capture in progress"}</p>
              </div>
            ) : null}

            {error ? <p className="inline-error" role="alert">{error}</p> : null}
          </div>

          <div className="export-dialog-footer">
            <p>{formatName(mimeType)}</p>
            {recording ? (
              <div>
                <button type="button" className="text-button" onClick={onCancel}>
                  CANCEL
                </button>
                {!fileMode ? (
                  <button type="button" className="export-confirm-button" onClick={onStop}>
                    <Icon name="stop" size={17} />
                    STOP &amp; FINISH
                  </button>
                ) : null}
              </div>
            ) : (
              <button type="button" className="export-confirm-button" onClick={onStart} autoFocus>
                <span className="recording-dot" />
                START RENDER
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
