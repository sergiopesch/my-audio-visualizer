"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export type RecorderStatus =
  | "idle"
  | "preparing"
  | "recording"
  | "ready"
  | "error";

export type RecorderSourceMode =
  | "none"
  | "file"
  | "system"
  | "microphone";

export interface CanvasRecorderOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  sourceMode: RecorderSourceMode;
  duration: number;
  getPlaybackTime: () => number;
  getCaptureStream: () => MediaStream | null;
  play: () => Promise<boolean | void>;
  pause: () => void;
  seek: (time: number) => void;
}

export interface StartRecordingOptions {
  fps?: 30 | 60;
  fromStart?: boolean;
}

export interface CanvasRecorderResult {
  status: RecorderStatus;
  progress: number;
  elapsed: number;
  error: string | null;
  notice: string | null;
  downloadUrl: string | null;
  mimeType: string;
  extension: string;
  start: (options?: StartRecordingOptions) => Promise<void>;
  stop: () => void;
  cancel: () => void;
  reset: () => void;
}

export type UseCanvasRecorderOptions = CanvasRecorderOptions;
export type UseCanvasRecorderResult = CanvasRecorderResult;

interface RecorderViewState {
  status: RecorderStatus;
  progress: number;
  elapsed: number;
  error: string | null;
  notice: string | null;
  downloadUrl: string | null;
  mimeType: string;
  extension: string;
}

interface PlaybackControls {
  getPlaybackTime: () => number;
  play: () => Promise<boolean | void>;
  pause: () => void;
  seek: (time: number) => void;
}

interface PlaybackSnapshot {
  sourceMode: RecorderSourceMode;
  originalTime: number;
  wasPlaying: boolean;
  controls: PlaybackControls;
}

interface RecorderSession extends PlaybackSnapshot {
  recorder: MediaRecorder;
  chunks: Blob[];
  encodedBytes: number;
  ownedTracks: MediaStreamTrack[];
  audioElement: HTMLAudioElement | null;
  endedHandler: (() => void) | null;
  progressTimer: ReturnType<typeof setInterval> | null;
  stopFallbackTimer: ReturnType<typeof setTimeout> | null;
  visibilityHandler: (() => void) | null;
  mimeType: string;
  extension: string;
  duration: number;
  playbackStartTime: number;
  wallClockStart: number;
  visibilityPausedAt: number | null;
  visibilityPausedTotal: number;
  lastElapsed: number;
  lastProgress: number;
  stopRequested: boolean;
  finalized: boolean;
  restorePlayback: boolean;
  completionNotice: string | null;
}

interface MimeCandidate {
  mimeType: string;
  extension: string;
}

const MIME_CANDIDATES: readonly MimeCandidate[] = [
  { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
  { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
  { mimeType: "video/webm;codecs=opus", extension: "webm" },
  { mimeType: "video/webm", extension: "webm" },
  {
    mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    extension: "mp4",
  },
  { mimeType: "video/mp4;codecs=h264,aac", extension: "mp4" },
  { mimeType: "video/mp4", extension: "mp4" },
];

const RECORDER_TIMESLICE_MS = 1_000;
const PROGRESS_INTERVAL_MS = 100;
const STOP_EVENT_FALLBACK_MS = 2_000;
const MAX_RECORDING_SECONDS = 10 * 60;
const MAX_ENCODED_BYTES = 256 * 1024 * 1024;

function initialState(): RecorderViewState {
  return {
    status: "idle",
    progress: 0,
    elapsed: 0,
    error: null,
    notice: null,
    downloadUrl: null,
    mimeType: "",
    extension: "webm",
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clockNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("matroska")) return "mkv";
  return "webm";
}

function stopTracks(tracks: MediaStreamTrack[]): void {
  for (const track of tracks) {
    try {
      track.stop();
    } catch {
      // A track can already be ended by the browser while stopping a recorder.
    }
  }
  tracks.length = 0;
}

function removeSessionListeners(session: RecorderSession): void {
  if (session.endedHandler && session.audioElement) {
    session.audioElement.removeEventListener("ended", session.endedHandler);
  }
  session.endedHandler = null;

  if (session.visibilityHandler) {
    document.removeEventListener("visibilitychange", session.visibilityHandler);
    session.visibilityHandler = null;
  }

  if (session.progressTimer !== null) {
    clearInterval(session.progressTimer);
    session.progressTimer = null;
  }
  if (session.stopFallbackTimer !== null) {
    clearTimeout(session.stopFallbackTimer);
    session.stopFallbackTimer = null;
  }

  session.recorder.ondataavailable = null;
  session.recorder.onerror = null;
  session.recorder.onstop = null;
}

function restorePlaybackSnapshot(snapshot: PlaybackSnapshot): void {
  if (snapshot.sourceMode !== "file") return;

  try {
    snapshot.controls.pause();
  } catch {
    // The source may have been detached while the recorder was shutting down.
  }

  try {
    snapshot.controls.seek(snapshot.originalTime);
  } catch {
    // The media element may no longer have a seekable source.
  }

  if (!snapshot.wasPlaying) return;

  try {
    void snapshot.controls.play().catch(() => {
      // Restoring playback is best-effort (for example, autoplay may be denied).
    });
  } catch {
    // Treat a synchronous play failure the same as a rejected play promise.
  }
}

function recorderErrorFromEvent(event: Event): string {
  const possibleError = (event as Event & { error?: unknown }).error;
  return errorMessage(
    possibleError,
    "The browser stopped the recording unexpectedly.",
  );
}

function createRecorder(stream: MediaStream): {
  recorder: MediaRecorder;
  mimeType: string;
  extension: string;
} {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support video recording.");
  }

  for (const candidate of MIME_CANDIDATES) {
    let supported: boolean;
    try {
      supported = MediaRecorder.isTypeSupported(candidate.mimeType);
    } catch {
      continue;
    }
    if (!supported) continue;

    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: candidate.mimeType,
      });
      const mimeType = recorder.mimeType || candidate.mimeType;
      return {
        recorder,
        mimeType,
        extension: extensionForMimeType(mimeType) || candidate.extension,
      };
    } catch {
      // Try the next format before falling back to the browser default.
    }
  }

  // Let the browser choose its native container when it supports MediaRecorder
  // but advertises none of the common explicit MIME combinations above.
  try {
    const recorder = new MediaRecorder(stream);
    const mimeType = recorder.mimeType || "video/webm";
    return {
      recorder,
      mimeType,
      extension: extensionForMimeType(mimeType),
    };
  } catch (error) {
    throw new Error(
      errorMessage(error, "No supported video recording format was found."),
      { cause: error },
    );
  }
}

export function useCanvasRecorder({
  canvasRef,
  audioRef,
  sourceMode,
  duration,
  getPlaybackTime,
  getCaptureStream,
  play,
  pause,
  seek,
}: CanvasRecorderOptions): CanvasRecorderResult {
  const [viewState, setViewState] = useState<RecorderViewState>(initialState);
  const mountedRef = useRef(false);
  const sessionRef = useRef<RecorderSession | null>(null);
  const downloadUrlRef = useRef<string | null>(null);
  const previousSourceModeRef = useRef(sourceMode);

  const revokeDownloadUrl = useCallback(() => {
    const url = downloadUrlRef.current;
    if (!url) return;

    if (typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(url);
    }
    downloadUrlRef.current = null;
  }, []);

  const forceAbortSession = useCallback(
    (session: RecorderSession, shouldRestorePlayback: boolean) => {
      if (session.finalized) return;

      session.finalized = true;
      session.restorePlayback = shouldRestorePlayback;
      removeSessionListeners(session);

      if (sessionRef.current === session) {
        sessionRef.current = null;
      }

      if (session.recorder.state !== "inactive") {
        try {
          session.recorder.stop();
        } catch {
          // The recorder may transition to inactive between the state read and stop.
        }
      }

      stopTracks(session.ownedTracks);
      session.chunks.length = 0;

      if (shouldRestorePlayback) {
        restorePlaybackSnapshot(session);
      }
    },
    [],
  );

  const completeSession = useCallback(
    (session: RecorderSession) => {
      if (session.finalized) return;

      session.finalized = true;
      removeSessionListeners(session);
      stopTracks(session.ownedTracks);

      if (sessionRef.current === session) {
        sessionRef.current = null;
      }

      const chunks = session.chunks;
      session.chunks = [];

      let nextState: RecorderViewState;
      try {
        if (chunks.length === 0) {
          throw new Error("The recording finished without producing video data.");
        }

        const chunkMimeType = chunks.find((chunk) => chunk.type)?.type;
        const mimeType =
          chunkMimeType || session.recorder.mimeType || session.mimeType;
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size === 0) {
          throw new Error("The recording finished without producing video data.");
        }
        if (typeof URL.createObjectURL !== "function") {
          throw new Error("This browser cannot create a local download link.");
        }

        revokeDownloadUrl();
        const downloadUrl = URL.createObjectURL(blob);
        downloadUrlRef.current = downloadUrl;

        nextState = {
          status: "ready",
          progress: clamp(session.lastProgress, 0, 1),
          elapsed: Math.max(0, session.lastElapsed),
          error: null,
          notice: session.completionNotice,
          downloadUrl,
          mimeType,
          extension: extensionForMimeType(mimeType),
        };
      } catch (error) {
        nextState = {
          status: "error",
          progress: clamp(session.lastProgress, 0, 1),
          elapsed: Math.max(0, session.lastElapsed),
          error: errorMessage(error, "The recording could not be finalized."),
          notice: null,
          downloadUrl: null,
          mimeType: session.mimeType,
          extension: session.extension,
        };
      }

      if (session.restorePlayback) {
        restorePlaybackSnapshot(session);
      }
      if (mountedRef.current) {
        setViewState(nextState);
      }
    },
    [revokeDownloadUrl],
  );

  const failSession = useCallback(
    (session: RecorderSession, error: unknown) => {
      const message = errorMessage(error, "The recording could not continue.");
      forceAbortSession(session, true);
      revokeDownloadUrl();

      if (mountedRef.current) {
        setViewState({
          status: "error",
          progress: clamp(session.lastProgress, 0, 1),
          elapsed: Math.max(0, session.lastElapsed),
          error: message,
          notice: null,
          downloadUrl: null,
          mimeType: session.mimeType,
          extension: session.extension,
        });
      }
    },
    [forceAbortSession, revokeDownloadUrl],
  );

  const updateSessionMetrics = useCallback(
    (session: RecorderSession, completed = false): boolean => {
      if (session.finalized || sessionRef.current !== session) return false;

      const now = clockNow();
      const activeVisibilityPause = session.visibilityPausedAt === null
        ? 0
        : Math.max(0, now - session.visibilityPausedAt);
      let elapsed = Math.max(
        0,
        (now - session.wallClockStart - session.visibilityPausedTotal - activeVisibilityPause) / 1_000,
      );
      let progress = 0;
      let reachedEnd = false;

      if (session.sourceMode === "file") {
        let playbackTime: number | null = null;
        try {
          const currentTime = session.controls.getPlaybackTime();
          if (Number.isFinite(currentTime)) {
            playbackTime = Math.max(0, currentTime);
          }
        } catch {
          // Wall-clock elapsed remains a useful fallback during a transient seek.
        }

        if (playbackTime !== null) {
          elapsed = Math.max(0, playbackTime - session.playbackStartTime);
          if (session.duration > 0) {
            reachedEnd = playbackTime >= session.duration;
          }
        }

        const expectedDuration = Math.max(
          0,
          session.duration - session.playbackStartTime,
        );
        if (expectedDuration > 0) {
          progress = clamp(elapsed / expectedDuration, 0, 1);
        }
      }

      if (completed) {
        const expectedDuration = Math.max(
          0,
          session.duration - session.playbackStartTime,
        );
        if (session.sourceMode === "file" && expectedDuration > 0) {
          elapsed = expectedDuration;
          progress = 1;
        }
      }

      session.lastElapsed = elapsed;
      session.lastProgress = clamp(progress, 0, 1);

      if (mountedRef.current) {
        setViewState((current) => ({
          ...current,
          progress: session.lastProgress,
          elapsed: session.lastElapsed,
        }));
      }

      return reachedEnd;
    },
    [],
  );

  const requestSessionStop = useCallback(
    (session: RecorderSession, completed = false) => {
      if (
        session.finalized ||
        session.stopRequested ||
        sessionRef.current !== session
      ) {
        return;
      }

      updateSessionMetrics(session, completed);
      session.stopRequested = true;

      if (session.progressTimer !== null) {
        clearInterval(session.progressTimer);
        session.progressTimer = null;
      }

      if (session.sourceMode === "file") {
        try {
          session.controls.pause();
        } catch {
          // Finalization still succeeds if the media source was just detached.
        }
      }

      try {
        if (session.recorder.state === "inactive") {
          session.stopFallbackTimer = setTimeout(() => {
            completeSession(session);
          }, 0);
          return;
        }

        session.recorder.stop();
        session.stopFallbackTimer = setTimeout(() => {
          if (session.recorder.state === "inactive") {
            completeSession(session);
          }
        }, STOP_EVENT_FALLBACK_MS);
      } catch (error) {
        failSession(session, error);
      }
    },
    [completeSession, failSession, updateSessionMetrics],
  );

  const start = useCallback(
    async (options: StartRecordingOptions = {}) => {
      if (sessionRef.current) return;

      revokeDownloadUrl();
      if (mountedRef.current) {
        setViewState({
          status: "preparing",
          progress: 0,
          elapsed: 0,
          error: null,
          notice: null,
          downloadUrl: null,
          mimeType: "",
          extension: "webm",
        });
      }

      const controls: PlaybackControls = {
        getPlaybackTime,
        play,
        pause,
        seek,
      };
      const mode = sourceMode;
      const ownedTracks: MediaStreamTrack[] = [];
      let snapshot: PlaybackSnapshot | null = null;
      let session: RecorderSession | null = null;

      try {
        if (mode === "none") {
          throw new Error("Choose an audio source before recording.");
        }
        if (mode === "file" && finiteTime(duration) > MAX_RECORDING_SECONDS) {
          throw new Error(
            "Browser rendering is limited to 10 minutes per file to protect this tab from running out of memory.",
          );
        }
        if (typeof MediaStream === "undefined") {
          throw new Error("This browser does not support media capture.");
        }

        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error("The visualizer canvas is not available.");
        }
        if (typeof canvas.captureStream !== "function") {
          throw new Error("This browser cannot capture the visualizer canvas.");
        }

        let originalTime = 0;
        try {
          originalTime = finiteTime(controls.getPlaybackTime());
        } catch {
          // A live source may not expose a meaningful playback clock.
        }
        const audioElement = audioRef.current;
        const wasPlaying =
          mode === "file" &&
          audioElement !== null &&
          !audioElement.paused &&
          !audioElement.ended;

        snapshot = {
          sourceMode: mode,
          originalTime,
          wasPlaying,
          controls,
        };

        const fromStart = mode === "file" && (options.fromStart ?? true);
        const playbackStartTime = fromStart ? 0 : originalTime;

        if (mode === "file") {
          // Freeze playback while capture is prepared so the first audio sample
          // cannot precede the first recorded canvas frame.
          controls.pause();
          controls.seek(playbackStartTime);
        }

        const fps = options.fps ?? 30;
        const canvasStream = canvas.captureStream(fps);
        const canvasTracks = canvasStream.getVideoTracks();
        if (canvasTracks.length === 0) {
          throw new Error("The visualizer canvas did not provide a video track.");
        }
        ownedTracks.push(...canvasTracks);

        const captureStream = getCaptureStream();
        if (!captureStream) {
          throw new Error("The audio capture graph is not ready.");
        }
        const sourceAudioTracks = captureStream.getAudioTracks();
        if (sourceAudioTracks.length === 0) {
          throw new Error("The audio capture graph did not provide an audio track.");
        }

        // Recorder-owned clones are the critical boundary here: stopping an
        // export must never stop the audio engine's MediaStreamDestination.
        const clonedAudioTracks: MediaStreamTrack[] = [];
        for (const sourceTrack of sourceAudioTracks) {
          const clone = sourceTrack.clone();
          clonedAudioTracks.push(clone);
          ownedTracks.push(clone);
        }

        const combinedStream = new MediaStream([
          ...canvasTracks,
          ...clonedAudioTracks,
        ]);
        const selected = createRecorder(combinedStream);

        session = {
          ...snapshot,
          recorder: selected.recorder,
          chunks: [],
          encodedBytes: 0,
          ownedTracks,
          audioElement,
          endedHandler: null,
          progressTimer: null,
          stopFallbackTimer: null,
          visibilityHandler: null,
          mimeType: selected.mimeType,
          extension: selected.extension,
          duration: finiteTime(duration),
          playbackStartTime,
          wallClockStart: clockNow(),
          visibilityPausedAt: null,
          visibilityPausedTotal: 0,
          lastElapsed: 0,
          lastProgress: 0,
          stopRequested: false,
          finalized: false,
          restorePlayback: true,
          completionNotice: null,
        };
        sessionRef.current = session;

        selected.recorder.ondataavailable = (event) => {
          if (!session || session.finalized || event.data.size === 0) return;
          session.chunks.push(event.data);
          session.encodedBytes += event.data.size;
          if (
            session.encodedBytes >= MAX_ENCODED_BYTES &&
            !session.stopRequested
          ) {
            session.completionNotice =
              "The render was finished early at the 256 MB browser-memory safety limit.";
            requestSessionStop(session);
          }
        };
        selected.recorder.onerror = (event) => {
          if (!session || session.finalized) return;
          failSession(session, recorderErrorFromEvent(event));
        };
        selected.recorder.onstop = () => {
          if (!session || session.finalized) return;
          updateSessionMetrics(session);
          completeSession(session);
        };

        if (mode === "file" && audioElement) {
          session.endedHandler = () => {
            if (!session || session.finalized) return;
            requestSessionStop(session, true);
          };
          audioElement.addEventListener("ended", session.endedHandler);
        }

        session.visibilityHandler = () => {
          if (!session || session.finalized || session.stopRequested) return;

          if (document.hidden) {
            if (session.recorder.state !== "recording") return;
            try {
              session.recorder.pause();
              session.visibilityPausedAt = clockNow();
              if (session.sourceMode === "file") session.controls.pause();
            } catch (error) {
              failSession(session, error);
            }
            return;
          }

          if (session.visibilityPausedAt === null) return;
          session.visibilityPausedTotal += Math.max(
            0,
            clockNow() - session.visibilityPausedAt,
          );
          session.visibilityPausedAt = null;

          requestAnimationFrame(() => {
            if (!session || session.finalized || session.stopRequested) return;
            try {
              if (session.recorder.state === "paused") session.recorder.resume();
            } catch (error) {
              failSession(session, error);
              return;
            }
            if (session.sourceMode === "file") {
              void session.controls.play().then((started) => {
                if (started === false && session && !session.finalized) {
                  failSession(
                    session,
                    new Error("Playback could not resume after returning to the export tab."),
                  );
                }
              }).catch((error) => {
                if (session && !session.finalized) failSession(session, error);
              });
            }
          });
        };
        document.addEventListener("visibilitychange", session.visibilityHandler);

        // MediaRecorder must be active before playback resumes; otherwise the
        // opening beat can be audible but absent from the video.
        selected.recorder.start(RECORDER_TIMESLICE_MS);
        session.wallClockStart = clockNow();

        if (mountedRef.current) {
          setViewState({
            status: "recording",
            progress: 0,
            elapsed: 0,
            error: null,
            notice: null,
            downloadUrl: null,
            mimeType: session.mimeType,
            extension: session.extension,
          });
        }

        session.progressTimer = setInterval(() => {
          if (!session || session.finalized) return;
          const reachedEnd = updateSessionMetrics(session);
          if (reachedEnd) {
            requestSessionStop(session, true);
          } else if (
            session.sourceMode !== "file" &&
            session.lastElapsed >= MAX_RECORDING_SECONDS
          ) {
            session.completionNotice =
              "The live render reached the 10-minute browser-memory safety limit.";
            requestSessionStop(session);
          }
        }, PROGRESS_INTERVAL_MS);

        try {
          const playbackStarted = await controls.play();
          if (playbackStarted === false) {
            throw new Error("Audio playback could not start for the recording.");
          }
        } catch (error) {
          if (sessionRef.current === session && !session.finalized) {
            failSession(session, error);
          }
          return;
        }

        // A pending play() can settle after a cancel/source change. Re-apply the
        // snapshot so that late playback cannot undo the requested cleanup.
        if (session.finalized && session.restorePlayback) {
          restorePlaybackSnapshot(session);
        }
      } catch (error) {
        const message = errorMessage(error, "The recording could not start.");

        if (session && !session.finalized) {
          forceAbortSession(session, true);
        } else {
          stopTracks(ownedTracks);
          if (snapshot) restorePlaybackSnapshot(snapshot);
        }
        revokeDownloadUrl();

        if (mountedRef.current) {
          setViewState({
            status: "error",
            progress: 0,
            elapsed: 0,
            error: message,
            notice: null,
            downloadUrl: null,
            mimeType: session?.mimeType ?? "",
            extension: session?.extension ?? "webm",
          });
        }
      }
    },
    [
      audioRef,
      canvasRef,
      completeSession,
      duration,
      failSession,
      forceAbortSession,
      getCaptureStream,
      getPlaybackTime,
      pause,
      play,
      requestSessionStop,
      revokeDownloadUrl,
      seek,
      sourceMode,
      updateSessionMetrics,
    ],
  );

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (session) requestSessionStop(session);
  }, [requestSessionStop]);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (session) forceAbortSession(session, true);
    revokeDownloadUrl();

    if (mountedRef.current) {
      setViewState(initialState());
    }
  }, [forceAbortSession, revokeDownloadUrl]);

  const reset = useCallback(() => {
    const session = sessionRef.current;
    if (session) forceAbortSession(session, true);
    revokeDownloadUrl();

    if (mountedRef.current) {
      setViewState(initialState());
    }
  }, [forceAbortSession, revokeDownloadUrl]);

  useEffect(() => {
    if (previousSourceModeRef.current === sourceMode) return;
    previousSourceModeRef.current = sourceMode;

    const session = sessionRef.current;
    if (session) forceAbortSession(session, false);
    revokeDownloadUrl();
    setViewState(initialState());
  }, [forceAbortSession, revokeDownloadUrl, sourceMode]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const session = sessionRef.current;
      if (session) forceAbortSession(session, false);
      revokeDownloadUrl();
    };
  }, [forceAbortSession, revokeDownloadUrl]);

  return {
    ...viewState,
    start,
    stop,
    cancel,
    reset,
  };
}

export default useCanvasRecorder;
