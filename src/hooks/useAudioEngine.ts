"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type AudioSourceMode = "none" | "file" | "system" | "microphone";
/** Concise compatibility alias used by studio components. */
export type SourceMode = AudioSourceMode;

export interface AudioCaptureSettings {
  readonly sampleRate?: number;
  readonly sampleSize?: number;
  readonly channelCount?: number;
  readonly echoCancellation?: boolean;
  readonly noiseSuppression?: boolean;
  readonly autoGainControl?: boolean;
}

export interface AudioSourceDetails {
  readonly sampleRate: number;
  readonly channelCount: number;
}

export type AudioEngineStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "capturing"
  | "error";

export interface UseAudioEngineResult {
  readonly audioRef: RefObject<HTMLAudioElement | null>;
  readonly analyserRef: RefObject<AnalyserNode | null>;
  readonly sourceMode: AudioSourceMode;
  readonly status: AudioEngineStatus;
  readonly hasSource: boolean;
  readonly file: File | null;
  readonly fileName: string | null;
  readonly duration: number;
  readonly currentTime: number;
  readonly isPlaying: boolean;
  /** Normalized decoded-audio peaks, one value per overview bucket, in the 0..1 range. */
  readonly waveformPeaks: number[];
  readonly error: string | null;
  /** The raw, audio-only system or microphone input stream. */
  readonly liveStream: MediaStream | null;
  /** Settings the active capture track actually reports, not merely those requested. */
  readonly captureSettings: AudioCaptureSettings | null;
  /** Decoded AudioBuffer shape for files, or reported/fallback graph shape for live capture. */
  readonly sourceDetails: AudioSourceDetails | null;
  readonly isLive: boolean;
  /** Web Audio's recording output. This is intentionally not HTMLMediaElement.captureStream(). */
  readonly captureStream: MediaStream | null;
  readonly loadFile: (file: File) => Promise<boolean>;
  readonly startSystemCapture: () => Promise<boolean>;
  readonly startMicrophone: () => Promise<boolean>;
  readonly play: () => Promise<boolean>;
  readonly pause: () => void;
  readonly togglePlayback: () => Promise<boolean>;
  readonly stop: () => void;
  readonly seek: (timeSeconds: number) => void;
  readonly reset: () => void;
  /** Frame-loop-safe playback time; live sources do not cause React timer renders. */
  readonly getPlaybackTime: () => number;
  /** Returns the current Web Audio recording stream, recreating it if a caller stopped its track. */
  readonly getCaptureStream: () => MediaStream | null;
}

interface EngineState {
  sourceMode: AudioSourceMode;
  status: AudioEngineStatus;
  file: File | null;
  fileName: string | null;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  waveformPeaks: number[];
  error: string | null;
  liveStream: MediaStream | null;
  captureSettings: AudioCaptureSettings | null;
  sourceDetails: AudioSourceDetails | null;
  captureStream: MediaStream | null;
}

type StatePatch = Partial<EngineState>;
type LiveSourceMode = Extract<AudioSourceMode, "system" | "microphone">;
type StreamFactory = () => Promise<MediaStream>;

const FFT_SIZE = 4096;
const WAVEFORM_BUCKETS = 1024;
const MAX_WAVEFORM_SAMPLES_PER_BUCKET = 4096;
const MAX_AUDIO_FILE_BYTES = 128 * 1024 * 1024;
const MAX_DECODED_PCM_BYTES = 512 * 1024 * 1024;
const MAX_DECODED_DURATION_SECONDS = 30 * 60;
const METADATA_PROBE_TIMEOUT_MS = 8_000;
const WAVEFORM_YIELD_INTERVAL = 128;
const EMPTY_WAVEFORM: number[] = [];
const AUDIO_FILE_EXTENSION =
  /\.(?:aac|aif|aiff|alac|amr|caf|flac|m4a|m4b|mp3|mp4|oga|ogg|opus|wav|wave|webm)$/i;

class AudioEngineOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioEngineOperationError";
  }
}

function createInitialState(): EngineState {
  return {
    sourceMode: "none",
    status: "idle",
    file: null,
    fileName: null,
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    waveformPeaks: EMPTY_WAVEFORM,
    error: null,
    liveStream: null,
    captureSettings: null,
    sourceDetails: null,
    captureStream: null,
  };
}

function restorableTransportStatus(state: EngineState): AudioEngineStatus {
  if (state.status !== "loading") return state.status;
  if (state.sourceMode === "file") {
    if (state.isPlaying) return "playing";
    return state.currentTime > 0 ? "paused" : "ready";
  }
  if (state.sourceMode === "system" || state.sourceMode === "microphone") {
    return state.isPlaying ? "capturing" : "paused";
  }
  return "idle";
}

function nowSeconds(): number {
  if (typeof performance !== "undefined") return performance.now() / 1000;
  return Date.now() / 1000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getErrorName(error: unknown): string {
  if (typeof error !== "object" || error === null || !("name" in error)) return "";
  return typeof error.name === "string" ? error.name : "";
}

function getErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null || !("message" in error)) return "";
  return typeof error.message === "string" ? error.message : "";
}

function describeCaptureError(error: unknown, mode: LiveSourceMode): string {
  if (error instanceof AudioEngineOperationError) return error.message;

  const name = getErrorName(error);
  const label = mode === "system" ? "System audio sharing" : "Microphone access";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return `${label} was cancelled or denied.`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return mode === "system"
        ? "No shareable system-audio source was found."
        : "No microphone was found.";
    case "NotReadableError":
    case "TrackStartError":
      return mode === "system"
        ? "The selected audio source is already in use or could not be read."
        : "The microphone is already in use or could not be read.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "The browser could not satisfy the requested audio settings.";
    case "AbortError":
      return `${label} was interrupted before it could start.`;
    case "SecurityError":
      return `${label} requires a secure browser context (HTTPS or localhost).`;
    default:
      return getErrorMessage(error) || `${label} could not start.`;
  }
}

function describePlaybackError(error: unknown): string {
  const name = getErrorName(error);
  if (name === "NotAllowedError") {
    return "Playback was blocked by the browser. Interact with the page and try again.";
  }
  if (name === "NotSupportedError") {
    return "This browser cannot play the selected audio encoding.";
  }
  return getErrorMessage(error) || "Audio playback could not start.";
}

function describeMediaElementError(error: MediaError | null): string {
  switch (error?.code) {
    case 1:
      return "Audio loading was aborted.";
    case 2:
      return "A network or local-file read error interrupted audio loading.";
    case 3:
      return "The browser could not decode this audio file.";
    case 4:
      return "This browser does not support the selected audio format.";
    default:
      return "The audio file could not be loaded.";
  }
}

function validateAudioFile(file: File): string | null {
  if (!file.name.trim()) return "Choose a named audio file.";
  if (file.size <= 0) return "The selected audio file is empty.";
  if (file.size > MAX_AUDIO_FILE_BYTES) {
    return "This audio file is larger than the 128 MB in-browser decoding limit.";
  }

  const hasAudioMimeType =
    file.type.startsWith("audio/") ||
    file.type === "application/ogg" ||
    file.type === "video/mp4" ||
    file.type === "video/webm";

  if (!hasAudioMimeType && !AUDIO_FILE_EXTENSION.test(file.name)) {
    return "Choose a supported audio file (for example MP3, WAV, M4A, FLAC, OGG, Opus, or WebM).";
  }

  return null;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function probeAudioDuration(objectUrl: string): Promise<number | null> {
  if (typeof Audio === "undefined") return null;

  return new Promise((resolve) => {
    const probe = new Audio();
    let settled = false;
    const finish = (duration: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      probe.removeEventListener("loadedmetadata", onLoadedMetadata);
      probe.removeEventListener("error", onError);
      probe.removeAttribute("src");
      try {
        probe.load();
      } catch {
        // The detached probe may already have been discarded by the browser.
      }
      resolve(duration);
    };
    const onLoadedMetadata = (): void => {
      finish(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : null);
    };
    const onError = (): void => finish(null);
    const timeout = setTimeout(() => finish(null), METADATA_PROBE_TIMEOUT_MS);

    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", onLoadedMetadata);
    probe.addEventListener("error", onError);
    try {
      probe.src = objectUrl;
      probe.load();
    } catch {
      finish(null);
    }
  });
}

async function buildWaveformPeaks(
  audioBuffer: AudioBuffer,
  shouldAbort: () => boolean,
): Promise<number[] | null> {
  if (audioBuffer.length === 0 || audioBuffer.numberOfChannels === 0) {
    return EMPTY_WAVEFORM;
  }

  const bucketCount = Math.min(WAVEFORM_BUCKETS, audioBuffer.length);
  const peaks = new Array<number>(bucketCount).fill(0);
  let globalPeak = 0;

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const samples = audioBuffer.getChannelData(channel);

    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = Math.floor((bucket * samples.length) / bucketCount);
      const end = Math.max(start + 1, Math.floor(((bucket + 1) * samples.length) / bucketCount));
      const stride = Math.max(1, Math.floor((end - start) / MAX_WAVEFORM_SAMPLES_PER_BUCKET));
      let peak = peaks[bucket];

      for (let index = start; index < end; index += stride) {
        const magnitude = Math.abs(samples[index]);
        if (magnitude > peak) peak = magnitude;
      }

      peaks[bucket] = Math.min(1, peak);
      if (peaks[bucket] > globalPeak) globalPeak = peaks[bucket];

      if ((bucket + 1) % WAVEFORM_YIELD_INTERVAL === 0) {
        if (shouldAbort()) return null;
        await yieldToMainThread();
      }
    }
  }

  if (shouldAbort()) return null;

  if (globalPeak > 0) {
    for (let index = 0; index < peaks.length; index += 1) {
      peaks[index] /= globalPeak;
    }
  }

  return peaks;
}

function safelyDisconnect(node: AudioNode, destination?: AudioNode): void {
  try {
    if (destination) node.disconnect(destination);
    else node.disconnect();
  } catch {
    // Disconnect is intentionally idempotent across source switches and cleanup.
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Owns the complete browser-audio lifecycle used by playback, live analysis,
 * and recording. Render one persistent `<audio ref={audioRef} />` alongside
 * the component that calls this hook.
 */
export function useAudioEngine(): UseAudioEngineResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [state, setState] = useState<EngineState>(createInitialState);
  const stateRef = useRef<EngineState>(state);
  const mountedRef = useRef(false);
  const operationRef = useRef(0);
  const transportOperationRef = useRef(0);
  const stopPauseEventPendingRef = useRef(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const contextStateCleanupRef = useRef<(() => void) | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const captureDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const captureTrackCleanupRef = useRef<(() => void) | null>(null);
  const activeSourceRef = useRef<AudioNode | null>(null);
  const mediaElementSourcesRef = useRef(
    new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>(),
  );

  const objectUrlRef = useRef<string | null>(null);
  const fileLoadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const audioEventElementRef = useRef<HTMLAudioElement | null>(null);
  const audioEventCleanupRef = useRef<(() => void) | null>(null);

  const liveSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveEventCleanupRef = useRef<(() => void) | null>(null);
  const liveElapsedRef = useRef(0);
  const liveResumedAtRef = useRef<number | null>(null);

  const updateState = useCallback((patch: StatePatch): void => {
    const nextState = { ...stateRef.current, ...patch };
    stateRef.current = nextState;
    if (mountedRef.current) setState(nextState);
  }, []);

  const invalidatePendingOperation = useCallback((): void => {
    operationRef.current += 1;
  }, []);

  const invalidatePendingTransport = useCallback((): void => {
    transportOperationRef.current += 1;
  }, []);

  const freezeLiveClock = useCallback((): number => {
    const resumedAt = liveResumedAtRef.current;
    if (resumedAt !== null) {
      liveElapsedRef.current += Math.max(0, nowSeconds() - resumedAt);
      liveResumedAtRef.current = null;
    }
    return liveElapsedRef.current;
  }, []);

  const startLiveClock = useCallback((): void => {
    if (liveResumedAtRef.current === null) liveResumedAtRef.current = nowSeconds();
  }, []);

  const setMonitorEnabled = useCallback((enabled: boolean): void => {
    const context = audioContextRef.current;
    const monitor = monitorGainRef.current;
    if (!context || !monitor) return;

    monitor.gain.cancelScheduledValues(context.currentTime);
    monitor.gain.setValueAtTime(enabled ? 1 : 0, context.currentTime);
  }, []);

  const teardownCaptureDestination = useCallback((): void => {
    captureTrackCleanupRef.current?.();
    captureTrackCleanupRef.current = null;
    const destination = captureDestinationRef.current;
    if (!destination) {
      if (stateRef.current.captureStream !== null) updateState({ captureStream: null });
      return;
    }

    if (analyserRef.current) safelyDisconnect(analyserRef.current, destination);
    stopStream(destination.stream);
    captureDestinationRef.current = null;
    updateState({ captureStream: null });
  }, [updateState]);

  const ensureCoreGraph = useCallback((): AudioContext => {
    let context = audioContextRef.current;

    if (!context) {
      if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
        throw new AudioEngineOperationError("Web Audio is not available in this browser.");
      }
      context = new AudioContext({ latencyHint: "interactive" });
      audioContextRef.current = context;

      const observedContext = context;
      const onContextStateChange = (): void => {
        if (
          audioContextRef.current !== observedContext ||
          observedContext.state === "running" ||
          !stateRef.current.isPlaying
        ) {
          return;
        }

        invalidatePendingTransport();
        const mode = stateRef.current.sourceMode;
        let interruptedTime = stateRef.current.currentTime;
        if (mode === "file") {
          audioRef.current?.pause();
        } else if (mode === "system" || mode === "microphone") {
          liveStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
          interruptedTime = freezeLiveClock();
        }

        updateState({
          currentTime: interruptedTime,
          isPlaying: false,
          status: observedContext.state === "closed" ? "error" : "paused",
          error:
            observedContext.state === "closed"
              ? "The audio engine closed unexpectedly. Reload the page to continue."
              : "Audio was interrupted by the browser or operating system. Press play to resume.",
        });
      };

      observedContext.addEventListener("statechange", onContextStateChange);
      contextStateCleanupRef.current = (): void => {
        observedContext.removeEventListener("statechange", onContextStateChange);
      };
    }

    if (context.state === "closed") {
      throw new AudioEngineOperationError(
        "The audio engine is closed. Reload the page to start a new session.",
      );
    }

    let analyser = analyserRef.current;
    if (!analyser) {
      analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.minDecibels = -110;
      analyser.maxDecibels = -10;
      // FeatureBus owns the documented attack/release smoothing. Leaving the
      // AnalyserNode unsmoothed keeps spectral change measurements causal and
      // avoids an undocumented second temporal filter.
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;
    }

    if (!monitorGainRef.current) {
      const monitor = context.createGain();
      monitor.gain.value = 0;
      analyser.connect(monitor);
      monitor.connect(context.destination);
      monitorGainRef.current = monitor;
    }

    return context;
  }, [freezeLiveClock, invalidatePendingTransport, updateState]);

  const ensureCaptureDestination = useCallback(
    (providedContext?: AudioContext): MediaStreamAudioDestinationNode => {
      const context = providedContext ?? ensureCoreGraph();
      const existingDestination = captureDestinationRef.current;
      const destinationIsUsable = existingDestination?.stream
        .getAudioTracks()
        .some((track) => track.readyState === "live");

      if (existingDestination && !destinationIsUsable) teardownCaptureDestination();

      let destination = captureDestinationRef.current;
      if (!destination) {
        destination = context.createMediaStreamDestination();
        analyserRef.current!.connect(destination);
        captureDestinationRef.current = destination;
        const outputTrack = destination.stream.getAudioTracks()[0];
        if (outputTrack) {
          const observedDestination = destination;
          const onOutputEnded = (): void => {
            if (captureDestinationRef.current !== observedDestination) return;
            captureTrackCleanupRef.current?.();
            captureTrackCleanupRef.current = null;
            if (analyserRef.current) {
              safelyDisconnect(analyserRef.current, observedDestination);
            }
            captureDestinationRef.current = null;
            updateState({ captureStream: null });
          };
          outputTrack.addEventListener("ended", onOutputEnded);
          captureTrackCleanupRef.current = (): void => {
            outputTrack.removeEventListener("ended", onOutputEnded);
          };
        }
        updateState({ captureStream: destination.stream });
      }

      return destination;
    },
    [ensureCoreGraph, teardownCaptureDestination, updateState],
  );

  const getOrCreateMediaElementSource = useCallback(
    (audioElement: HTMLAudioElement): MediaElementAudioSourceNode => {
      const context = ensureCoreGraph();
      const existing = mediaElementSourcesRef.current.get(audioElement);
      if (existing) {
        if (existing.context !== context) {
          throw new AudioEngineOperationError(
            "The audio player belongs to an older audio session. Reload the page to continue.",
          );
        }
        return existing;
      }

      let source: MediaElementAudioSourceNode;
      try {
        source = context.createMediaElementSource(audioElement);
      } catch {
        throw new AudioEngineOperationError(
          "The audio player could not be connected to Web Audio. Keep one persistent audio element mounted.",
        );
      }
      mediaElementSourcesRef.current.set(audioElement, source);
      return source;
    },
    [ensureCoreGraph],
  );

  const disconnectActiveSource = useCallback((): void => {
    const activeSource = activeSourceRef.current;
    if (!activeSource) return;
    if (analyserRef.current) safelyDisconnect(activeSource, analyserRef.current);
    else safelyDisconnect(activeSource);
    activeSourceRef.current = null;
  }, []);

  const detachAudioEvents = useCallback((): void => {
    audioEventCleanupRef.current?.();
    audioEventCleanupRef.current = null;
    audioEventElementRef.current = null;
  }, []);

  const attachAudioEvents = useCallback(
    (audioElement: HTMLAudioElement): void => {
      if (audioEventElementRef.current === audioElement && audioEventCleanupRef.current) return;
      detachAudioEvents();

      const onDurationChange = (): void => {
        if (stateRef.current.sourceMode !== "file") return;
        const nextDuration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
        if (nextDuration > 0) updateState({ duration: nextDuration });
      };

      const onTimeUpdate = (): void => {
        if (stateRef.current.sourceMode !== "file") return;
        updateState({ currentTime: Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0 });
      };

      const onPlay = (): void => {
        if (stateRef.current.sourceMode !== "file") return;
        stopPauseEventPendingRef.current = false;
        updateState({ isPlaying: true, status: "playing", error: null });
      };

      const onPause = (): void => {
        if (stateRef.current.sourceMode !== "file") return;
        if (stopPauseEventPendingRef.current) {
          stopPauseEventPendingRef.current = false;
          updateState({ currentTime: 0, isPlaying: false, status: "ready" });
          return;
        }
        updateState({
          isPlaying: false,
          status: audioElement.ended ? "ready" : "paused",
        });
      };

      const onEnded = (): void => {
        if (stateRef.current.sourceMode !== "file") return;
        updateState({
          currentTime: stateRef.current.duration,
          isPlaying: false,
          status: "ready",
        });
      };

      const onError = (): void => {
        if (stateRef.current.sourceMode !== "file") return;
        updateState({
          isPlaying: false,
          status: "error",
          error: describeMediaElementError(audioElement.error),
        });
      };

      audioElement.addEventListener("loadedmetadata", onDurationChange);
      audioElement.addEventListener("durationchange", onDurationChange);
      audioElement.addEventListener("timeupdate", onTimeUpdate);
      audioElement.addEventListener("play", onPlay);
      audioElement.addEventListener("pause", onPause);
      audioElement.addEventListener("ended", onEnded);
      audioElement.addEventListener("error", onError);

      audioEventElementRef.current = audioElement;
      audioEventCleanupRef.current = (): void => {
        audioElement.removeEventListener("loadedmetadata", onDurationChange);
        audioElement.removeEventListener("durationchange", onDurationChange);
        audioElement.removeEventListener("timeupdate", onTimeUpdate);
        audioElement.removeEventListener("play", onPlay);
        audioElement.removeEventListener("pause", onPause);
        audioElement.removeEventListener("ended", onEnded);
        audioElement.removeEventListener("error", onError);
      };
    },
    [detachAudioEvents, updateState],
  );

  const clearFileResources = useCallback((): void => {
    stopPauseEventPendingRef.current = false;
    detachAudioEvents();

    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.pause();
      audioElement.removeAttribute("src");
      try {
        audioElement.load();
      } catch {
        // The element may already be detached during final unmount cleanup.
      }
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, [detachAudioEvents]);

  const releaseLiveStream = useCallback((): void => {
    freezeLiveClock();
    liveEventCleanupRef.current?.();
    liveEventCleanupRef.current = null;

    const source = liveSourceRef.current;
    if (source) {
      if (activeSourceRef.current === source) disconnectActiveSource();
      else safelyDisconnect(source);
    }
    liveSourceRef.current = null;

    stopStream(liveStreamRef.current);
    liveStreamRef.current = null;
    updateState({ liveStream: null });
  }, [disconnectActiveSource, freezeLiveClock, updateState]);

  const finishLiveStream = useCallback(
    (stream: MediaStream): void => {
      if (liveStreamRef.current !== stream) return;
      invalidatePendingTransport();
      releaseLiveStream();
      setMonitorEnabled(false);
      teardownCaptureDestination();
      liveElapsedRef.current = 0;
      liveResumedAtRef.current = null;
      updateState({
        sourceMode: "none",
        status: "idle",
        duration: 0,
        currentTime: 0,
        isPlaying: false,
        error: null,
        liveStream: null,
        captureSettings: null,
        sourceDetails: null,
      });
    },
    [
      invalidatePendingTransport,
      releaseLiveStream,
      setMonitorEnabled,
      teardownCaptureDestination,
      updateState,
    ],
  );

  const attachLiveEndEvents = useCallback(
    (stream: MediaStream): void => {
      liveEventCleanupRef.current?.();
      const audioTracks = stream.getAudioTracks();

      const onEnded = (): void => {
        const hasActiveTrack = audioTracks.some((track) => track.readyState === "live");
        if (!hasActiveTrack) finishLiveStream(stream);
      };

      audioTracks.forEach((track) => track.addEventListener("ended", onEnded));
      liveEventCleanupRef.current = (): void => {
        audioTracks.forEach((track) => track.removeEventListener("ended", onEnded));
      };
    },
    [finishLiveStream],
  );

  const loadFile = useCallback(
    async (file: File): Promise<boolean> => {
      const operation = ++operationRef.current;
      invalidatePendingTransport();
      const previousMode = stateRef.current.sourceMode;
      const previousStatus = restorableTransportStatus(stateRef.current);
      const validationError = validateAudioFile(file);
      if (validationError) {
        updateState({
          status: previousMode === "none" ? "error" : previousStatus,
          error: validationError,
        });
        return false;
      }

      const audioElement = audioRef.current;
      if (!audioElement) {
        updateState({
          status: previousMode === "none" ? "error" : previousStatus,
          error: "The audio player is not mounted. Render one persistent <audio> element with audioRef.",
        });
        return false;
      }

      updateState({ status: "loading", error: null });
      let nextUrl: string | null = null;
      let releaseQueueTurn = (): void => undefined;
      const queueTurn = new Promise<void>((resolve) => {
        releaseQueueTurn = resolve;
      });
      const previousQueueTurn = fileLoadQueueRef.current.catch(() => undefined);
      fileLoadQueueRef.current = previousQueueTurn.then(() => queueTurn);

      try {
        // decodeAudioData cannot be aborted. Serializing requests prevents two
        // whole-file PCM decodes from occupying memory at the same time, while
        // stale queued requests exit before reading their file.
        await previousQueueTurn;
        if (operation !== operationRef.current || !mountedRef.current) return false;

        const context = ensureCoreGraph();
        nextUrl = URL.createObjectURL(file);

        const probedDuration = await probeAudioDuration(nextUrl);
        if (operation !== operationRef.current || !mountedRef.current) return false;
        if (
          probedDuration !== null &&
          probedDuration > MAX_DECODED_DURATION_SECONDS
        ) {
          throw new AudioEngineOperationError(
            "This track is longer than the 30-minute safe limit for decoded waveform analysis.",
          );
        }

        const fileBytes = await file.arrayBuffer();
        if (operation !== operationRef.current || !mountedRef.current) return false;

        const decodedAudio = await context.decodeAudioData(fileBytes);
        if (operation !== operationRef.current || !mountedRef.current) return false;

        if (decodedAudio.duration > MAX_DECODED_DURATION_SECONDS) {
          throw new AudioEngineOperationError(
            "This track is longer than the 30-minute safe limit for decoded waveform analysis.",
          );
        }
        const decodedPcmBytes =
          decodedAudio.length *
          decodedAudio.numberOfChannels *
          Float32Array.BYTES_PER_ELEMENT;
        if (decodedPcmBytes > MAX_DECODED_PCM_BYTES) {
          throw new AudioEngineOperationError(
            "This track expands beyond the 512 MB safe decoded-audio limit.",
          );
        }

        const waveformPeaks = await buildWaveformPeaks(
          decodedAudio,
          () => operation !== operationRef.current || !mountedRef.current,
        );

        if (
          waveformPeaks === null ||
          operation !== operationRef.current ||
          !mountedRef.current
        ) {
          return false;
        }

        const mediaElementSource = getOrCreateMediaElementSource(audioElement);
        ensureCaptureDestination(context);

        invalidatePendingTransport();
        disconnectActiveSource();
        releaseLiveStream();
        clearFileResources();

        objectUrlRef.current = nextUrl;
        nextUrl = null;
        attachAudioEvents(audioElement);
        audioElement.preload = "auto";
        audioElement.src = objectUrlRef.current;

        setMonitorEnabled(true);
        mediaElementSource.connect(analyserRef.current!);
        activeSourceRef.current = mediaElementSource;
        audioElement.load();

        liveElapsedRef.current = 0;
        liveResumedAtRef.current = null;
        updateState({
          sourceMode: "file",
          status: "ready",
          file,
          fileName: file.name,
          duration: decodedAudio.duration,
          currentTime: 0,
          isPlaying: false,
          waveformPeaks,
          error: null,
          liveStream: null,
          captureSettings: null,
          sourceDetails: {
            sampleRate: decodedAudio.sampleRate,
            channelCount: decodedAudio.numberOfChannels,
          },
        });
        return true;
      } catch (error) {
        if (operation === operationRef.current && mountedRef.current) {
          const priorSourceStillActive =
            previousMode !== "none" && stateRef.current.sourceMode === previousMode;
          if (!priorSourceStillActive) teardownCaptureDestination();
          const message =
            error instanceof AudioEngineOperationError
              ? error.message
              : "The browser could not decode this audio file. It may be corrupt or use an unsupported codec.";
          updateState({
            status: priorSourceStillActive
              ? stateRef.current.status === "loading"
                ? previousStatus
                : stateRef.current.status
              : "error",
            error: message,
          });
        }
        return false;
      } finally {
        if (nextUrl) URL.revokeObjectURL(nextUrl);
        releaseQueueTurn();
      }
    },
    [
      attachAudioEvents,
      clearFileResources,
      disconnectActiveSource,
      ensureCaptureDestination,
      ensureCoreGraph,
      getOrCreateMediaElementSource,
      invalidatePendingTransport,
      releaseLiveStream,
      setMonitorEnabled,
      teardownCaptureDestination,
      updateState,
    ],
  );

  const beginLiveCapture = useCallback(
    async (mode: LiveSourceMode, createStream: StreamFactory): Promise<boolean> => {
      const operation = ++operationRef.current;
      invalidatePendingTransport();
      const previousMode = stateRef.current.sourceMode;
      const previousStatus = restorableTransportStatus(stateRef.current);
      updateState({ status: "loading", error: null });

      let requestedStream: MediaStream | null = null;
      let audioOnlyStream: MediaStream | null = null;
      let activated = false;

      try {
        const context = ensureCoreGraph();
        const streamPromise = createStream();
        const resumePromise = context.state !== "running" ? context.resume() : Promise.resolve();
        const [streamResult] = await Promise.allSettled([
          streamPromise,
          resumePromise,
        ]);

        if (streamResult.status === "rejected") throw streamResult.reason;
        requestedStream = streamResult.value;

        if (operation !== operationRef.current || !mountedRef.current) {
          stopStream(requestedStream);
          return false;
        }

        const audioTracks = requestedStream
          .getAudioTracks()
          .filter((track) => track.readyState === "live");
        if (audioTracks.length === 0) {
          throw new AudioEngineOperationError(
            mode === "system"
              ? 'No audio was shared. Select a browser tab or screen and enable "Share audio" in the browser dialog.'
              : "The selected microphone did not provide an active audio track.",
          );
        }

        audioOnlyStream = new MediaStream(audioTracks);
        const actualTrackSettings = audioTracks[0]?.getSettings();
        // Display capture usually requires video. It is no longer needed after
        // the audio tracks have been safely copied into an audio-only stream.
        requestedStream.getVideoTracks().forEach((track) => track.stop());

        const source = context.createMediaStreamSource(audioOnlyStream);
        if (operation !== operationRef.current || !mountedRef.current) {
          stopStream(audioOnlyStream);
          return false;
        }

        // The permission chooser can remain open long enough for Safari or the
        // OS to interrupt a context that resumed at the beginning of the click.
        // Revalidate immediately before connecting and publishing the source.
        if (context.state !== "running") {
          try {
            await context.resume();
          } catch {
            throw new AudioEngineOperationError("The browser could not start the Web Audio engine.");
          }
        }
        if (
          operation !== operationRef.current ||
          !mountedRef.current ||
          context.state !== "running"
        ) {
          stopStream(audioOnlyStream);
          if (context.state !== "running") {
            throw new AudioEngineOperationError("The Web Audio engine remained interrupted.");
          }
          return false;
        }

        ensureCaptureDestination(context);
        invalidatePendingTransport();
        disconnectActiveSource();
        releaseLiveStream();
        clearFileResources();
        setMonitorEnabled(false);

        source.connect(analyserRef.current!);
        activeSourceRef.current = source;
        liveSourceRef.current = source;
        liveStreamRef.current = audioOnlyStream;
        attachLiveEndEvents(audioOnlyStream);

        liveElapsedRef.current = 0;
        liveResumedAtRef.current = nowSeconds();
        activated = true;
        updateState({
          sourceMode: mode,
          status: "capturing",
          file: null,
          fileName: null,
          duration: 0,
          currentTime: 0,
          isPlaying: true,
          waveformPeaks: EMPTY_WAVEFORM,
          error: null,
          liveStream: audioOnlyStream,
          captureSettings: actualTrackSettings
            ? {
                sampleRate: actualTrackSettings.sampleRate,
                sampleSize: actualTrackSettings.sampleSize,
                channelCount: actualTrackSettings.channelCount,
                echoCancellation: actualTrackSettings.echoCancellation,
                noiseSuppression: actualTrackSettings.noiseSuppression,
                autoGainControl: actualTrackSettings.autoGainControl,
              }
            : null,
          sourceDetails: {
            sampleRate: actualTrackSettings?.sampleRate ?? context.sampleRate,
            channelCount: actualTrackSettings?.channelCount ?? audioTracks.length,
          },
        });
        return true;
      } catch (error) {
        if (!activated) {
          stopStream(audioOnlyStream);
          stopStream(requestedStream);
        }
        if (operation === operationRef.current && mountedRef.current) {
          const priorSourceStillActive =
            previousMode !== "none" && stateRef.current.sourceMode === previousMode;
          if (!priorSourceStillActive) teardownCaptureDestination();
          updateState({
            status: priorSourceStillActive
              ? stateRef.current.status === "loading"
                ? previousStatus
                : stateRef.current.status
              : "error",
            error: describeCaptureError(error, mode),
          });
        }
        return false;
      }
    },
    [
      attachLiveEndEvents,
      clearFileResources,
      disconnectActiveSource,
      ensureCaptureDestination,
      ensureCoreGraph,
      invalidatePendingTransport,
      releaseLiveStream,
      setMonitorEnabled,
      teardownCaptureDestination,
      updateState,
    ],
  );

  const startSystemCapture = useCallback(async (): Promise<boolean> => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== "function"
    ) {
      ++operationRef.current;
      invalidatePendingTransport();
      updateState({
        status:
          stateRef.current.sourceMode === "none"
            ? "error"
            : restorableTransportStatus(stateRef.current),
        error: "System audio sharing is not supported by this browser.",
      });
      return false;
    }

    return beginLiveCapture("system", () =>
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }),
    );
  }, [beginLiveCapture, invalidatePendingTransport, updateState]);

  const startMicrophone = useCallback(async (): Promise<boolean> => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      ++operationRef.current;
      invalidatePendingTransport();
      updateState({
        status:
          stateRef.current.sourceMode === "none"
            ? "error"
            : restorableTransportStatus(stateRef.current),
        error: "Microphone capture is not supported by this browser.",
      });
      return false;
    }

    return beginLiveCapture("microphone", () =>
      navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          // Ask for the least processed signal available. Browsers and devices
          // may still alter it, so the reported track settings are surfaced in
          // the science panel rather than assuming these constraints succeeded.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
          sampleRate: { ideal: 48_000 },
          sampleSize: { ideal: 24 },
        },
      }),
    );
  }, [beginLiveCapture, invalidatePendingTransport, updateState]);

  const play = useCallback(async (): Promise<boolean> => {
    const transportOperation = ++transportOperationRef.current;
    const mode = stateRef.current.sourceMode;
    const fileAtStart = stateRef.current.file;
    const liveStreamAtStart = liveStreamRef.current;
    const isCurrentRequest = (): boolean => {
      if (
        transportOperation !== transportOperationRef.current ||
        stateRef.current.sourceMode !== mode
      ) {
        return false;
      }
      return mode === "file"
        ? stateRef.current.file === fileAtStart
        : liveStreamRef.current === liveStreamAtStart;
    };

    if (mode === "none") {
      updateState({ status: "error", error: "Choose an audio source before pressing play." });
      return false;
    }

    try {
      const context = ensureCoreGraph();
      ensureCaptureDestination(context);

      if (mode === "file") {
        const audioElement = audioRef.current;
        if (!audioElement || !fileAtStart) {
          throw new AudioEngineOperationError("The selected audio file is no longer available.");
        }

        const source = getOrCreateMediaElementSource(audioElement);
        if (activeSourceRef.current !== source) {
          disconnectActiveSource();
          setMonitorEnabled(true);
          source.connect(analyserRef.current!);
          activeSourceRef.current = source;
        }
        attachAudioEvents(audioElement);

        if (
          audioElement.ended ||
          (Number.isFinite(audioElement.duration) && audioElement.currentTime >= audioElement.duration)
        ) {
          audioElement.currentTime = 0;
        }

        // Start both gesture-gated operations in the click task. Awaiting
        // resume before play can lose transient user activation on mobile.
        const resumePromise = context.state !== "running" ? context.resume() : Promise.resolve();
        const mediaPlayPromise = audioElement.play();
        const [resumeResult, playResult] = await Promise.allSettled([
          resumePromise,
          mediaPlayPromise,
        ]);

        if (!isCurrentRequest()) return false;
        if (resumeResult.status === "rejected") {
          audioElement.pause();
          throw resumeResult.reason;
        }
        if (playResult.status === "rejected") throw playResult.reason;
        if (context.state !== "running") {
          audioElement.pause();
          throw new AudioEngineOperationError("The Web Audio engine remained interrupted.");
        }

        updateState({ isPlaying: true, status: "playing", error: null });
        return true;
      }

      const stream = liveStreamAtStart;
      const liveTracks = stream?.getAudioTracks().filter((track) => track.readyState === "live") ?? [];
      if (liveTracks.length === 0) {
        throw new AudioEngineOperationError("The live audio source has ended. Start capture again.");
      }

      if (context.state !== "running") await context.resume();
      if (!isCurrentRequest()) return false;
      if (context.state !== "running") {
        throw new AudioEngineOperationError("The Web Audio engine remained interrupted.");
      }

      setMonitorEnabled(false);
      liveTracks.forEach((track) => {
        track.enabled = true;
      });
      startLiveClock();
      updateState({ isPlaying: true, status: "capturing", error: null });
      return true;
    } catch (error) {
      if (!isCurrentRequest()) return false;
      updateState({ isPlaying: false, status: "error", error: describePlaybackError(error) });
      return false;
    }
  }, [
    attachAudioEvents,
    disconnectActiveSource,
    ensureCaptureDestination,
    ensureCoreGraph,
    getOrCreateMediaElementSource,
    setMonitorEnabled,
    startLiveClock,
    updateState,
  ]);

  const pause = useCallback((): void => {
    invalidatePendingTransport();
    const mode = stateRef.current.sourceMode;
    if (mode === "file") {
      audioRef.current?.pause();
      updateState({ isPlaying: false, status: "paused" });
      return;
    }

    if (mode === "system" || mode === "microphone") {
      liveStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      const elapsed = freezeLiveClock();
      updateState({ currentTime: elapsed, isPlaying: false, status: "paused" });
    }
  }, [freezeLiveClock, invalidatePendingTransport, updateState]);

  const togglePlayback = useCallback(async (): Promise<boolean> => {
    if (stateRef.current.isPlaying) {
      pause();
      return true;
    }
    return play();
  }, [pause, play]);

  const stop = useCallback((): void => {
    ++operationRef.current;
    invalidatePendingTransport();
    const mode = stateRef.current.sourceMode;

    if (mode === "file") {
      const audioElement = audioRef.current;
      if (audioElement && !audioElement.paused) stopPauseEventPendingRef.current = true;
      audioElement?.pause();
      if (audioElement) {
        try {
          audioElement.currentTime = 0;
        } catch {
          // Metadata may not be available yet.
        }
      }
      updateState({ currentTime: 0, isPlaying: false, status: "ready", error: null });
      return;
    }

    if (mode === "system" || mode === "microphone") {
      releaseLiveStream();
      setMonitorEnabled(false);
      teardownCaptureDestination();
      liveElapsedRef.current = 0;
      liveResumedAtRef.current = null;
      updateState({
        sourceMode: "none",
        status: "idle",
        duration: 0,
        currentTime: 0,
        isPlaying: false,
        error: null,
        liveStream: null,
        captureSettings: null,
        sourceDetails: null,
      });
      return;
    }

    updateState({ status: "idle", currentTime: 0, isPlaying: false, error: null });
  }, [
    invalidatePendingTransport,
    releaseLiveStream,
    setMonitorEnabled,
    teardownCaptureDestination,
    updateState,
  ]);

  const seek = useCallback(
    (timeSeconds: number): void => {
      if (stateRef.current.sourceMode !== "file" || !Number.isFinite(timeSeconds)) return;
      const audioElement = audioRef.current;
      if (!audioElement) return;

      const knownDuration = Number.isFinite(audioElement.duration)
        ? audioElement.duration
        : stateRef.current.duration;
      const nextTime = clamp(timeSeconds, 0, Math.max(0, knownDuration));

      try {
        audioElement.currentTime = nextTime;
        updateState({ currentTime: nextTime, error: null });
      } catch {
        updateState({ error: "The audio timeline is not ready to seek yet." });
      }
    },
    [updateState],
  );

  const reset = useCallback((): void => {
    ++operationRef.current;
    invalidatePendingTransport();
    disconnectActiveSource();
    releaseLiveStream();
    clearFileResources();
    setMonitorEnabled(false);
    teardownCaptureDestination();

    liveElapsedRef.current = 0;
    liveResumedAtRef.current = null;

    // A MediaElementAudioSourceNode can only be created once for a given
    // element. Keep this context and source-node cache alive across reset, and
    // perform the hard close only when the hook unmounts. Disconnecting every
    // input keeps the reset graph silent without a suspend/resume race.

    updateState(createInitialState());
  }, [
    clearFileResources,
    disconnectActiveSource,
    invalidatePendingTransport,
    releaseLiveStream,
    setMonitorEnabled,
    teardownCaptureDestination,
    updateState,
  ]);

  const getPlaybackTime = useCallback((): number => {
    const mode = stateRef.current.sourceMode;
    if (mode === "file") {
      const mediaTime = audioRef.current?.currentTime;
      return mediaTime !== undefined && Number.isFinite(mediaTime)
        ? mediaTime
        : stateRef.current.currentTime;
    }

    if (mode === "system" || mode === "microphone") {
      const resumedAt = liveResumedAtRef.current;
      return liveElapsedRef.current + (resumedAt === null ? 0 : Math.max(0, nowSeconds() - resumedAt));
    }

    return 0;
  }, []);

  const getCaptureStream = useCallback((): MediaStream | null => {
    if (stateRef.current.sourceMode === "none") return null;
    try {
      return ensureCaptureDestination().stream;
    } catch (error) {
      updateState({
        error:
          error instanceof AudioEngineOperationError
            ? error.message
            : "The recording audio stream could not be created.",
      });
      return null;
    }
  }, [ensureCaptureDestination, updateState]);

  useEffect(() => {
    mountedRef.current = true;
    // Reconcile the ref-backed state after React Strict Mode's simulated
    // teardown/setup cycle. On a normal mount this is the same object and bails out.
    setState(stateRef.current);

    return (): void => {
      mountedRef.current = false;
      invalidatePendingOperation();
      invalidatePendingTransport();

      disconnectActiveSource();
      releaseLiveStream();
      clearFileResources();
      setMonitorEnabled(false);
      teardownCaptureDestination();

      const analyser = analyserRef.current;
      const monitor = monitorGainRef.current;
      if (analyser) safelyDisconnect(analyser);
      if (monitor) safelyDisconnect(monitor);

      analyserRef.current = null;
      monitorGainRef.current = null;
      activeSourceRef.current = null;
      mediaElementSourcesRef.current = new WeakMap();

      contextStateCleanupRef.current?.();
      contextStateCleanupRef.current = null;
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
      stateRef.current = createInitialState();
    };
  }, [
    clearFileResources,
    disconnectActiveSource,
    invalidatePendingOperation,
    invalidatePendingTransport,
    releaseLiveStream,
    setMonitorEnabled,
    teardownCaptureDestination,
  ]);

  const isLive = state.sourceMode === "system" || state.sourceMode === "microphone";

  return {
    audioRef,
    analyserRef,
    sourceMode: state.sourceMode,
    status: state.status,
    hasSource: state.sourceMode !== "none",
    file: state.file,
    fileName: state.fileName,
    duration: state.duration,
    currentTime: state.currentTime,
    isPlaying: state.isPlaying,
    waveformPeaks: state.waveformPeaks,
    error: state.error,
    liveStream: state.liveStream,
    captureSettings: state.captureSettings,
    sourceDetails: state.sourceDetails,
    isLive,
    captureStream: state.captureStream,
    loadFile,
    startSystemCapture,
    startMicrophone,
    play,
    pause,
    togglePlayback,
    stop,
    seek,
    reset,
    getPlaybackTime,
    getCaptureStream,
  };
}

export default useAudioEngine;
