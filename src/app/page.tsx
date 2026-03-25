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
  const [exportCanceled, setExportCanceled] = useState(false);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  const cols = 10;
  const rows = 7;
  const canvasWidth = 600;
  const canvasHeight = 400;

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

  // Shared: create AudioContext + AnalyserNode
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

  // Disconnect previous source node
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

  // System audio capture via getDisplayMedia
  const handleSystemAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // required by spec, but we only use audio
        audio: true,
      });

      // Stop the video track immediately — we only want audio
      stream.getVideoTracks().forEach((t) => t.stop());

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        alert(
          "No audio was shared. Make sure to check \"Share audio\" or \"Share system audio\" in the browser dialog."
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
      // Don't connect to destination — system audio is already playing through speakers

      // Stop visualizer when the user stops sharing
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

  // File upload: AudioContext + MediaElementSource setup
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

  // Main animation loop
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

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!isPlaying) return;

      analyser.getByteFrequencyData(dataArray);
      let maxVal = 0;
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) maxVal = dataArray[i];
      }
      const norm = maxVal / 255;
      const threshold = norm * maxDistance;

      const cellW = canvas.width / cols;
      const cellH = canvas.height / rows;

      for (const cell of cells) {
        if (cell.dist <= threshold) {
          const fraction = threshold > 0 ? cell.dist / threshold : 0;
          const flicker = (Math.random() - 0.5) * 0.02;
          const adjustedFrac = Math.max(0, Math.min(1, fraction + flicker));
          const light = 80 - 50 * adjustedFrac;
          ctx.fillStyle = `hsl(200, 100%, ${light}%)`;
          ctx.fillRect(cell.col * cellW, cell.row * cellH, cellW, cellH);
        }
      }
    }

    animationId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [hasSource, isPlaying, cells, maxDistance, cols, rows]);

  // File drag & drop
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const file = e.dataTransfer.files[0];
    const url = URL.createObjectURL(file);
    setAudioURL(url);
    setSourceMode("file");
    setHasSource(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAudioURL(url);
    setSourceMode("file");
    setHasSource(true);
  };

  // Audio element events (file mode only)
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

  // Playback controls (file mode)
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

  // Back to source picker
  const handleBack = useCallback(() => {
    if (sourceMode === "file") {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
    }
    disconnectSource();
    setIsPlaying(false);
    setHasSource(false);
    setSourceMode("none");
    setDuration(0);
    setCurrentTime(0);
    setDownloadLink(null);
    setIsExporting(false);

    // Reset audio context so a fresh MediaElementSource can be created
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* ok */ }
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [sourceMode, disconnectSource]);

  // Stop system audio
  const handleStopSystem = useCallback(() => {
    disconnectSource();
    setIsPlaying(false);
    setHasSource(false);
    setSourceMode("none");

    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* ok */ }
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [disconnectSource]);

  // Export progress
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

  // Export to .webm (file mode only)
  const handleExportVideo = () => {
    const canvas = canvasRef.current;
    const audioEl = audioRef.current as HTMLAudioElementWithCapture | null;
    if (!canvas || !audioEl) return;

    setExportCanceled(false);
    setIsExporting(true);
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
      if (exportCanceled) {
        recordedChunksRef.current = [];
        setIsExporting(false);
        return;
      }
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
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
    setExportCanceled(true);
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  // ── Source picker ──
  if (!hasSource) {
    return (
      <main className="min-h-screen w-full bg-gray-950 text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Audio Visualizer
            </h1>
            <p className="text-gray-400 text-sm">
              Choose an audio source to get started
            </p>
          </div>

          <div className="grid gap-4">
            {/* System Audio */}
            <button
              onClick={handleSystemAudio}
              className="group relative w-full p-6 rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-800 hover:border-gray-600 transition-all text-left"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
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
                      d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                    System Audio
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Capture audio from any tab or application playing on your
                    system
                  </p>
                </div>
              </div>
            </button>

            {/* Upload File */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="group relative w-full p-6 rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-800 hover:border-gray-600 transition-all text-left"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
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
                <div>
                  <h2 className="font-semibold text-white group-hover:text-violet-400 transition-colors">
                    Upload Audio File
                  </h2>
                  <p className="text-sm text-gray-400 mt-1 mb-3">
                    Drag & drop or select an audio file to visualize
                  </p>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileSelect}
                    className="text-sm text-gray-400 file:cursor-pointer file:border-0 file:rounded-full file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600 file:px-4 file:py-1.5 file:text-sm file:mr-3"
                  />
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-600">
            System audio requires browser permission to share a tab or screen
          </p>
        </div>
      </main>
    );
  }

  // ── Visualizer ──
  return (
    <main className="min-h-screen w-full bg-gray-950 text-white flex flex-col items-center p-6 space-y-6">
      <div className="w-full max-w-xl flex flex-col items-center space-y-6">
        {/* Header with back button */}
        <div className="w-full flex items-center justify-between">
          <button
            onClick={sourceMode === "system" ? handleStopSystem : handleBack}
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Back
          </button>
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            {sourceMode === "system" ? "System Audio" : "File"}
          </span>
        </div>

        {/* Canvas */}
        <div className="relative shadow-lg rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="block"
          />
        </div>

        {/* System audio: just a live indicator */}
        {sourceMode === "system" && isPlaying && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            Listening to system audio
          </div>
        )}

        {/* File mode: playback controls */}
        {sourceMode === "file" && (
          <div className="flex flex-col items-center space-y-4">
            <div className="flex flex-row items-center space-x-6">
              <button
                onClick={handlePlay}
                className="text-gray-400 hover:text-white transition-colors focus:outline-none"
                aria-label="Play"
              >
                <svg
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  width="34"
                  height="34"
                >
                  <path d="M7 6v12l10-6z" />
                </svg>
              </button>

              <button
                onClick={handlePause}
                className="text-gray-400 hover:text-white transition-colors focus:outline-none"
                aria-label="Pause"
              >
                <svg
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  width="34"
                  height="34"
                >
                  <path d="M6 19h4V5H6zm8-14v14h4V5z" />
                </svg>
              </button>

              <button
                onClick={handleStop}
                className="text-gray-400 hover:text-white transition-colors focus:outline-none"
                aria-label="Stop"
              >
                <svg
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  width="30"
                  height="30"
                >
                  <path d="M6 6h12v12H6z" />
                </svg>
              </button>

              {!isExporting && (
                <button
                  onClick={handleExportVideo}
                  className="text-gray-400 hover:text-white transition-colors focus:outline-none"
                  aria-label="Export"
                >
                  <svg
                    fill="currentColor"
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                  >
                    <path d="M5 20h14v-2H5m7-14v8l5-4.999z" />
                  </svg>
                </button>
              )}
              {isExporting && (
                <button
                  onClick={handleCancelExport}
                  className="text-gray-400 hover:text-white transition-colors focus:outline-none"
                  aria-label="Cancel Export"
                >
                  <svg
                    fill="currentColor"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20.84 4.61l-1.45-1.45L12 10.54 4.61 3.16 3.16 4.61l7.39 7.39-7.39 7.39 1.45 1.45 7.39-7.39 7.39 7.39 1.45-1.45L13.46 12z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Timeline slider */}
            <div className="w-full max-w-sm flex flex-col items-center space-y-1">
              <input
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={currentTime}
                onChange={handleTimelineChange}
                className="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer range-thumb"
              />
              <div className="w-full flex justify-between text-xs text-gray-500">
                <span>{currentTime.toFixed(1)}s</span>
                <span>{duration.toFixed(1)}s</span>
              </div>
            </div>
          </div>
        )}

        {/* Export progress & link (file mode) */}
        {sourceMode === "file" && isExporting && (
          <div className="flex flex-col items-center space-y-1 w-full max-w-sm">
            <p className="text-xs text-gray-400">Exporting...</p>
            <div className="w-full h-2 bg-gray-700 rounded overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-150"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          </div>
        )}

        {sourceMode === "file" && downloadLink && (
          <div className="mt-2 flex flex-col items-center space-y-2">
            <p className="text-xs text-gray-400">Export complete!</p>
            <a
              href={downloadLink}
              download="visualizerCapture.webm"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm transition-colors"
            >
              Download
            </a>
          </div>
        )}
      </div>

      <audio ref={audioRef} className="hidden" />
    </main>
  );
}
