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

export default function Page() {
  // Refs for audio, canvas, etc.
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Export Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  // File & playback states
  const [hasFile, setHasFile] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  // Audio timeline
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Export states
  const [isExporting, setIsExporting] = useState(false);
  const [exportCanceled, setExportCanceled] = useState(false);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  // Visualization settings
  const cols = 10;
  const rows = 7;
  const canvasWidth = 600;
  const canvasHeight = 400;

  // Precompute cells and distances
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

  // AudioContext + Analyser setup
  useEffect(() => {
    if (!hasFile) return;
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (!sourceRef.current) {
      const audioCtx = audioContextRef.current;
      const src = audioCtx.createMediaElementSource(audioEl);
      sourceRef.current = src;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      src.connect(analyser);
      analyser.connect(audioCtx.destination);

      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, [hasFile]);

  // Main animation effect
  useEffect(() => {
    if (!hasFile) return;

    let animationId: number;

    function animate() {
      animationId = requestAnimationFrame(animate);

      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;
      const canvas = canvasRef.current;
      if (!analyser || !dataArray || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // White background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!isPlaying) return;

      analyser.getByteFrequencyData(dataArray);
      let maxVal = 0;
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) maxVal = dataArray[i];
      }
      const norm = maxVal / 255; // amplitude in [0..1]
      const threshold = norm * maxDistance;

      // Fill cells up to threshold
      const cellW = canvas.width / cols;
      const cellH = canvas.height / rows;
      for (const cell of cells) {
        if (cell.dist <= threshold) {
          const fraction = threshold > 0 ? cell.dist / threshold : 0;
          // small flicker
          const flicker = (Math.random() - 0.5) * 0.02;
          let adjustedFrac = fraction + flicker;
          adjustedFrac = Math.max(0, Math.min(1, adjustedFrac));

          // Invert color from center(80%) to edge(30%)
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
  }, [hasFile, isPlaying, cells, maxDistance, cols, rows]);

  // Drag & Drop / File Input
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const file = e.dataTransfer.files[0];
    const url = URL.createObjectURL(file);
    setAudioURL(url);
    setHasFile(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAudioURL(url);
    setHasFile(true);
  };

  // Audio timeline & events
  useEffect(() => {
    if (!hasFile) return;
    const audioEl = audioRef.current;
    if (!audioEl) return;

    audioEl.src = audioURL;
    audioEl.load();

    const onLoadedMetadata = () => {
      setDuration(audioEl.duration || 0);
    };
    audioEl.addEventListener("loadedmetadata", onLoadedMetadata);

    const onTimeUpdate = () => {
      setCurrentTime(audioEl.currentTime);
    };
    audioEl.addEventListener("timeupdate", onTimeUpdate);

    const onEnded = () => {
      setIsPlaying(false);
    };
    audioEl.addEventListener("ended", onEnded);

    return () => {
      audioEl.removeEventListener("loadedmetadata", onLoadedMetadata);
      audioEl.removeEventListener("timeupdate", onTimeUpdate);
      audioEl.removeEventListener("ended", onEnded);
    };
  }, [hasFile, audioURL]);

  // Playback controls
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

  // Export progress logic
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

  // Export to .webm
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <main className="min-h-screen w-full bg-white text-gray-800 flex flex-col items-center p-6 space-y-6">
      {!hasFile && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="w-full max-w-md p-8 border-4 border-dashed border-gray-300 rounded-lg flex flex-col items-center text-center space-y-4 cursor-pointer"
        >
          <p className="text-lg text-gray-600">
            Drag & drop an audio file here, or select one:
          </p>
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="file:cursor-pointer file:border-0 file:rounded-full file:bg-gray-200 file:text-gray-700 hover:file:bg-gray-300 file:px-4 file:py-2"
          />
        </div>
      )}

      {hasFile && (
        <>
          <div className="w-full max-w-xl flex flex-col items-center space-y-6">
            <div className="relative shadow-md rounded-md bg-gray-50 inline-block">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="block"
              />
            </div>

            {/* Playback controls */}
            <div className="flex flex-col items-center space-y-4">
              <div className="flex flex-row items-center space-x-6">
                <button
                  onClick={handlePlay}
                  className="text-gray-500 hover:text-black focus:outline-none"
                  aria-label="Play"
                >
                  <svg fill="currentColor" viewBox="0 0 24 24" width="34" height="34">
                    <path d="M7 6v12l10-6z" />
                  </svg>
                </button>

                <button
                  onClick={handlePause}
                  className="text-gray-500 hover:text-black focus:outline-none"
                  aria-label="Pause"
                >
                  <svg fill="currentColor" viewBox="0 0 24 24" width="34" height="34">
                    <path d="M6 19h4V5H6zm8-14v14h4V5z" />
                  </svg>
                </button>

                <button
                  onClick={handleStop}
                  className="text-gray-500 hover:text-black focus:outline-none"
                  aria-label="Stop"
                >
                  <svg fill="currentColor" viewBox="0 0 24 24" width="30" height="30">
                    <path d="M6 6h12v12H6z" />
                  </svg>
                </button>

                {!isExporting && (
                  <button
                    onClick={handleExportVideo}
                    className="text-gray-500 hover:text-black focus:outline-none"
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
                    className="text-gray-500 hover:text-black focus:outline-none"
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
                  className="w-full h-1 bg-gray-200 rounded-full appearance-none cursor-pointer range-thumb"
                />
                <div className="w-full flex justify-between text-xs text-gray-500">
                  <span>{currentTime.toFixed(1)}s</span>
                  <span>{duration.toFixed(1)}s</span>
                </div>
              </div>
            </div>

            {/* Export progress & link */}
            {isExporting && (
              <div className="flex flex-col items-center space-y-1 w-full max-w-sm">
                <p className="text-xs text-gray-500">Exporting...</p>
                <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-150"
                    style={{
                      width: `${exportProgress}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {downloadLink && (
              <div className="mt-2 flex flex-col items-center space-y-2">
                <p className="text-xs text-gray-500">Export complete!</p>
                <a
                  href={downloadLink}
                  download="visualizerCapture.webm"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-400 text-sm"
                >
                  Download
                </a>
              </div>
            )}
          </div>

          <audio ref={audioRef} className="hidden" />
        </>
      )}
    </main>
  );
}
