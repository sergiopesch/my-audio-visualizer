"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useCanvasRecorder } from "@/hooks/useCanvasRecorder";
import {
  createReferenceSignalFile,
  findReferenceSignal,
  type ReferenceSignalId,
} from "@/lib/audio/reference-signals";
import {
  BRAND_PIGMENTS,
  DEFAULT_VISUAL_SETTINGS,
  SCENES,
  type SceneId,
  type VisualSettings,
} from "@/lib/visualizer/types";
import { ExportDialog } from "./ExportDialog";
import { Icon } from "./Icons";
import { InspectorPanel } from "./InspectorPanel";
import { SceneRail } from "./SceneRail";
import { SourcePicker } from "./SourcePicker";
import { StudioHeader } from "./StudioHeader";
import { StudioStage } from "./StudioStage";
import { TransportBar } from "./TransportBar";
import { VisualizerCanvas, type Telemetry } from "./VisualizerCanvas";

const INITIAL_TELEMETRY: Telemetry = {
  renderer: "canvas2d",
  energy: 0,
  peak: 0,
  crestFactor: 0,
  levelDbFs: -100,
  zeroCrossingRate: 0,
  onsetStrength: 0,
  centroidHz: 0,
  rolloffHz: 0,
  highFrequencyCutoffHz: 3_000,
  rolloffPercent: 0.85,
  highFrequencyRatio: 0,
  chromaConcentration: 0,
  dominantChroma: -1,
  periodicityBpm: 0,
  periodicityEvidence: 0,
  pulsePhase: 0,
  rhythmEvidenceSeconds: 0,
  transientCandidateCount: 0,
  recurrence: 0,
  similarityCount: 0,
  analysisRateHz: 50,
  sampleRate: 0,
  fftSize: 0,
  silent: true,
  fps: 0,
};

const ACCEPTED_AUDIO = "audio/*,.aac,.aif,.aiff,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.wave,.webm";

interface KeyboardActions {
  togglePlayback: () => Promise<boolean> | void;
  fullscreen: () => void;
  snapshot: () => void;
  export: () => void;
  setScene: (scene: SceneId) => void;
}

const INITIAL_KEYBOARD_ACTIONS: KeyboardActions = {
  togglePlayback: () => undefined,
  fullscreen: () => undefined,
  snapshot: () => undefined,
  export: () => undefined,
  setScene: () => undefined,
};

function saveCanvasSnapshot(canvas: HTMLCanvasElement, fileName: string): void {
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stem = fileName.replace(/\.[^/.]+$/, "") || "audio-visualizer";
      anchor.href = url;
      anchor.download = `${stem}-frame.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
    "image/png",
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      [
        "a[href]",
        "button",
        "input",
        "select",
        "summary",
        "textarea",
        '[contenteditable]:not([contenteditable="false"])',
        '[role="button"]',
        '[role="checkbox"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[role="option"]',
        '[role="radio"]',
        '[role="slider"]',
        '[role="spinbutton"]',
        '[role="switch"]',
        '[role="tab"]',
        '[role="textbox"]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(","),
    ),
  );
}

export function AudioVisualizerStudio() {
  const {
    audioRef,
    analyserRef,
    sourceMode,
    status: audioStatus,
    hasSource,
    fileName,
    duration,
    currentTime,
    isPlaying,
    waveformPeaks,
    error: audioError,
    isLive,
    captureSettings,
    sourceDetails,
    loadFile,
    startSystemCapture: beginSystemCapture,
    startMicrophone: beginMicrophone,
    play,
    pause,
    togglePlayback,
    stop,
    seek,
    reset: resetAudio,
    getPlaybackTime,
    getCaptureStream,
  } = useAudioEngine();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const keyboardActionsRef = useRef<KeyboardActions>(INITIAL_KEYBOARD_ACTIONS);
  const outputModeSignalRef = useRef<"preview" | "export">("preview");
  const renderNowRef = useRef<(() => void) | null>(null);
  const resetAnalysisRef = useRef<(() => void) | null>(null);

  const [settings, setSettings] = useState<VisualSettings>(DEFAULT_VISUAL_SETTINGS);
  const [telemetry, setTelemetry] = useState<Telemetry>(INITIAL_TELEMETRY);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [outputPrimed, setOutputPrimed] = useState(false);
  const [demoPaused, setDemoPaused] = useState(false);
  const [loadingReference, setLoadingReference] = useState<ReferenceSignalId | null>(null);
  const [activeReferenceId, setActiveReferenceId] = useState<ReferenceSignalId | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);

  const seekWithAnalysisReset = useCallback((timeSeconds: number) => {
    resetAnalysisRef.current?.();
    seek(timeSeconds);
  }, [seek]);

  const stopWithAnalysisReset = useCallback(() => {
    resetAnalysisRef.current?.();
    stop();
  }, [stop]);

  const {
    status: recorderStatus,
    progress: recorderProgress,
    elapsed: recorderElapsed,
    error: recorderError,
    notice: recorderNotice,
    downloadUrl,
    mimeType: recorderMimeType,
    extension,
    start: startRecording,
    stop: stopRecording,
    cancel: cancelRecording,
    reset: resetRecording,
  } = useCanvasRecorder({
    canvasRef,
    audioRef,
    sourceMode,
    duration,
    getPlaybackTime,
    getCaptureStream,
    play,
    pause,
    seek: seekWithAnalysisReset,
  });

  const updateSettings = useCallback((patch: Partial<VisualSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const finishSourceChange = useCallback((referenceId: ReferenceSignalId | null = null) => {
    setTelemetry(INITIAL_TELEMETRY);
    setSourceRevision((revision) => revision + 1);
    setActiveReferenceId(referenceId);
    setUiError(null);
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [hasSource, sourceRevision]);

  const importFile = useCallback(
    async (file: File, referenceId: ReferenceSignalId | null = null) => {
      const loaded = await loadFile(file);
      if (loaded) finishSourceChange(referenceId);
      return loaded;
    },
    [finishSourceChange, loadFile],
  );

  const openReferenceSignal = useCallback(
    async (id: ReferenceSignalId) => {
      const reference = findReferenceSignal(id);
      setLoadingReference(id);
      setUiError(null);
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const loaded = await importFile(createReferenceSignalFile(id), id);
        if (loaded) updateSettings({ scene: reference.scene });
      } catch {
        setUiError("The reference signal could not be generated in this browser.");
      } finally {
        setLoadingReference(null);
      }
    },
    [importFile, updateSettings],
  );

  const startSystemCapture = useCallback(async () => {
    const started = await beginSystemCapture();
    if (started) finishSourceChange();
  }, [beginSystemCapture, finishSourceChange]);

  const startMicrophone = useCallback(async () => {
    const started = await beginMicrophone();
    if (started) finishSourceChange();
  }, [beginMicrophone, finishSourceChange]);

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void importFile(file);
    },
    [importFile],
  );

  const exitStudio = useCallback(() => {
    cancelRecording();
    resetAnalysisRef.current?.();
    outputModeSignalRef.current = "preview";
    setOutputPrimed(false);
    setExportOpen(false);
    setLoadingReference(null);
    setActiveReferenceId(null);
    resetAudio();
    setSourceRevision((revision) => revision + 1);
    setTelemetry(INITIAL_TELEMETRY);
    setUiError(null);
  }, [cancelRecording, resetAudio]);

  const beginRecording = useCallback(() => {
    outputModeSignalRef.current = "export";
    setOutputPrimed(true);
    requestAnimationFrame(() => {
      renderNowRef.current?.();
      requestAnimationFrame(() => {
        void startRecording({ fps: 30, fromStart: true });
      });
    });
  }, [startRecording]);

  useEffect(() => {
    if (recorderStatus === "preparing" || recorderStatus === "recording") {
      outputModeSignalRef.current = "export";
    } else if (recorderStatus === "ready" || recorderStatus === "error") {
      outputModeSignalRef.current = "preview";
    }
  }, [recorderStatus]);

  const requestFullscreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void stage.requestFullscreen().catch(() => {
      setUiError("Fullscreen could not be opened in this browser.");
    });
  }, []);

  const takeSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    requestAnimationFrame(() => saveCanvasSnapshot(canvas, fileName ?? "live-signal"));
  }, [fileName]);

  const openExport = useCallback(() => {
    setUiError(null);
    setExportOpen(true);
  }, []);

  const selectScene = useCallback((scene: SceneId) => {
    updateSettings({ scene });
  }, [updateSettings]);

  const togglePrimaryPlayback = useCallback(() => {
    if (!hasSource) {
      setDemoPaused((paused) => !paused);
      return;
    }
    if (sourceMode === "file" && !isPlaying) {
      const audioElement = audioRef.current;
      const playbackPosition = audioElement?.currentTime ?? currentTime;
      const replayingFromEnd = Boolean(audioElement?.ended)
        || (duration > 0 && playbackPosition >= duration - 0.05);
      if (replayingFromEnd) resetAnalysisRef.current?.();
    }
    return togglePlayback();
  }, [audioRef, currentTime, duration, hasSource, isPlaying, sourceMode, togglePlayback]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pauseForReducedMotion = () => {
      if (mediaQuery.matches) setDemoPaused(true);
    };
    pauseForReducedMotion();
    mediaQuery.addEventListener("change", pauseForReducedMotion);
    return () => mediaQuery.removeEventListener("change", pauseForReducedMotion);
  }, []);

  useEffect(() => {
    keyboardActionsRef.current = {
      togglePlayback: togglePrimaryPlayback,
      fullscreen: requestFullscreen,
      snapshot: takeSnapshot,
      export: openExport,
      setScene: selectScene,
    };
  }, [openExport, requestFullscreen, selectScene, takeSnapshot, togglePrimaryPlayback]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.repeat ||
        event.isComposing ||
        isInteractiveTarget(event.target) ||
        exportOpen
      ) {
        return;
      }
      const actions = keyboardActionsRef.current;
      if (event.code === "Space") {
        event.preventDefault();
        void actions.togglePlayback();
        return;
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        actions.fullscreen();
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        actions.snapshot();
        return;
      }
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        actions.export();
        return;
      }
      const sceneIndex = Number(event.key) - 1;
      const scene = SCENES[sceneIndex];
      if (scene) actions.setScene(scene.id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exportOpen]);

  const handleDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    if (event.dataTransfer.types.includes("Files")) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void importFile(file);
    },
    [importFile],
  );

  const visualizer = (
    <VisualizerCanvas
      canvasRef={canvasRef}
      analyserRef={analyserRef}
      settings={settings}
      mode={hasSource ? "live" : "demo"}
      sourceProvenance={activeReferenceId ? "built-in-reference" : "user-source"}
      active={hasSource ? isPlaying : !demoPaused}
      sourceRevision={sourceRevision}
      getPlaybackTime={getPlaybackTime}
      onTelemetry={setTelemetry}
      className="stage-canvas"
      outputModeSignal={outputModeSignalRef}
      renderNowRef={renderNowRef}
      resetAnalysisRef={resetAnalysisRef}
      outputMode={
        (outputPrimed &&
          recorderStatus !== "ready" &&
          recorderStatus !== "error") ||
        recorderStatus === "preparing" ||
        recorderStatus === "recording"
          ? "export"
          : "preview"
      }
    />
  );

  const busy = audioStatus === "loading" || loadingReference !== null;
  const error = uiError ?? audioError;
  const activeReference = activeReferenceId ? findReferenceSignal(activeReferenceId) : null;

  useEffect(() => {
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) return;
    themeColor.content = hasSource ? BRAND_PIGMENTS.background : BRAND_PIGMENTS.reference;
  }, [hasSource]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      {hasSource ? (
        <main className="studio-shell">
          <StudioHeader
            fileName={fileName ?? (isLive ? "Live signal" : "Untitled signal")}
            sourceMode={sourceMode}
            isReferenceSignal={activeReference !== null}
            isPlaying={isPlaying}
            onExit={exitStudio}
            onSnapshot={takeSnapshot}
            onFullscreen={requestFullscreen}
            onExport={openExport}
          />
          <SceneRail value={settings.scene} onChange={selectScene} />
          <StudioStage
            containerRef={stageRef}
            visualizer={visualizer}
            settings={settings}
            telemetry={telemetry}
            sourceMode={sourceMode}
            isReferenceSignal={activeReference !== null}
            fileName={fileName ?? "Live signal"}
            isPlaying={isPlaying}
          />
          <TransportBar
            sourceMode={sourceMode}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            peaks={waveformPeaks}
            onPlayPause={() => void togglePrimaryPlayback()}
            onStop={stopWithAnalysisReset}
            onSeek={seekWithAnalysisReset}
          />
          <InspectorPanel
            settings={settings}
            telemetry={telemetry}
            sourceMode={sourceMode}
            captureSettings={captureSettings}
            sourceDetails={sourceDetails}
            referenceSignal={activeReference}
            onChange={updateSettings}
            onReset={() => setSettings(DEFAULT_VISUAL_SETTINGS)}
          />
          {error ? <div className="studio-error-banner" role="alert">{error}</div> : null}
        </main>
      ) : (
        <SourcePicker
          preview={visualizer}
          telemetry={telemetry}
          demoPaused={demoPaused}
          busy={busy}
          loadingReference={loadingReference}
          error={error}
          onToggleDemo={() => setDemoPaused((paused) => !paused)}
          onChooseFile={() => fileInputRef.current?.click()}
          onChooseReference={(id) => void openReferenceSignal(id)}
          onSystemCapture={() => void startSystemCapture()}
          onMicrophone={() => void startMicrophone()}
        />
      )}

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={ACCEPTED_AUDIO}
        onChange={handleFileInput}
      />
      <audio ref={audioRef} className="sr-only" preload="metadata" />

      {dragging ? (
        <div className="drop-overlay" role="presentation">
          <div className="drop-overlay-inner">
            <Icon name="upload" size={42} />
            <strong>Drop signal to open</strong>
            <small>The file stays in this browser.</small>
          </div>
        </div>
      ) : null}

      {hasSource && sourceMode !== "none" ? (
        <ExportDialog
          open={exportOpen}
          sourceMode={sourceMode}
          status={recorderStatus}
          progress={recorderProgress}
          elapsed={recorderElapsed}
          error={recorderError}
          notice={recorderNotice}
          downloadUrl={downloadUrl}
          mimeType={recorderMimeType}
          extension={extension}
          fileName={fileName ?? "live-signal"}
          aspect={settings.aspect}
          onAspectChange={(aspect) => updateSettings({ aspect })}
          onStart={beginRecording}
          onStop={stopRecording}
          onCancel={() => {
            outputModeSignalRef.current = "preview";
            setOutputPrimed(false);
            cancelRecording();
          }}
          onReset={() => {
            outputModeSignalRef.current = "preview";
            setOutputPrimed(false);
            resetRecording();
          }}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
}
