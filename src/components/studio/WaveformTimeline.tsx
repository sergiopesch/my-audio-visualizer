"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { BRAND_PIGMENTS } from "@/lib/visualizer/types";

export interface WaveformTimelineProps {
  peaks: number[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
}

const MAX_DEVICE_PIXEL_RATIO = 2;
const TARGET_BAR_STRIDE = 4;
const BAR_WIDTH_RATIO = 0.56;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function formatTime(value: number) {
  const totalSeconds = Math.max(0, Math.floor(finiteOrZero(value)));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function resolveCanvasColor(
  context: CanvasRenderingContext2D,
  candidate: string,
  fallback: string,
) {
  context.fillStyle = fallback;
  context.fillStyle = candidate;
  return context.fillStyle;
}

function addRoundedBar(
  path: Path2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const radius = Math.min(width / 2, height / 2);
  path.roundRect(x, y, width, height, radius);
}

function drawPlayhead(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  devicePixelRatio: number,
  color: string,
  isDisabled: boolean,
) {
  const playheadX = progress * width;
  const crispPlayheadX = Math.round(playheadX * devicePixelRatio) / devicePixelRatio;

  context.save();
  context.globalAlpha = isDisabled ? 0.35 : 0.96;
  context.fillStyle = color;
  context.shadowBlur = isDisabled ? 0 : 10;
  context.shadowColor = color;
  context.fillRect(crispPlayheadX - 0.5, 0, 1, height);
  context.shadowBlur = 0;
  context.beginPath();
  context.arc(crispPlayheadX, height / 2, 2.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function WaveformTimeline({
  peaks,
  currentTime,
  duration,
  onSeek,
  disabled = false,
}: WaveformTimelineProps) {
  const rangeId = useId();
  const descriptionId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const drawRef = useRef<() => void>(() => undefined);
  const resizeFrameRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const safeDuration = Math.max(0, finiteOrZero(duration));
  const safeCurrentTime = clamp(finiteOrZero(currentTime), 0, safeDuration);
  const progress = safeDuration > 0 ? safeCurrentTime / safeDuration : 0;
  const interactionDisabled = disabled || safeDuration <= 0;
  const currentLabel = formatTime(safeCurrentTime);
  const durationLabel = formatTime(safeDuration);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    if (!canvas || !surface) return;

    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(0, bounds.width);
    const height = Math.max(0, bounds.height);
    if (width === 0 || height === 0) return;

    const devicePixelRatio = clamp(
      window.devicePixelRatio || 1,
      1,
      MAX_DEVICE_PIXEL_RATIO,
    );
    const pixelWidth = Math.max(1, Math.round(width * devicePixelRatio));
    const pixelHeight = Math.max(1, Math.round(height * devicePixelRatio));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = getComputedStyle(surface);
    const playedColor = resolveCanvasColor(
      context,
      styles.getPropertyValue("--waveform-played-color").trim(),
      BRAND_PIGMENTS.signal,
    );
    const unplayedColor = resolveCanvasColor(
      context,
      styles.getPropertyValue("--waveform-unplayed-color").trim(),
      "rgba(255, 255, 255, 0.2)",
    );
    const playheadColor = resolveCanvasColor(
      context,
      styles.getPropertyValue("--waveform-playhead-color").trim(),
      playedColor,
    );

    const centerY = height / 2;
    const sourceLength = peaks.length;
    if (sourceLength === 0) {
      context.globalAlpha = interactionDisabled ? 0.22 : 0.5;
      context.fillStyle = unplayedColor;
      context.fillRect(0, Math.round(centerY) - 0.5, width, 1);
      context.globalAlpha = 1;
      if (safeDuration > 0) {
        drawPlayhead(
          context,
          width,
          height,
          progress,
          devicePixelRatio,
          playheadColor,
          interactionDisabled,
        );
      }
      return;
    }

    const barCount = Math.max(
      1,
      Math.min(sourceLength, Math.floor(width / TARGET_BAR_STRIDE)),
    );
    const stride = width / barCount;
    const barWidth = clamp(stride * BAR_WIDTH_RATIO, 1, 3);
    const maximumBarHeight = Math.max(2, height * 0.84);
    const minimumBarHeight = Math.min(3, maximumBarHeight);
    const playheadX = progress * width;
    const playedPath = new Path2D();
    const unplayedPath = new Path2D();

    for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
      const sourceStart = Math.floor((barIndex * sourceLength) / barCount);
      const sourceEnd = Math.max(
        sourceStart + 1,
        Math.floor(((barIndex + 1) * sourceLength) / barCount),
      );
      let amplitude = 0;

      for (
        let sourceIndex = sourceStart;
        sourceIndex < sourceEnd && sourceIndex < sourceLength;
        sourceIndex += 1
      ) {
        amplitude = Math.max(amplitude, Math.abs(finiteOrZero(peaks[sourceIndex])));
      }

      const barHeight = Math.max(
        minimumBarHeight,
        Math.min(1, amplitude) * maximumBarHeight,
      );
      const x = barIndex * stride + (stride - barWidth) / 2;
      const y = centerY - barHeight / 2;
      const path = x + barWidth / 2 <= playheadX ? playedPath : unplayedPath;
      addRoundedBar(path, x, y, barWidth, barHeight);
    }

    context.globalAlpha = interactionDisabled ? 0.28 : 1;
    context.fillStyle = unplayedColor;
    context.fill(unplayedPath);
    context.fillStyle = playedColor;
    context.fill(playedPath);
    context.globalAlpha = 1;

    if (safeDuration > 0) {
      drawPlayhead(
        context,
        width,
        height,
        progress,
        devicePixelRatio,
        playheadColor,
        interactionDisabled,
      );
    }
  }, [interactionDisabled, peaks, progress, safeDuration]);

  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const scheduleDraw = () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        drawRef.current();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(surface);
    scheduleDraw();

    return () => {
      resizeObserver.disconnect();
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const surface = surfaceRef.current;
      if (!surface || interactionDisabled) return;

      const bounds = surface.getBoundingClientRect();
      if (bounds.width <= 0) return;

      const nextProgress = clamp((clientX - bounds.left) / bounds.width, 0, 1);
      onSeek(nextProgress * safeDuration);
    },
    [interactionDisabled, onSeek, safeDuration],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (
        interactionDisabled ||
        !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }

      event.preventDefault();
      draggingRef.current = true;
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      seekFromClientX(event.clientX);
    },
    [interactionDisabled, seekFromClientX],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !event.isPrimary) return;
      event.preventDefault();
      seekFromClientX(event.clientX);
    },
    [seekFromClientX],
  );

  const finishPointerInteraction = useCallback(
    (event: PointerEvent<HTMLDivElement>, commitPosition: boolean) => {
      if (!draggingRef.current) return;

      if (commitPosition) seekFromClientX(event.clientX);
      draggingRef.current = false;
      setIsDragging(false);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [seekFromClientX],
  );

  const handleRangeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (interactionDisabled) return;
      onSeek(clamp(event.currentTarget.valueAsNumber, 0, safeDuration));
    },
    [interactionDisabled, onSeek, safeDuration],
  );

  const handleRangeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (interactionDisabled) return;

      const fineStep = Math.max(1, safeDuration / 100);
      const arrowStep = event.shiftKey ? fineStep * 5 : fineStep;
      let nextTime: number;

      switch (event.key) {
        case "ArrowLeft":
        case "ArrowDown":
          nextTime = safeCurrentTime - arrowStep;
          break;
        case "ArrowRight":
        case "ArrowUp":
          nextTime = safeCurrentTime + arrowStep;
          break;
        case "PageDown":
          nextTime = safeCurrentTime - fineStep * 10;
          break;
        case "PageUp":
          nextTime = safeCurrentTime + fineStep * 10;
          break;
        case "Home":
          nextTime = 0;
          break;
        case "End":
          nextTime = safeDuration;
          break;
        default:
          return;
      }

      event.preventDefault();
      onSeek(clamp(nextTime, 0, safeDuration));
    },
    [interactionDisabled, onSeek, safeCurrentTime, safeDuration],
  );

  return (
    <div
      className="waveform-timeline"
      data-disabled={interactionDisabled ? "true" : undefined}
      data-dragging={isDragging ? "true" : undefined}
    >
      <div className="waveform-timeline__header">
        <label htmlFor={rangeId}>
          Playback position
        </label>
        <output
          className="waveform-timeline__timecode"
          htmlFor={rangeId}
          id={descriptionId}
        >
          <span>{currentLabel}</span>
          <span aria-hidden="true">
            {" / "}
          </span>
          <span>{durationLabel}</span>
        </output>
      </div>

      <div
        className="waveform-timeline__surface"
        onLostPointerCapture={(event) => finishPointerInteraction(event, false)}
        onPointerCancel={(event) => finishPointerInteraction(event, false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerInteraction(event, true)}
        ref={surfaceRef}
      >
        <canvas
          aria-hidden="true"
          className="waveform-timeline__canvas"
          ref={canvasRef}
        />
      </div>

      <input
        aria-describedby={descriptionId}
        aria-valuetext={`${currentLabel} of ${durationLabel}`}
        className="waveform-timeline__range"
        disabled={interactionDisabled}
        id={rangeId}
        max={safeDuration || 1}
        min={0}
        onChange={handleRangeChange}
        onKeyDown={handleRangeKeyDown}
        step="any"
        type="range"
        value={safeCurrentTime}
      />
    </div>
  );
}
