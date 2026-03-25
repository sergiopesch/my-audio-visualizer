"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface HTMLAudioElementWithCapture extends HTMLAudioElement {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}

type Cell = {
  row: number;
  col: number;
  dist: number;
};

type SourceMode = "none" | "system" | "file";

export default function Page() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const [sourceMode, setSourceMode] = useState<SourceMode>("none");
  const [hasSource, setHasSource] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [isExporting, setIsExporting] = useState(false);
  const exportCanceledRef = useRef(false);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  const [sensitivity, setSensitivity] = useState(1.0);
  const [pixelSize, setPixelSize] = useState(60);
  const [showSettings, setShowSettings] = useState(false);

  const canvasWidth = 600;
  const canvasHeight = 400;
  const cols = Math.max(2, Math.round(canvasWidth / pixelSize));
  const rows = Math.max(2, Math.round(canvasHeight / pixelSize));

  const cells: Cell[] = React.useMemo(() => {
    const arr: Cell[] = [];
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dx = c - centerCol;
        const dy = r - centerRow;
        const dist = Math.sqrt(dx * dx + dy * dy);
        arr.push({ row: r, col: c, dist });
      }
    }
    arr.sort((a, b) => a.dist - b.dist);
    return arr;
  }, [cols, rows]);
  const maxDistance = cells.length > 0 ? cells[cells.length - 1].dist : 1;

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (!analyserRef.current) {
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    return audioContextRef.current;
  }, []);

  const disconnectSource = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // already disconnected
      }
      sourceNodeRef.current = null;
    }
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach((t) => t.stop());
      systemStreamRef.current = null;
    }
  }, []);

  const handleSystemAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      stream.getVideoTracks().forEach((t) => t.stop());

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        alert(
          'No audio was shared. Make sure to check "Share audio" or "Share system audio" in the browser dialog.'
        );
        return;
      }

      const audioCtx = ensureAudioContext();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      disconnectSource();

      const audioStream = new MediaStream(audioTracks);
      systemStreamRef.current = audioStream;

      const src = audioCtx.createMediaStreamSource(audioStream);
      sourceNodeRef.current = src;
      src.connect(analyserRef.current!);

      audioTracks[0].addEventListener("ended", () => {
        setIsPlaying(false);
        setHasSource(false);
        setSourceMode("none");
        disconnectSource();
      });

      setSourceMode("system");
      setHasSource(true);
      setIsPlaying(true);
    } catch (err) {
      if ((err as DOMException).name !== "NotAllowedError") {
        console.error("System audio capture failed:", err);
      }
    }
  }, [ensureAudioContext, disconnectSource]);

  useEffect(() => {
    if (sourceMode !== "file" || !hasSource) return;
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const audioCtx = ensureAudioContext();

    disconnectSource();

    const src = audioCtx.createMediaElementSource(audioEl);
    sourceNodeRef.current = src;
    src.connect(analyserRef.current!);
    analyserRef.current!.connect(audioCtx.destination);
  }, [sourceMode, hasSource, ensureAudioContext, disconnectSource]);

  // Canvas background matches the dark theme
  useEffect(() => {
    if (!hasSource) return;

    let animationId: number;

    function animate() {
      animationId = requestAnimationFrame(animate);

      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;
      const canvas = canvasRef.current;
      if (!analyser || !dataArray || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Dark canvas background
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!isPlaying) return;

      analyser.getByteFrequencyData(dataArray);
      let maxVal = 0;
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) maxVal = dataArray[i];
      }
      const norm = maxVal / 255;
      const threshold = Math.min(norm * sensitivity, 1.0) * maxDistance;

      const cellW = canvas.width / cols;
      const cellH = canvas.height / rows;
      const gap = 1;

      for (const cell of cells) {
        if (cell.dist <= threshold) {
          const fraction = threshold > 0 ? cell.dist / threshold : 0;
          const flicker = (Math.random() - 0.5) * 0.02;
          const adjustedFrac = Math.max(0, Math.min(1, fraction + flicker));

          // Blue-cyan gradient: center is bright cyan, edges are deep blue
          const hue = 200 + adjustedFrac * 20;
          const sat = 90 + adjustedFrac * 10;
          const light = 70 - 45 * adjustedFrac;
          ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
          ctx.fillRect(
            cell.col * cellW + gap,
            cell.row * cellH + gap,
            cellW - gap * 2,
            cellH - gap * 2
          );
        }
      }
    }

    animationId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [hasSource, isPlaying, cells, maxDistance, cols, rows, sensitivity]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      const file = e.dataTransfer.files[0];
      if (audioURL) URL.revokeObjectURL(audioURL);
      const url = URL.createObjectURL(file);
      setAudioURL(url);
      setSourceMode("file");
      setHasSource(true);
    },
    [audioURL]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (audioURL) URL.revokeObjectURL(audioURL);
    const url = URL.createObjectURL(file);
    setAudioURL(url);
    setSourceMode("file");
    setHasSource(true);
  };

  useEffect(() => {
    if (sourceMode !== "file" || !hasSource) return;
    const audioEl = audioRef.current;
    if (!audioEl) return;

    audioEl.src = audioURL;
    audioEl.load();

    const onLoadedMetadata = () => setDuration(audioEl.duration || 0);
    const onTimeUpdate = () => setCurrentTime(audioEl.currentTime);
    const onEnded = () => setIsPlaying(false);

    audioEl.addEventListener("loadedmetadata", onLoadedMetadata);
    audioEl.addEventListener("timeupdate", onTimeUpdate);
    audioEl.addEventListener("ended", onEnded);

    return () => {
      audioEl.removeEventListener("loadedmetadata", onLoadedMetadata);
      audioEl.removeEventListener("timeupdate", onTimeUpdate);
      audioEl.removeEventListener("ended", onEnded);
    };
  }, [sourceMode, hasSource, audioURL]);

  const handlePlay = async () => {
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }
    setIsPlaying(true);
    audioRef.current?.play().catch((err) => console.error(err));
  };

  const handlePause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const handleStop = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setIsPlaying(false);
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setCurrentTime(newTime);
  };

  const resetToSourcePicker = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    disconnectSource();

    if (audioURL) URL.revokeObjectURL(audioURL);
    if (downloadLink) URL.revokeObjectURL(downloadLink);

    setIsPlaying(false);
    setHasSource(false);
    setSourceMode("none");
    setAudioURL("");
    setDuration(0);
    setCurrentTime(0);
    setDownloadLink(null);
    setIsExporting(false);

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        /* ok */
      }
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [disconnectSource, audioURL, downloadLink]);

  useEffect(() => {
    if (!isExporting) {
      setExportProgress(0);
      return;
    }
    if (duration > 0) {
      const prog = (currentTime / duration) * 100;
      setExportProgress(Math.min(100, Math.floor(prog)));
    }
  }, [currentTime, duration, isExporting]);

  const handleExportVideo = () => {
    const canvas = canvasRef.current;
    const audioEl = audioRef.current as HTMLAudioElementWithCapture | null;
    if (!canvas || !audioEl) return;

    exportCanceledRef.current = false;
    setIsExporting(true);
    if (downloadLink) URL.revokeObjectURL(downloadLink);
    setDownloadLink(null);
    setExportProgress(0);

    const canvasStream = canvas.captureStream(30);
    const audioStream =
      audioEl.captureStream?.() || audioEl.mozCaptureStream?.() || null;

    if (!audioStream) {
      alert("Browser doesn't support capturing audio from <audio> element.");
      setIsExporting(false);
      return;
    }

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm; codecs=vp9,opus",
    });
    mediaRecorderRef.current = recorder;
    recordedChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      if (exportCanceledRef.current) {
        recordedChunksRef.current = [];
        setIsExporting(false);
        return;
      }
      const blob = new Blob(recordedChunksRef.current, {
        type: "video/webm",
      });
      const url = URL.createObjectURL(blob);
      setDownloadLink(url);
      setIsExporting(false);
    };

    const stopWhenEnded = () => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
      audioEl.removeEventListener("ended", stopWhenEnded);
    };
    audioEl.addEventListener("ended", stopWhenEnded);

    recorder.start();
  };

  const handleCancelExport = () => {
    exportCanceledRef.current = true;
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Source picker ──
  if (!hasSource) {
    return (
      <main className="min-h-screen w-full bg-black flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full space-y-10 animate-fade-in">
          {/* Title */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mb-2">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-6 h-6 text-blue-400"
              >
                <path
                  d="M12 3v18m0 0c-2.8 0-5-1.12-5-2.5S9.2 16 12 16s5 1.12 5 2.5S14.8 21 12 21z"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
                <path
                  d="M12 3l8 3v6"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Audio Visualizer
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Select a source to begin
            </p>
          </div>

          {/* Source options */}
          <div className="space-y-3">
            {/* System Audio */}
            <button
              onClick={handleSystemAudio}
              className="glass group w-full p-5 rounded-xl transition-all text-left cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--text-primary)] text-sm">
                    System Audio
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    Capture from any tab or app
                  </div>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </div>
            </button>

            {/* Upload File */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="glass group w-full p-5 rounded-xl transition-all text-left"
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--text-primary)] text-sm">
                    Upload File
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 mb-2.5">
                    Drag & drop or browse
                  </div>
                  <label className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                    Choose file
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleFileSelect}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-[var(--text-muted)] tracking-wide uppercase">
            System audio requires screen sharing permission
          </p>
        </div>
      </main>
    );
  }

  // ── Visualizer ──
  return (
    <main className="min-h-screen w-full bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[640px] flex flex-col items-center space-y-5 animate-fade-in">
        {/* Header */}
        <div className="w-full flex items-center justify-between px-1">
          <button
            onClick={resetToSourcePicker}
            className="btn-ghost flex items-center gap-1.5 text-xs font-medium tracking-wide"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-3.5 h-3.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Back
          </button>
          <div className="flex items-center gap-2">
            {sourceMode === "system" && isPlaying && (
              <div className="flex items-center gap-1.5 mr-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
                <span className="text-[10px] text-emerald-400/80 uppercase tracking-wider font-medium">
                  Live
                </span>
              </div>
            )}
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
              {sourceMode === "system" ? "System" : "File"}
            </span>
            <button
              onClick={() => setShowSettings((s) => !s)}
              className={`p-1.5 rounded-md transition-all ${
                showSettings
                  ? "bg-white/10 text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
              aria-label="Settings"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="w-full glass rounded-xl p-5 space-y-5 animate-fade-in">
            <div className="space-y-3">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                  Sensitivity
                </label>
                <span className="text-xs text-[var(--text-muted)] tabular-nums font-mono">
                  {sensitivity.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={3.0}
                step={0.1}
                value={sensitivity}
                onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="w-full h-px bg-white/5" />

            <div className="space-y-3">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                  Pixel Size
                </label>
                <span className="text-xs text-[var(--text-muted)] tabular-nums font-mono">
                  {pixelSize}px &middot; {cols}&times;{rows}
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={120}
                step={5}
                value={pixelSize}
                onChange={(e) => setPixelSize(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}

        {/* Canvas */}
        <div
          className={`canvas-glow rounded-xl overflow-hidden border border-white/[0.04] ${isPlaying ? "active" : ""}`}
        >
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="block w-full h-auto"
          />
        </div>

        {/* File mode: playback controls */}
        {sourceMode === "file" && (
          <div className="w-full space-y-4">
            {/* Timeline */}
            <div className="w-full space-y-1.5 px-1">
              <input
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={currentTime}
                onChange={handleTimelineChange}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] tabular-nums font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={handleStop}
                className="btn-ghost p-2.5 rounded-lg hover:bg-white/5 transition-colors focus:outline-none"
                aria-label="Stop"
              >
                <svg
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                >
                  <path d="M6 6h12v12H6z" />
                </svg>
              </button>

              <button
                onClick={isPlaying ? handlePause : handlePlay}
                className="p-3 rounded-full bg-white/10 text-white hover:bg-white/15 transition-colors focus:outline-none mx-2"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    className="w-6 h-6"
                  >
                    <path d="M6 19h4V5H6zm8-14v14h4V5z" />
                  </svg>
                ) : (
                  <svg
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    className="w-6 h-6"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {!isExporting ? (
                <button
                  onClick={handleExportVideo}
                  className="btn-ghost p-2.5 rounded-lg hover:bg-white/5 transition-colors focus:outline-none"
                  aria-label="Export"
                >
                  <svg
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleCancelExport}
                  className="btn-ghost p-2.5 rounded-lg hover:bg-white/5 transition-colors focus:outline-none text-red-400"
                  aria-label="Cancel Export"
                >
                  <svg
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Export progress */}
        {sourceMode === "file" && isExporting && (
          <div className="w-full glass rounded-lg p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] tabular-nums font-mono w-8 text-right">
              {exportProgress}%
            </span>
          </div>
        )}

        {/* Download link */}
        {sourceMode === "file" && downloadLink && (
          <a
            href={downloadLink}
            download="visualizerCapture.webm"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            Download
          </a>
        )}
      </div>

      <audio ref={audioRef} className="hidden" />
    </main>
  );
}
