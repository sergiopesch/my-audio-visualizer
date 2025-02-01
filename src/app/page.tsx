"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface HTMLAudioElementWithCapture extends HTMLAudioElement {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}

type Cell = {
  row: number;
  col: number;
  dist: number; // distance from the center
};

export default function Page() {
  // Refs for audio, canvas, and related audio nodes
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs for video export
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  // State for file, export, and playback
  const [hasFile, setHasFile] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportCanceled, setExportCanceled] = useState(false);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);

  // Audio metadata and timeline
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // Whether audio is playing (to know if we animate or keep white)
  const [isPlaying, setIsPlaying] = useState(false);

  /**
   * BIG PIXELS:
   * Fewer columns/rows => each cell is bigger => more obvious usage of the canvas.
   */
  const COLS = 10;
  const ROWS = 7;
  const CANVAS_WIDTH = 600;
  const CANVAS_HEIGHT = 400;

  /**
   * Precompute each cell’s distance from center so we can do a radial fill.
   */
  const cells: Cell[] = React.useMemo(() => {
    const arr: Cell[] = [];
    const centerCol = Math.floor(COLS / 2);
    const centerRow = Math.floor(ROWS / 2);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const dx = c - centerCol;
        const dy = r - centerRow;
        const dist = Math.sqrt(dx * dx + dy * dy);
        arr.push({ row: r, col: c, dist });
      }
    }
    // Sort so the farthest cells are last
    arr.sort((a, b) => a.dist - b.dist);
    return arr;
  }, [COLS, ROWS]);

  // Maximum distance from the center to a corner cell
  const maxDistance = cells.length > 0 ? cells[cells.length - 1].dist : 1;

  /**
   * Create the AudioContext & Analyser once we have a file. We do not animate yet.
   */
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

  /**
   * Each frame: fill the canvas with white if not playing; otherwise,
   * measure peak amplitude, compute threshold => fill radial area from center.
   */
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

      // Always start with a white canvas
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // If not playing, no further drawing => remain white
      if (!isPlaying) return;

      // If playing, measure PEAK amplitude => more "responsive"
      analyser.getByteFrequencyData(dataArray);
      let maxVal = 0;
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
          maxVal = dataArray[i];
        }
      }
      // norm=1 => big radius
      const norm = maxVal / 255;
      const threshold = norm * maxDistance;

      // For each cell, if distance <= threshold => color it
      const cellW = canvas.width / COLS;
      const cellH = canvas.height / ROWS;

      for (const cell of cells) {
        if (cell.dist <= threshold) {
          // fraction= cell.dist / threshold => 0..1
          // Use fraction to pick a shade of futuristic blue
          // center= dist=0 => fraction=0 => darkest (30%),
          // near threshold => fraction=1 => lighter (80%).
          const fraction = threshold > 0 ? cell.dist / threshold : 0;
          const hue = 200; // futuristic blue
          const sat = 100;
          const light = 30 + 50 * fraction; // from 30..80
          ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
          ctx.fillRect(cell.col * cellW, cell.row * cellH, cellW, cellH);
        }
      }
    }

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [hasFile, cells, maxDistance, isPlaying, COLS, ROWS]);

  // File Handlers
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

  // Audio event setup
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
    audioRef.current?.play().catch((err) => {
      console.error("Playback error:", err);
    });
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

  const handleRateChange = (r: number) => {
    setPlaybackRate(r);
    if (audioRef.current) {
      audioRef.current.playbackRate = r;
    }
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setCurrentTime(newTime);
  };

  // Export
  const handleExportVideo = () => {
    const canvas = canvasRef.current;
    const audioEl = audioRef.current as HTMLAudioElementWithCapture | null;
    if (!canvas || !audioEl) return;

    setExportCanceled(false);
    setIsExporting(true);
    setDownloadLink(null);

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
    <main className="max-w-4xl mx-auto p-6 flex flex-col items-center space-y-8 min-h-screen bg-gray-50">
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
            className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
        </div>
      )}

      {hasFile && (
        <div className="w-full flex flex-col items-center space-y-6">
          <div className="relative shadow-md rounded-md bg-white inline-block">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="block"
            />
          </div>

          {/* Playback controls */}
          <div className="flex flex-col items-center space-y-4">
            <div className="flex flex-row items-center space-x-3">
              <button
                onClick={handlePlay}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Play
              </button>
              <button
                onClick={handlePause}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Pause
              </button>
              <button
                onClick={handleStop}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Stop
              </button>

              <label className="flex items-center space-x-1 text-sm text-gray-600">
                <span>Speed</span>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={playbackRate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  className="cursor-pointer"
                />
                <span>{playbackRate.toFixed(1)}x</span>
              </label>

              {!isExporting && (
                <button
                  onClick={handleExportVideo}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Export
                </button>
              )}
              {isExporting && (
                <button
                  onClick={handleCancelExport}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Timeline */}
            <div className="w-full max-w-md">
              <input
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={currentTime}
                onChange={handleTimelineChange}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-sm text-gray-600">
                <span>{currentTime.toFixed(1)}s</span>
                <span>{duration.toFixed(1)}s</span>
              </div>
            </div>
          </div>

          {/* Export progress and download link */}
          {isExporting && (
            <div className="flex flex-col items-center space-y-1">
              <div className="w-full max-w-md h-2 bg-gray-200 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-150"
                  style={{
                    width: `${(currentTime / (duration || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {downloadLink && (
            <div className="mt-4 flex flex-col items-center space-y-2">
              <p className="text-sm text-gray-600">Export complete!</p>
              <a
                href={downloadLink}
                download="visualizerCapture.webm"
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                Download .webm
              </a>
            </div>
          )}

          <audio ref={audioRef} />
        </div>
      )}
    </main>
  );
}
