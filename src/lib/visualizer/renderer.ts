import type { FeatureFrame } from "@/lib/audio";
import { FULLSCREEN_VERTEX_SHADER, SPECTRAL_FRAGMENT_SHADER } from "./shaders";
import { findPalette, findScene, type VisualSettings } from "./types";

export type RendererKind = "webgl2" | "canvas2d";

export interface SpectralRenderer {
  readonly kind: RendererKind;
  render(frame: FeatureFrame, settings: VisualSettings, time: number): void;
  reset(): void;
  dispose(): void;
}

type UniformLocations = {
  resolution: WebGLUniformLocation;
  scene: WebGLUniformLocation;
  bands: WebGLUniformLocation;
  chroma: WebGLUniformLocation;
  wave: WebGLUniformLocation;
  chromaMeta: WebGLUniformLocation;
  temporal: WebGLUniformLocation;
  spectral: WebGLUniformLocation;
  rhythm: WebGLUniformLocation;
  rhythmEvidence: WebGLUniformLocation;
  similarity: WebGLUniformLocation;
  similarityMeta: WebGLUniformLocation;
  settings: WebGLUniformLocation;
  gain: WebGLUniformLocation;
  highlightCompression: WebGLUniformLocation;
  background: WebGLUniformLocation;
  primary: WebGLUniformLocation;
  secondary: WebGLUniformLocation;
  accent: WebGLUniformLocation;
};

const BAND_COUNT = 24;
const CHROMA_COUNT = 12;
const WAVEFORM_SIZE = 256;
const SIMILARITY_SIZE = 64;
const MIN_PERIODICITY_BPM = 50;
const MAX_PERIODICITY_BPM = 200;
const MAX_RHYTHM_EVIDENCE_SECONDS = 8;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function visualGain(settings: VisualSettings): number {
  return Math.max(0.1, Math.min(4, settings.sensitivity));
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader compilation error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, SPECTRAL_FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create a WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function requiredUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (location === null) throw new Error(`Missing shader uniform: ${name}`);
  return location;
}

function copyResampled(source: Float32Array, target: Float32Array): void {
  if (source.length === target.length) {
    target.set(source);
    return;
  }
  if (source.length === 0) {
    target.fill(0);
    return;
  }

  const sourceLast = source.length - 1;
  const targetLast = Math.max(1, target.length - 1);
  for (let index = 0; index < target.length; index += 1) {
    const sourcePosition = (index / targetLast) * sourceLast;
    const lower = Math.floor(sourcePosition);
    const upper = Math.min(sourceLast, lower + 1);
    target[index] = source[lower] * (1 - (sourcePosition - lower))
      + source[upper] * (sourcePosition - lower);
  }
}

function frequencyBandPosition(frame: FeatureFrame, frequencyHz: number): number {
  const centers = frame.bandCentersHz;
  if (centers.length < 2 || frequencyHz <= 0) return 0;
  if (frequencyHz <= centers[0]) return 0;
  const last = centers.length - 1;
  if (frequencyHz >= centers[last]) return 1;

  for (let upper = 1; upper < centers.length; upper += 1) {
    if (frequencyHz <= centers[upper]) {
      const lower = upper - 1;
      const span = Math.max(1e-6, centers[upper] - centers[lower]);
      const fractionalBand = (frequencyHz - centers[lower]) / span;
      return (lower + fractionalBand) / last;
    }
  }
  return 1;
}

function normalizedPeriodicityBpm(bpm: number): number {
  if (!(bpm > 0)) return 0;
  return clampUnit((bpm - MIN_PERIODICITY_BPM) / (MAX_PERIODICITY_BPM - MIN_PERIODICITY_BPM));
}

function normalizedEvidence(seconds: number): number {
  return clampUnit(seconds / MAX_RHYTHM_EVIDENCE_SECONDS);
}

function rebuildChronologicalSimilarity(
  frame: FeatureFrame,
  target: Float32Array,
): void {
  target.fill(0);
  const sourceSize = Math.min(
    SIMILARITY_SIZE,
    Math.max(0, Math.floor(frame.selfSimilaritySize)),
  );
  const count = Math.min(
    sourceSize,
    Math.max(0, Math.floor(frame.selfSimilarityCount)),
  );
  if (sourceSize === 0 || count === 0 || frame.selfSimilarityHead < 0) return;

  const oldest = count < sourceSize ? 0 : (frame.selfSimilarityHead + 1) % sourceSize;
  for (let row = 0; row < count; row += 1) {
    const sourceRow = (oldest + row) % sourceSize;
    for (let column = 0; column < count; column += 1) {
      const sourceColumn = (oldest + column) % sourceSize;
      target[row * SIMILARITY_SIZE + column] = clampUnit(
        frame.selfSimilarity[sourceRow * sourceSize + sourceColumn] ?? 0,
      );
    }
  }
}

class WebGLSpectralRenderer implements SpectralRenderer {
  readonly kind = "webgl2" as const;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: UniformLocations;
  private readonly bands = new Float32Array(BAND_COUNT);
  private readonly chroma = new Float32Array(CHROMA_COUNT);
  private readonly waveform = new Float32Array(WAVEFORM_SIZE);
  private readonly similarityData = new Float32Array(SIMILARITY_SIZE * SIMILARITY_SIZE);
  private readonly similarityTexture: WebGLTexture;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      desynchronized: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      stencil: false,
    });
    if (!gl) throw new Error("WebGL 2 is unavailable.");
    this.gl = gl;
    this.program = createProgram(gl);
    this.uniforms = {
      resolution: requiredUniform(gl, this.program, "uResolution"),
      scene: requiredUniform(gl, this.program, "uScene"),
      bands: requiredUniform(gl, this.program, "uBands[0]"),
      chroma: requiredUniform(gl, this.program, "uChroma[0]"),
      wave: requiredUniform(gl, this.program, "uWave[0]"),
      chromaMeta: requiredUniform(gl, this.program, "uChromaMeta"),
      temporal: requiredUniform(gl, this.program, "uTemporal"),
      spectral: requiredUniform(gl, this.program, "uSpectral"),
      rhythm: requiredUniform(gl, this.program, "uRhythm"),
      rhythmEvidence: requiredUniform(gl, this.program, "uRhythmEvidence"),
      similarity: requiredUniform(gl, this.program, "uSimilarity"),
      similarityMeta: requiredUniform(gl, this.program, "uSimilarityMeta"),
      settings: requiredUniform(gl, this.program, "uSettings"),
      gain: requiredUniform(gl, this.program, "uGain"),
      highlightCompression: requiredUniform(gl, this.program, "uHighlightCompression"),
      background: requiredUniform(gl, this.program, "uBackground"),
      primary: requiredUniform(gl, this.program, "uPrimary"),
      secondary: requiredUniform(gl, this.program, "uSecondary"),
      accent: requiredUniform(gl, this.program, "uAccent"),
    };

    const texture = gl.createTexture();
    if (!texture) {
      gl.deleteProgram(this.program);
      throw new Error("Unable to create the self-similarity texture.");
    }
    this.similarityTexture = texture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      SIMILARITY_SIZE,
      SIMILARITY_SIZE,
      0,
      gl.RED,
      gl.FLOAT,
      this.similarityData,
    );
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  render(frame: FeatureFrame, settings: VisualSettings, time: number): void {
    void time;
    const gl = this.gl;
    if (gl.isContextLost()) return;

    copyResampled(frame.bands, this.bands);
    copyResampled(frame.chroma, this.chroma);
    copyResampled(frame.waveform, this.waveform);
    rebuildChronologicalSimilarity(frame, this.similarityData);

    const palette = findPalette(settings.palette);
    const scene = findScene(settings.scene);
    const centroidPosition = frequencyBandPosition(frame, frame.spectralCentroidHz);
    const rolloffPosition = frequencyBandPosition(frame, frame.spectralRolloffHz);
    const similarityCount = Math.min(SIMILARITY_SIZE, Math.max(0, frame.selfSimilarityCount));
    const similarityHead = frame.selfSimilarityHead >= 0
      ? (frame.selfSimilarityHead + 0.5) / SIMILARITY_SIZE
      : 0;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.similarityTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      SIMILARITY_SIZE,
      SIMILARITY_SIZE,
      gl.RED,
      gl.FLOAT,
      this.similarityData,
    );
    gl.uniform1i(this.uniforms.similarity, 0);
    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.uniforms.scene, scene.index);
    gl.uniform1fv(this.uniforms.bands, this.bands);
    gl.uniform1fv(this.uniforms.chroma, this.chroma);
    gl.uniform1fv(this.uniforms.wave, this.waveform);
    gl.uniform2f(
      this.uniforms.chromaMeta,
      frame.chromaConcentration,
      frame.dominantChroma,
    );
    gl.uniform4f(
      this.uniforms.temporal,
      frame.rms,
      frame.peak,
      frame.crestFactor,
      frame.zeroCrossingRate,
    );
    gl.uniform4f(
      this.uniforms.spectral,
      centroidPosition,
      rolloffPosition,
      frame.highFrequencyRatio,
      0,
    );
    gl.uniform4f(
      this.uniforms.rhythm,
      frame.onsetStrength,
      normalizedPeriodicityBpm(frame.periodicityBpm),
      frame.periodicityEvidence,
      frame.pulsePhase,
    );
    gl.uniform1f(
      this.uniforms.rhythmEvidence,
      normalizedEvidence(frame.rhythmEvidenceSeconds),
    );
    gl.uniform4f(
      this.uniforms.similarityMeta,
      similarityCount / SIMILARITY_SIZE,
      frame.recurrence,
      similarityHead,
      frame.selfSimilaritySize,
    );
    gl.uniform4f(
      this.uniforms.settings,
      settings.intensity,
      0,
      settings.bloom,
      settings.detail,
    );
    gl.uniform1f(this.uniforms.gain, visualGain(settings));
    gl.uniform1f(
      this.uniforms.highlightCompression,
      settings.highlightCompression ? 1 : 0,
    );
    gl.uniform3f(this.uniforms.background, ...palette.background);
    gl.uniform3f(this.uniforms.primary, ...palette.primary);
    gl.uniform3f(this.uniforms.secondary, ...palette.secondary);
    gl.uniform3f(this.uniforms.accent, ...palette.accent);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  reset(): void {
    this.bands.fill(0);
    this.chroma.fill(0);
    this.waveform.fill(0);
    this.similarityData.fill(0);
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.similarityTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      SIMILARITY_SIZE,
      SIMILARITY_SIZE,
      gl.RED,
      gl.FLOAT,
      this.similarityData,
    );
  }

  dispose(): void {
    this.gl.deleteTexture(this.similarityTexture);
    this.gl.deleteProgram(this.program);
  }
}

function cssColor(color: readonly [number, number, number], alpha = 1): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(
    color[2] * 255,
  )}, ${alpha})`;
}

function mixColor(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  amount: number,
  alpha: number,
): string {
  const mix = clampUnit(amount);
  return cssColor(
    [
      first[0] * (1 - mix) + second[0] * mix,
      first[1] * (1 - mix) + second[1] * mix,
      first[2] * (1 - mix) + second[2] * mix,
    ],
    alpha,
  );
}

class CanvasSpectralRenderer implements SpectralRenderer {
  readonly kind = "canvas2d" as const;
  private readonly context: CanvasRenderingContext2D;
  private readonly similarityData = new Float32Array(SIMILARITY_SIZE * SIMILARITY_SIZE);

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) throw new Error("Canvas rendering is unavailable.");
    this.context = context;
  }

  render(frame: FeatureFrame, settings: VisualSettings, time: number): void {
    void time;
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const palette = findPalette(settings.palette);
    context.fillStyle = cssColor(palette.background);
    context.fillRect(0, 0, width, height);
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalAlpha = 0.7 + settings.intensity * 0.3;
    context.shadowBlur = settings.highlightCompression
      ? 2 + settings.bloom * 8
      : 4 + settings.bloom * 18;

    if (settings.scene === "field") {
      this.drawField(frame, settings, palette, width, height);
    } else if (settings.scene === "orbit") {
      this.drawOrbit(frame, settings, palette, width, height);
    } else if (settings.scene === "trace") {
      this.drawTrace(frame, settings, palette, width, height);
    } else if (settings.scene === "lattice") {
      this.drawLattice(frame, settings, palette, width, height);
    } else {
      this.drawContour(frame, settings, palette, width, height);
    }
    context.restore();
  }

  private drawField(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
  ): void {
    const context = this.context;
    const count = frame.bands.length;
    if (count === 0) return;
    const gain = visualGain(settings);
    const baseline = height * 0.91;
    const plotHeight = height * 0.78;
    const cellWidth = width / count;
    let energy = 0;

    for (let index = 0; index < count; index += 1) {
      const amplitude = Math.sqrt(clampUnit(frame.bands[index] * gain));
      energy += amplitude;
      const barHeight = amplitude * plotHeight;
      context.fillStyle = mixColor(
        palette.primary,
        index / Math.max(1, count - 1) > 0.62 ? palette.accent : palette.secondary,
        index / Math.max(1, count - 1),
        0.2 + amplitude * 0.46,
      );
      context.fillRect(
        index * cellWidth + 1,
        baseline - barHeight,
        Math.max(1, cellWidth - 2),
        barHeight,
      );
    }

    if (energy <= 1e-5) return;
    context.shadowColor = cssColor(palette.primary);
    context.strokeStyle = cssColor(palette.primary, 0.86);
    context.lineWidth = Math.max(1.5, width / 900);
    context.beginPath();
    for (let index = 0; index < count; index += 1) {
      const amplitude = Math.sqrt(clampUnit(frame.bands[index] * gain));
      const x = (index + 0.5) * cellWidth;
      const y = baseline - amplitude * plotHeight;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();

    const centroidX = frequencyBandPosition(frame, frame.spectralCentroidHz) * width;
    const rolloffX = frequencyBandPosition(frame, frame.spectralRolloffHz) * width;
    context.lineWidth = Math.max(1, width / 1200);
    context.strokeStyle = cssColor(palette.accent, 0.7);
    context.beginPath();
    context.moveTo(centroidX, height * 0.06);
    context.lineTo(centroidX, baseline);
    context.stroke();
    context.strokeStyle = cssColor(palette.secondary, 0.64);
    context.beginPath();
    context.moveTo(rolloffX, height * 0.06);
    context.lineTo(rolloffX, baseline);
    context.stroke();

    context.fillStyle = cssColor(palette.accent, frame.highFrequencyRatio * 0.12);
    context.fillRect(width * 0.62, height * 0.06, width * 0.38, baseline - height * 0.06);
  }

  private drawOrbit(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
  ): void {
    const context = this.context;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width, height);
    const innerRadius = scale * 0.07;
    const gain = visualGain(settings);
    context.shadowColor = cssColor(palette.secondary);

    for (let pitchClass = 0; pitchClass < CHROMA_COUNT; pitchClass += 1) {
      const energy = Math.sqrt(clampUnit((frame.chroma[pitchClass] ?? 0) * gain));
      if (energy <= 1e-5) continue;
      const start = -PI / 2 + (pitchClass / CHROMA_COUNT) * TAU + 0.015;
      const end = -PI / 2 + ((pitchClass + 1) / CHROMA_COUNT) * TAU - 0.015;
      const radius = innerRadius + energy * scale * 0.38;
      context.beginPath();
      context.arc(centerX, centerY, innerRadius, start, end);
      context.arc(centerX, centerY, radius, end, start, true);
      context.closePath();
      context.fillStyle = mixColor(
        palette.primary,
        palette.accent,
        pitchClass / (CHROMA_COUNT - 1),
        0.22 + energy * 0.5,
      );
      context.fill();
      context.strokeStyle = pitchClass === frame.dominantChroma
        ? cssColor(palette.accent, frame.chromaConcentration)
        : cssColor(palette.primary, 0.44);
      context.lineWidth = pitchClass === frame.dominantChroma
        ? Math.max(2, width / 500)
        : Math.max(1, width / 1000);
      context.stroke();
    }

    if (frame.chromaConcentration > 0) {
      context.beginPath();
      context.arc(centerX, centerY, innerRadius * 0.76, 0, TAU);
      context.strokeStyle = cssColor(palette.secondary, 0.35 + frame.chromaConcentration * 0.5);
      context.lineWidth = Math.max(1, frame.chromaConcentration * scale * 0.012);
      context.stroke();
    }
  }

  private drawTrace(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
  ): void {
    const context = this.context;
    const gain = visualGain(settings);
    const center = height / 2;
    const amplitudeScale = height * 0.38;
    const rms = clampUnit(frame.rms * gain) * amplitudeScale;
    const peak = clampUnit(frame.peak * gain) * amplitudeScale;

    context.setLineDash([Math.max(3, width / 220), Math.max(4, width / 150)]);
    context.lineWidth = Math.max(1, width / 1200);
    context.strokeStyle = cssColor(palette.secondary, 0.38);
    for (const offset of [-rms, rms]) {
      context.beginPath();
      context.moveTo(0, center + offset);
      context.lineTo(width, center + offset);
      context.stroke();
    }
    context.setLineDash([]);
    context.strokeStyle = cssColor(palette.accent, 0.3);
    for (const offset of [-peak, peak]) {
      context.beginPath();
      context.moveTo(0, center + offset);
      context.lineTo(width, center + offset);
      context.stroke();
    }

    const waveform = frame.waveform;
    if (waveform.length > 0) {
      context.shadowColor = cssColor(palette.primary);
      context.strokeStyle = cssColor(palette.primary, 0.92);
      context.lineWidth = Math.max(1.5, width / 700);
      context.beginPath();
      const last = Math.max(1, waveform.length - 1);
      for (let index = 0; index < waveform.length; index += 1) {
        const x = (index / last) * width;
        const y = center - Math.max(-1, Math.min(1, waveform[index] * gain)) * amplitudeScale;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }

    const crest = clampUnit((frame.crestFactor - 1) / 5);
    context.fillStyle = cssColor(palette.accent, 0.44);
    context.fillRect(0, height * (1 - crest), Math.max(4, width * 0.025), height * crest);
    context.fillStyle = cssColor(palette.secondary, 0.58);
    context.fillRect(0, height - Math.max(3, height * 0.018), width * frame.zeroCrossingRate, height);
  }

  private drawLattice(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
  ): void {
    const context = this.context;
    const bpm = normalizedPeriodicityBpm(frame.periodicityBpm);
    const evidenceStrength = clampUnit(frame.periodicityEvidence);
    const onset = clampUnit(frame.onsetStrength * visualGain(settings));
    const phase = clampUnit(frame.pulsePhase);
    const evidence = normalizedEvidence(frame.rhythmEvidenceSeconds);
    const density = Math.round(10 + bpm * 14);
    const cellSize = Math.min(width, height) / density;
    const columns = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const centerX = width / 2;
    const centerY = height / 2;
    const phaseRadius = Math.min(width, height) * (0.06 + phase * 0.52);
    context.shadowColor = cssColor(palette.primary);

    if (evidenceStrength > 0) {
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = (column + 0.5) * cellSize;
          const y = (row + 0.5) * cellSize;
          const distance = Math.hypot(x - centerX, y - centerY);
          const ringDistance = Math.abs(distance - phaseRadius);
          const activation = clampUnit(1 - ringDistance / (cellSize * 2.4)) * evidenceStrength;
          if (activation <= 0.02) continue;
          context.fillStyle = mixColor(
            palette.primary,
            palette.secondary,
            bpm,
            0.12 + activation * 0.58,
          );
          context.fillRect(
            column * cellSize + 1,
            row * cellSize + 1,
            Math.max(1, cellSize - 2),
            Math.max(1, cellSize - 2),
          );
        }
      }
    }

    if (onset > 0) {
      context.beginPath();
      context.arc(centerX, centerY, Math.min(width, height) * (0.025 + onset * 0.12), 0, TAU);
      context.fillStyle = cssColor(palette.accent, 0.42 + onset * 0.42);
      context.fill();
    }

    if (evidence > 0) {
      context.beginPath();
      context.arc(
        centerX,
        centerY,
        Math.min(width, height) * 0.59,
        -PI / 2,
        -PI / 2 + TAU * evidence,
      );
      context.strokeStyle = cssColor(palette.secondary, 0.68);
      context.lineWidth = Math.max(2, Math.min(width, height) * 0.008);
      context.stroke();
    }
  }

  private drawContour(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
  ): void {
    const context = this.context;
    rebuildChronologicalSimilarity(frame, this.similarityData);
    const count = Math.min(SIMILARITY_SIZE, Math.max(0, frame.selfSimilarityCount));
    if (count === 0) return;
    const cellWidth = width / SIMILARITY_SIZE;
    const cellHeight = height / SIMILARITY_SIZE;
    const levels = Math.round(6 + settings.detail * 12);

    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        const similarity = this.similarityData[row * SIMILARITY_SIZE + column];
        if (similarity <= 0) continue;
        const contour = 1 - Math.abs((similarity * levels) % 1 - 0.5) * 2;
        context.fillStyle = mixColor(
          palette.primary,
          similarity > 0.72 ? palette.accent : palette.secondary,
          similarity,
          0.12 + similarity * 0.6 + contour * 0.12,
        );
        context.fillRect(
          column * cellWidth,
          row * cellHeight,
          Math.ceil(cellWidth),
          Math.ceil(cellHeight),
        );
      }
    }

    context.strokeStyle = cssColor(palette.secondary, 0.45);
    context.lineWidth = Math.max(1, width / 1100);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(count * cellWidth, count * cellHeight);
    context.stroke();
    context.strokeStyle = cssColor(palette.accent, frame.recurrence * 0.52);
    context.strokeRect(0, 0, count * cellWidth, count * cellHeight);
  }

  reset(): void {
    this.similarityData.fill(0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  dispose(): void {
    // Canvas 2D does not retain explicit GPU resources.
  }
}

const PI = Math.PI;
const TAU = Math.PI * 2;

export function createSpectralRenderer(canvas: HTMLCanvasElement): SpectralRenderer {
  if (typeof WebGL2RenderingContext !== "undefined") {
    let webglReady = false;
    try {
      const probe = document.createElement("canvas");
      probe.width = 2;
      probe.height = 2;
      const probeRenderer = new WebGLSpectralRenderer(probe);
      probeRenderer.dispose();
      webglReady = true;
    } catch (error) {
      console.warn("WebGL renderer unavailable; using Canvas 2D safe mode.", error);
    }
    if (webglReady) {
      try {
        return new WebGLSpectralRenderer(canvas);
      } catch (error) {
        console.warn("WebGL renderer failed on the output canvas.", error);
      }
    }
  }
  return new CanvasSpectralRenderer(canvas);
}
