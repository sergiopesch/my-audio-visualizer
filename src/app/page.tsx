"use client";

import React, { useEffect, useRef, useState } from "react";

/** 
 * A small cell type for the center-out pixel logic.
 */
type Cell = {
  row: number;
  col: number;
  dist: number;
};

/**
 * Extend HTMLAudioElement so we can safely call .captureStream() in TypeScript.
 */
interface HTMLAudioElementWithCapture extends HTMLAudioElement {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}

export default function Page() {
  // --- Refs ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- State ---
  const [audioURL, setAudioURL] = useState<string | null>(null); // Chosen file as object URL
  const [isReady, setIsReady] = useState(false);                 // Audio chain set up?
  const [isRecording, setIsRecording] = useState(false);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);

  // Grid settings: single color “green” mode, center-out
  const COLS = 12;
  const ROWS = 8;
  const CANVAS_WIDTH = 600;
  const CANVAS_HEIGHT = 400;

  // Precompute center-out cell array
  const cells: Cell[] = React.useMemo(() => {
    const arr: Cell[] = [];
    const centerX = (COLS - 1) / 2;
    const centerY = (ROWS - 1) / 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const dx = c - centerX;
        const dy = r - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        arr.push({ row: r, col: c, dist });
      }
    }
    // Sort ascending by distance => center cells come first
    arr.sort((a, b) => a.dist - b.dist);
    return arr;
  }, [COLS, ROWS]);

  // 1) File input => sets audioURL
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAudioURL(url);
  };

  // 2) Setup audio chain once audioURL changes
  useEffect(() => {
    if (!audioURL) return;

    // Clean old context if any
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsReady(false);

    const audioEl = audioRef.current;
    if (!audioEl) return;

    // Create new context
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    // Create MediaElementSource from <audio>
    const source = ctx.createMediaElementSource(audioEl);

    // Analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3; // stable for green “classic”
    analyserRef.current = analyser;

    // Connect chain
    source.connect(analyser);
    analyser.connect(ctx.destination);

    // Prepare data array
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    setIsReady(true);
  }, [audioURL]);

  // 3) Animate center-out squares in green
  useEffect(() => {
    let animationId: number;

    function animate() {
      animationId = requestAnimationFrame(animate);

      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;
      const canvas = canvasRef.current;
      if (!analyser || !dataArray || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      analyser.getByteFrequencyData(dataArray);

      const totalCells = cells.length;
      const totalBins = dataArray.length;
      const binsPerCell = Math.floor(totalBins / totalCells);

      for (let i = 0; i < totalCells; i++) {
        const { row, col } = cells[i];
        const startBin = i * binsPerCell;
        let endBin = startBin + binsPerCell;
        if (i === totalCells - 1) {
          endBin = totalBins;
        }

        let sum = 0;
        let count = 0;
        for (let b = startBin; b < endBin; b++) {
          sum += dataArray[b];
          count++;
        }
        const avg = count ? sum / count : 0;
        const norm = avg / 255;

        // color logic
        if (norm < 0.02) {
          ctx.fillStyle = "#fff";
        } else {
          // single green color
          const hue = 120;
          const sat = 100;
          const light = 50 - 30 * norm;
          ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light.toFixed(0)}%)`;
        }

        const cellW = canvas.width / COLS;
        const cellH = canvas.height / ROWS;
        ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
      }
    }

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [cells]);

  // 4) Recording: combine canvas + <audio> into a .webm
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const handleStartRecording = () => {
    if (!canvasRef.current || !audioRef.current) return;

    // a) Capture canvas stream
    const canvasStream = canvasRef.current.captureStream(30);

    // b) Capture audio from <audio>. 
    const audioEl = audioRef.current as HTMLAudioElementWithCapture; 
    const audioStream = audioEl.captureStream?.() || audioEl.mozCaptureStream?.();

    if (!audioStream) {
      alert("Browser doesn't support capturing audio from <audio> element.");
      return;
    }

    // c) Combine the two streams
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);

    // d) Create the MediaRecorder
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm; codecs=vp9,opus",
    });
    mediaRecorderRef.current = recorder;
    recordedChunksRef.current = [];

    // e) On data
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    // f) On stop => create a Blob & URL
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setDownloadLink(url);
    };

    recorder.start();
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
    setIsRecording(false);
  };

  return (
    <main className="max-w-4xl mx-auto p-6 flex flex-col items-center space-y-8">
      <h1 className="text-3xl font-semibold">Green Audio Visualizer</h1>

      {/* The <audio> element with controls */}
      <audio
        ref={audioRef}
        src={audioURL || undefined}
        controls
        className="outline-none w-full max-w-md"
      >
        Your browser does not support the audio element.
      </audio>

      {/* Simple file picker */}
      <div className="flex flex-col items-center space-y-4">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          className="file:mr-4 file:py-2 file:px-4
                     file:rounded-full file:border-0
                     file:text-sm file:font-semibold
                     file:bg-blue-50 file:text-blue-700
                     hover:file:bg-blue-100 cursor-pointer"
        />
      </div>

      {/* Canvas for center-out squares */}
      <div className="shadow-md rounded overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="bg-white"
        />
      </div>

      {/* Recording controls if audio is ready */}
      {isReady && (
        <div className="flex flex-row space-x-4">
          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Start Recording
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Stop Recording
            </button>
          )}
        </div>
      )}

      {/* If we have a recorded video, show download link */}
      {downloadLink && (
        <div className="mt-4 flex flex-col items-center space-y-2">
          <p className="text-sm text-gray-600">Recording complete!</p>
          <a
            href={downloadLink}
            download="visualizerCapture.webm"
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Download .webm
          </a>
        </div>
      )}

      {/* Info if not ready */}
      {!isReady && (
        <p className="text-gray-400 text-sm text-center max-w-sm">
          Load an audio file to begin visualizing, then press Play in the audio controls above.
          You can also record the canvas + audio to a .webm.
        </p>
      )}
    </main>
  );
}
