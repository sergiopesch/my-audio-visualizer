"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import {
  createAudioFeatureBus,
  createDemoFeatureBus,
  type FeatureBus,
  type FeatureFrame,
} from "@/lib/audio";
import {
  createSpectralRenderer,
  type RendererKind,
  type SpectralRenderer,
} from "@/lib/visualizer/renderer";
import {
  findAspect,
  type VisualSettings,
} from "@/lib/visualizer/types";

const TELEMETRY_INTERVAL_MS = 150;
const ANALYSIS_INTERVAL_MS = 1_000 / 50;
const MAX_ANALYSIS_STEP_MS = 100;

export interface Telemetry {
  renderer: RendererKind;
  /** Root-mean-square digital amplitude in the normalized 0..1 range. */
  energy: number;
  peak: number;
  crestFactor: number;
  levelDbFs: number;
  zeroCrossingRate: number;
  onsetStrength: number;
  centroidHz: number;
  rolloffHz: number;
  highFrequencyRatio: number;
  chromaConcentration: number;
  dominantChroma: number;
  periodicityBpm: number;
  periodicityEvidence: number;
  pulsePhase: number;
  rhythmEvidenceSeconds: number;
  transientCandidateCount: number;
  recurrence: number;
  similarityCount: number;
  analysisRateHz: number;
  sampleRate: number;
  fftSize: number;
  silent: boolean;
  fps: number;
}

export interface VisualizerCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  analyserRef: RefObject<AnalyserNode | null>;
  settings: VisualSettings;
  mode: "demo" | "live";
  active: boolean;
  sourceRevision: number;
  getPlaybackTime: () => number;
  onTelemetry?: (telemetry: Telemetry) => void;
  className?: string;
  outputMode?: "preview" | "export";
  outputModeSignal?: RefObject<"preview" | "export">;
  renderNowRef?: RefObject<(() => void) | null>;
  resetAnalysisRef?: RefObject<(() => void) | null>;
}

interface CanvasRuntime {
  renderStill: () => void;
  resetAnalysis: () => void;
  setActive: (active: boolean) => void;
}

function nowMilliseconds(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function effectiveSettings(
  settings: VisualSettings,
  reduceMotion: boolean,
): VisualSettings {
  if (!reduceMotion) return settings;

  return {
    ...settings,
    intensity: Math.min(settings.intensity, 0.68),
    bloom: Math.min(settings.bloom, 0.3),
    highlightCompression: true,
  };
}

function syncBackingDimensions(
  canvas: HTMLCanvasElement,
  settings: VisualSettings,
  outputMode: "preview" | "export",
): void {
  const aspect = findAspect(settings.aspect);
  let width = aspect.width;
  let height = aspect.height;

  if (outputMode === "preview") {
    const bounds = canvas.getBoundingClientRect();
    const cssWidth = bounds.width || aspect.width;
    const cssHeight = bounds.height || aspect.height;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const fitScale = settings.aspect === "landscape"
      ? cssWidth / aspect.width
      : Math.min(cssWidth / aspect.width, cssHeight / aspect.height);
    const scale = Math.min(1, Math.max(0.25, fitScale * pixelRatio));
    width = Math.max(2, Math.round(aspect.width * scale));
    height = Math.max(2, Math.round(aspect.height * scale));
  }

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function createFeatureBus(
  mode: "demo" | "live",
  analyser: AnalyserNode | null,
): FeatureBus | null {
  if (mode === "demo") {
    return createDemoFeatureBus({ mode: "demo" });
  }

  return analyser
    ? createAudioFeatureBus(analyser, { mode: "live" })
    : null;
}

export function VisualizerCanvas({
  canvasRef,
  analyserRef,
  settings,
  mode,
  active,
  sourceRevision,
  getPlaybackTime,
  onTelemetry,
  className,
  outputMode = "preview",
  outputModeSignal,
  renderNowRef,
  resetAnalysisRef,
}: VisualizerCanvasProps) {
  const settingsRef = useRef(settings);
  const effectiveSettingsRef = useRef(settings);
  const reducedMotionRef = useRef(false);
  const activeRef = useRef(active);
  const playbackTimeRef = useRef(getPlaybackTime);
  const telemetryCallbackRef = useRef(onTelemetry);
  const outputModeRef = useRef(outputMode);
  const runtimeRef = useRef<CanvasRuntime | null>(null);

  useEffect(() => {
    playbackTimeRef.current = getPlaybackTime;
  }, [getPlaybackTime]);

  useEffect(() => {
    telemetryCallbackRef.current = onTelemetry;
  }, [onTelemetry]);

  useEffect(() => {
    outputModeRef.current = outputMode;
    runtimeRef.current?.renderStill();
  }, [outputMode]);

  useEffect(() => {
    settingsRef.current = settings;
    effectiveSettingsRef.current = effectiveSettings(
      settings,
      reducedMotionRef.current,
    );
    runtimeRef.current?.renderStill();
  }, [settings]);

  useEffect(() => {
    activeRef.current = active;
    runtimeRef.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      reducedMotionRef.current = mediaQuery.matches;
      effectiveSettingsRef.current = effectiveSettings(
        settingsRef.current,
        mediaQuery.matches,
      );
      runtimeRef.current?.renderStill();
    };

    syncMotionPreference();
    mediaQuery.addEventListener("change", syncMotionPreference);
    return () => {
      mediaQuery.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    syncBackingDimensions(
      canvas,
      effectiveSettingsRef.current,
      outputModeSignal?.current ?? outputModeRef.current,
    );

    let renderer: SpectralRenderer;
    try {
      renderer = createSpectralRenderer(canvas);
    } catch (error) {
      canvas.dataset.visualizerState = "unavailable";
      console.error("Unable to initialize the visualizer renderer.", error);
      return;
    }

    let bus: FeatureBus | null;
    try {
      bus = createFeatureBus(mode, analyserRef.current);
    } catch (error) {
      renderer.dispose();
      canvas.dataset.visualizerState = "unavailable";
      console.error("Unable to initialize audio analysis.", error);
      return;
    }

    let disposed = false;
    let failed = false;
    let animationFrameId: number | null = null;
    let analysisTimerId: number | null = null;
    let lastAnalysisWallTimestampMs: number | null = null;
    let analysisClockMs = 0;
    let lastPlaybackTimeSeconds = 0;
    let playbackTimeErrorReported = false;
    let lastTelemetryTimestampMs = Number.NEGATIVE_INFINITY;
    let telemetryWindowStartedMs = nowMilliseconds();
    let telemetryWindowFrames = 0;
    let measuredFps = 0;
    let lastReducedMotionFrameMs = Number.NEGATIVE_INFINITY;
    let contextLost = false;

    canvas.dataset.renderer = renderer.kind;
    canvas.dataset.visualizerState = bus ? "ready" : "waiting-for-audio";

    const readShaderTime = (frame: FeatureFrame): number => {
      if (mode === "demo") return frame.timeSeconds;

      try {
        const playbackTime = playbackTimeRef.current();
        if (Number.isFinite(playbackTime) && playbackTime >= 0) {
          lastPlaybackTimeSeconds = playbackTime;
        }
      } catch (error) {
        if (!playbackTimeErrorReported) {
          playbackTimeErrorReported = true;
          console.error("Unable to read the audio playback time.", error);
        }
      }
      return lastPlaybackTimeSeconds;
    };

    const emitTelemetry = (frame: FeatureFrame, timestampMs: number) => {
      const callback = telemetryCallbackRef.current;
      if (!callback) return;

      lastTelemetryTimestampMs = timestampMs;
      const energy = frame.rms;
      try {
        callback({
          renderer: renderer.kind,
          energy,
          peak: frame.peak,
          crestFactor: frame.crestFactor,
          levelDbFs: frame.levelDbFs,
          zeroCrossingRate: frame.zeroCrossingRate,
          onsetStrength: frame.onsetStrength,
          centroidHz: frame.spectralCentroidHz,
          rolloffHz: frame.spectralRolloffHz,
          highFrequencyRatio: frame.highFrequencyRatio,
          chromaConcentration: frame.chromaConcentration,
          dominantChroma: frame.dominantChroma,
          periodicityBpm: frame.periodicityBpm,
          periodicityEvidence: frame.periodicityEvidence,
          pulsePhase: frame.pulsePhase,
          rhythmEvidenceSeconds: frame.rhythmEvidenceSeconds,
          transientCandidateCount: frame.transientCandidateCount,
          recurrence: frame.recurrence,
          similarityCount: frame.selfSimilarityCount,
          analysisRateHz: frame.analysisRateHz,
          sampleRate: frame.sampleRate,
          fftSize: frame.fftSize,
          silent: frame.isSilent,
          fps: measuredFps,
        });
      } catch (error) {
        console.error("The visualizer telemetry callback failed.", error);
      }
    };

    const reportAnimatedFrame = (frame: FeatureFrame, timestampMs: number) => {
      telemetryWindowFrames += 1;
      if (timestampMs - lastTelemetryTimestampMs < TELEMETRY_INTERVAL_MS) return;

      const elapsedMs = timestampMs - telemetryWindowStartedMs;
      if (elapsedMs > 0) {
        const windowFps = (telemetryWindowFrames * 1000) / elapsedMs;
        measuredFps = measuredFps === 0
          ? windowFps
          : measuredFps * 0.65 + windowFps * 0.35;
      }
      telemetryWindowStartedMs = timestampMs;
      telemetryWindowFrames = 0;
      emitTelemetry(frame, timestampMs);
    };

    const reportStillFrame = (frame: FeatureFrame, timestampMs: number) => {
      if (timestampMs - lastTelemetryTimestampMs < TELEMETRY_INTERVAL_MS) return;
      emitTelemetry(frame, timestampMs);
    };

    const renderFrame = (animated: boolean, timestampMs: number) => {
      if (!bus) return;

      const frame = bus.frame;
      const currentSettings = effectiveSettingsRef.current;
      const currentOutputMode = outputModeSignal?.current ?? outputModeRef.current;
      canvas.dataset.outputMode = currentOutputMode;
      canvas.dataset.analysisSource = mode === "demo" ? "synthetic-preview" : "measured";
      canvas.dataset.analysisSequence = String(frame.sequence);
      canvas.dataset.scene = currentSettings.scene;
      canvas.dataset.levelDbFs = frame.levelDbFs.toFixed(3);
      canvas.dataset.peakLinear = frame.peak.toFixed(4);
      canvas.dataset.crestFactor = frame.crestFactor.toFixed(4);
      canvas.dataset.zeroCrossingRate = frame.zeroCrossingRate.toFixed(4);
      canvas.dataset.centroidHz = frame.spectralCentroidHz.toFixed(2);
      canvas.dataset.rolloffHz = frame.spectralRolloffHz.toFixed(2);
      canvas.dataset.highFrequencyRatio = frame.highFrequencyRatio.toFixed(4);
      canvas.dataset.onsetStrength = frame.onsetStrength.toFixed(4);
      canvas.dataset.periodicityBpm = frame.periodicityBpm.toFixed(2);
      canvas.dataset.periodicityEvidence = frame.periodicityEvidence.toFixed(4);
      canvas.dataset.transientCandidateCount = String(frame.transientCandidateCount);
      canvas.dataset.chromaConcentration = frame.chromaConcentration.toFixed(4);
      canvas.dataset.dominantChroma = String(frame.dominantChroma);
      canvas.dataset.recurrence = frame.recurrence.toFixed(4);
      canvas.dataset.similarityCount = String(frame.selfSimilarityCount);
      syncBackingDimensions(canvas, currentSettings, currentOutputMode);
      renderer.render(frame, currentSettings, readShaderTime(frame));

      if (animated) reportAnimatedFrame(frame, timestampMs);
      else reportStillFrame(frame, timestampMs);
    };

    const stopAnimation = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    const stopAnalysis = () => {
      if (analysisTimerId !== null) {
        window.clearInterval(analysisTimerId);
        analysisTimerId = null;
      }
      lastAnalysisWallTimestampMs = null;
    };

    const failRuntime = (error: unknown) => {
      if (failed) return;
      failed = true;
      stopAnimation();
      stopAnalysis();
      canvas.dataset.visualizerState = "error";
      console.error("The visualizer render loop stopped after an error.", error);
    };

    const runAnalysis = (wallTimestampMs = nowMilliseconds()) => {
      if (!bus || disposed || failed) return;

      if (bus.frame.sequence === 0) {
        lastAnalysisWallTimestampMs = wallTimestampMs;
        bus.update(analysisClockMs);
        return;
      }

      if (lastAnalysisWallTimestampMs === null) {
        lastAnalysisWallTimestampMs = wallTimestampMs;
        return;
      }

      const elapsedMs = Math.min(
        MAX_ANALYSIS_STEP_MS,
        Math.max(0, wallTimestampMs - lastAnalysisWallTimestampMs),
      );
      lastAnalysisWallTimestampMs = wallTimestampMs;
      analysisClockMs += elapsedMs;
      bus.update(analysisClockMs);
    };

    const scheduleAnalysis = () => {
      if (
        disposed ||
        failed ||
        !bus ||
        analysisTimerId !== null ||
        !activeRef.current ||
        contextLost ||
        document.hidden
      ) {
        return;
      }

      runAnalysis();
      analysisTimerId = window.setInterval(() => {
        try {
          runAnalysis();
        } catch (error) {
          failRuntime(error);
        }
      }, ANALYSIS_INTERVAL_MS);
    };

    const renderStill = () => {
      if (disposed || failed || !bus) return;
      try {
        renderFrame(false, nowMilliseconds());
      } catch (error) {
        failRuntime(error);
      }
    };

    const scheduleAnimation = () => {
      if (
        disposed ||
        failed ||
        !bus ||
        animationFrameId !== null ||
        !activeRef.current ||
        contextLost ||
        document.hidden
      ) {
        return;
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    function animate(timestampMs: number): void {
      animationFrameId = null;
      if (disposed || failed || !activeRef.current || document.hidden) {
        return;
      }

      if (
        reducedMotionRef.current &&
        timestampMs - lastReducedMotionFrameMs < 100
      ) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }
      lastReducedMotionFrameMs = timestampMs;

      try {
        renderFrame(true, timestampMs);
      } catch (error) {
        failRuntime(error);
        return;
      }

      animationFrameId = requestAnimationFrame(animate);
    }

    const runtime: CanvasRuntime = {
      renderStill,
      resetAnalysis() {
        if (!bus) return;
        bus.reset();
        renderer.reset();
        analysisClockMs = 0;
        lastAnalysisWallTimestampMs = null;
        lastPlaybackTimeSeconds = 0;
        measuredFps = 0;
        renderStill();
      },
      setActive(nextActive) {
        if (nextActive) {
          telemetryWindowStartedMs = nowMilliseconds();
          telemetryWindowFrames = 0;
          scheduleAnalysis();
          scheduleAnimation();
        } else {
          stopAnimation();
          stopAnalysis();
          measuredFps = 0;
          renderStill();
        }
      },
    };
    runtimeRef.current = runtime;
    if (renderNowRef) renderNowRef.current = renderStill;
    if (resetAnalysisRef) resetAnalysisRef.current = runtime.resetAnalysis;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAnimation();
        stopAnalysis();
      } else if (activeRef.current) {
        scheduleAnalysis();
        scheduleAnimation();
      } else {
        renderStill();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      stopAnimation();
      stopAnalysis();
      canvas.dataset.visualizerState = "recovering";
    };
    const handleContextRestored = () => {
      if (disposed) return;
      try {
        renderer.dispose();
        renderer = createSpectralRenderer(canvas);
        canvas.dataset.renderer = renderer.kind;
        canvas.dataset.visualizerState = bus ? "ready" : "waiting-for-audio";
        contextLost = false;
        failed = false;
        renderStill();
        scheduleAnalysis();
        scheduleAnimation();
      } catch (error) {
        failRuntime(error);
      }
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(renderStill);
    if (resizeObserver) resizeObserver.observe(canvas);
    else window.addEventListener("resize", renderStill, { passive: true });

    renderStill();
    if (activeRef.current) {
      scheduleAnalysis();
      scheduleAnimation();
    }

    return () => {
      disposed = true;
      stopAnimation();
      stopAnalysis();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener("resize", renderStill);
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      if (renderNowRef?.current === renderStill) renderNowRef.current = null;
      if (resetAnalysisRef?.current === runtime.resetAnalysis) {
        resetAnalysisRef.current = null;
      }
      bus?.dispose();
      renderer.dispose();
      delete canvas.dataset.renderer;
      delete canvas.dataset.visualizerState;
      delete canvas.dataset.outputMode;
      delete canvas.dataset.analysisSource;
      delete canvas.dataset.analysisSequence;
      delete canvas.dataset.scene;
      delete canvas.dataset.levelDbFs;
      delete canvas.dataset.peakLinear;
      delete canvas.dataset.crestFactor;
      delete canvas.dataset.zeroCrossingRate;
      delete canvas.dataset.centroidHz;
      delete canvas.dataset.rolloffHz;
      delete canvas.dataset.highFrequencyRatio;
      delete canvas.dataset.onsetStrength;
      delete canvas.dataset.periodicityBpm;
      delete canvas.dataset.periodicityEvidence;
      delete canvas.dataset.transientCandidateCount;
      delete canvas.dataset.chromaConcentration;
      delete canvas.dataset.dominantChroma;
      delete canvas.dataset.recurrence;
      delete canvas.dataset.similarityCount;
    };
  }, [
    analyserRef,
    canvasRef,
    mode,
    outputModeSignal,
    renderNowRef,
    resetAnalysisRef,
    sourceRevision,
  ]);

  const aspect = findAspect(settings.aspect);
  const stateLabel = active ? "active" : "paused";
  const contentLabel = mode === "demo"
    ? `Synthetic feature preview, not measured audio, ${stateLabel}`
    : `Measured audio visualization, ${stateLabel}`;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={aspect.width}
      height={aspect.height}
      style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }}
      role="img"
      aria-label={contentLabel}
    >
      Audio visualization. Your browser does not support the canvas element.
    </canvas>
  );
}
