import { FULLSCREEN_VERTEX_SHADER, SPECTRAL_FRAGMENT_SHADER } from "./shaders";
import type { FeatureFrame } from "@/lib/audio";
import {
  findPalette,
  findScene,
  type VisualSettings,
} from "./types";

export type RendererKind = "webgl2" | "canvas2d";

export interface SpectralRenderer {
  readonly kind: RendererKind;
  render(frame: FeatureFrame, settings: VisualSettings, time: number): void;
  dispose(): void;
}

type UniformLocations = {
  resolution: WebGLUniformLocation;
  time: WebGLUniformLocation;
  seed: WebGLUniformLocation;
  scene: WebGLUniformLocation;
  bands: WebGLUniformLocation;
  wave: WebGLUniformLocation;
  audio: WebGLUniformLocation;
  spectral: WebGLUniformLocation;
  settings: WebGLUniformLocation;
  flashSafe: WebGLUniformLocation;
  background: WebGLUniformLocation;
  primary: WebGLUniformLocation;
  secondary: WebGLUniformLocation;
  accent: WebGLUniformLocation;
};

const BAND_COUNT = 24;
const WAVEFORM_SIZE = 64;

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
    const message = gl.getProgramInfoLog(program) ?? "Unknown shader link error.";
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
  if (!location) throw new Error(`Missing shader uniform: ${name}`);
  return location;
}

function copyResampled(source: Float32Array, target: Float32Array): void {
  const sourceLength = source.length;
  const targetLength = target.length;
  if (sourceLength === targetLength) {
    target.set(source);
    return;
  }
  if (sourceLength === 0) {
    target.fill(0);
    return;
  }
  const lastSourceIndex = sourceLength - 1;
  const lastTargetIndex = Math.max(1, targetLength - 1);
  for (let index = 0; index < targetLength; index += 1) {
    const position = (index / lastTargetIndex) * lastSourceIndex;
    const lower = Math.floor(position);
    const upper = Math.min(lastSourceIndex, lower + 1);
    const mix = position - lower;
    target[index] = source[lower] * (1 - mix) + source[upper] * mix;
  }
}

function moveToward(
  current: number,
  target: number,
  maximumRise: number,
  maximumFall: number,
): number {
  return current + Math.max(-maximumFall, Math.min(maximumRise, target - current));
}

class WebGLSpectralRenderer implements SpectralRenderer {
  readonly kind = "webgl2" as const;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: UniformLocations;
  private readonly bands = new Float32Array(BAND_COUNT);
  private readonly bandTargets = new Float32Array(BAND_COUNT);
  private readonly waveform = new Float32Array(WAVEFORM_SIZE);
  private readonly safeAudio = new Float32Array(4);
  private safeBrightness = 0;
  private safeSilence = 1;
  private lastRenderTimestamp = Number.NaN;

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
      time: requiredUniform(gl, this.program, "uTime"),
      seed: requiredUniform(gl, this.program, "uSeed"),
      scene: requiredUniform(gl, this.program, "uScene"),
      bands: requiredUniform(gl, this.program, "uBands[0]"),
      wave: requiredUniform(gl, this.program, "uWave[0]"),
      audio: requiredUniform(gl, this.program, "uAudio"),
      spectral: requiredUniform(gl, this.program, "uSpectral"),
      settings: requiredUniform(gl, this.program, "uSettings"),
      flashSafe: requiredUniform(gl, this.program, "uFlashSafe"),
      background: requiredUniform(gl, this.program, "uBackground"),
      primary: requiredUniform(gl, this.program, "uPrimary"),
      secondary: requiredUniform(gl, this.program, "uSecondary"),
      accent: requiredUniform(gl, this.program, "uAccent"),
    };
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  render(frame: FeatureFrame, settings: VisualSettings, time: number): void {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    copyResampled(frame.bands, this.bandTargets);
    copyResampled(frame.waveform, this.waveform);
    const timestamp = typeof performance === "undefined" ? Date.now() : performance.now();
    const deltaSeconds = Number.isFinite(this.lastRenderTimestamp)
      ? Math.min(0.1, Math.max(1 / 240, (timestamp - this.lastRenderTimestamp) / 1000))
      : 1 / 60;
    this.lastRenderTimestamp = timestamp;

    for (let index = 0; index < this.bandTargets.length; index += 1) {
      const target = Math.sqrt(
        Math.min(1, this.bandTargets[index] * settings.sensitivity * 1.8),
      );
      this.bands[index] = settings.flashSafe
        ? moveToward(
          this.bands[index],
          target,
          deltaSeconds * 2.1,
          deltaSeconds * 1.35,
        )
        : target;
    }
    const palette = findPalette(settings.palette);
    const scene = findScene(settings.scene);
    const silence = frame.isSilent ? 1 : 0;
    const pulse = Math.min(
      1,
      frame.spectralFlux * 1.45 + Math.max(0, frame.peak - frame.rms * 1.35) * 0.55,
    );
    const audioTargets = [
      Math.min(1.5, frame.rms * settings.sensitivity),
      Math.min(1.5, frame.peak * settings.sensitivity),
      Math.min(1.5, frame.spectralFlux * settings.sensitivity),
      pulse,
    ] as const;
    if (settings.flashSafe) {
      const riseRates = [1.35, 2.1, 1.7, 1.85] as const;
      const fallRates = [0.9, 1.25, 1.15, 1.2] as const;
      for (let index = 0; index < this.safeAudio.length; index += 1) {
        this.safeAudio[index] = moveToward(
          this.safeAudio[index],
          audioTargets[index],
          deltaSeconds * riseRates[index],
          deltaSeconds * fallRates[index],
        );
      }
      this.safeBrightness = moveToward(
        this.safeBrightness,
        frame.brightness,
        deltaSeconds * 1.2,
        deltaSeconds * 0.85,
      );
      this.safeSilence = moveToward(
        this.safeSilence,
        silence,
        deltaSeconds * 1.1,
        deltaSeconds * 1.1,
      );
    } else {
      this.safeAudio.set(audioTargets);
      this.safeBrightness = frame.brightness;
      this.safeSilence = silence;
    }
    const centroid = Math.min(
      1,
      Math.max(0, Math.log(Math.max(30, frame.spectralCentroidHz) / 30) / Math.log(20_000 / 30)),
    );
    const rolloff = Math.min(
      1,
      Math.max(0, Math.log(Math.max(30, frame.spectralRolloffHz) / 30) / Math.log(20_000 / 30)),
    );

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms.time, time);
    gl.uniform1f(this.uniforms.seed, settings.seed);
    gl.uniform1i(this.uniforms.scene, scene.index);
    gl.uniform1fv(this.uniforms.bands, this.bands);
    gl.uniform1fv(this.uniforms.wave, this.waveform);
    gl.uniform4f(
      this.uniforms.audio,
      this.safeAudio[0],
      this.safeAudio[1],
      this.safeAudio[2],
      this.safeAudio[3],
    );
    gl.uniform4f(
      this.uniforms.spectral,
      centroid,
      rolloff,
      this.safeBrightness,
      this.safeSilence,
    );
    gl.uniform4f(
      this.uniforms.settings,
      settings.intensity,
      settings.motion,
      settings.bloom,
      settings.detail,
    );
    gl.uniform1f(this.uniforms.flashSafe, settings.flashSafe ? 1 : 0);
    gl.uniform3f(this.uniforms.background, ...palette.background);
    gl.uniform3f(this.uniforms.primary, ...palette.primary);
    gl.uniform3f(this.uniforms.secondary, ...palette.secondary);
    gl.uniform3f(this.uniforms.accent, ...palette.accent);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}

function cssColor(color: readonly [number, number, number], alpha = 1): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(
    color[2] * 255,
  )}, ${alpha})`;
}

class CanvasSpectralRenderer implements SpectralRenderer {
  readonly kind = "canvas2d" as const;
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) throw new Error("Canvas rendering is unavailable.");
    this.context = context;
  }

  render(frame: FeatureFrame, settings: VisualSettings, time: number): void {
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const palette = findPalette(settings.palette);
    context.fillStyle = cssColor(palette.background);
    context.fillRect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    context.lineJoin = "round";

    if (settings.scene === "lattice") {
      this.drawLattice(frame, settings, palette, width, height, time);
    } else if (settings.scene === "trace") {
      this.drawTrace(frame, settings, palette, width, height);
    } else if (settings.scene === "orbit") {
      this.drawOrbit(frame, settings, palette, width, height, time);
    } else if (settings.scene === "field") {
      this.drawField(frame, settings, palette, width, height, time);
    } else {
      this.drawContours(frame, settings, palette, width, height, time);
    }
    context.restore();
  }

  private drawTrace(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
  ): void {
    const context = this.context;
    context.strokeStyle = cssColor(palette.primary, 0.92);
    context.shadowColor = cssColor(palette.primary);
    context.shadowBlur = 12 + settings.bloom * 24;
    context.lineWidth = Math.max(2, width / 640);
    context.beginPath();
    const waveform = frame.waveform;
    const last = Math.max(1, waveform.length - 1);
    for (let index = 0; index < waveform.length; index += 1) {
      const x = (index / last) * width;
      const y = height * 0.5 + waveform[index] * height * (0.18 + frame.rms * 0.16);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();

    const barWidth = width / frame.bands.length;
    context.fillStyle = cssColor(palette.secondary, 0.22);
    for (let index = 0; index < frame.bands.length; index += 1) {
      const band = frame.bands[index];
      const barHeight = height * band * 0.28;
      context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 2), barHeight);
    }
  }

  private drawOrbit(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
    time: number,
  ): void {
    const context = this.context;
    const centerX = width / 2;
    const centerY = height / 2;
    const base = Math.min(width, height) * (0.16 + frame.rms * 0.06);
    const count = frame.bands.length * 4;
    context.strokeStyle = cssColor(palette.primary, 0.78);
    context.shadowColor = cssColor(palette.secondary);
    context.shadowBlur = 8 + settings.bloom * 22;
    context.lineWidth = Math.max(1, width / 900);
    context.beginPath();
    for (let index = 0; index <= count; index += 1) {
      const progress = index / count;
      const angle = progress * Math.PI * 2 - Math.PI / 2 + time * settings.motion * 0.02;
      const band = frame.bands[Math.min(frame.bands.length - 1, Math.floor(progress * frame.bands.length))];
      const radius = base + band * Math.min(width, height) * 0.22;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.stroke();
  }

  private drawField(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
    time: number,
  ): void {
    const context = this.context;
    const centerX = width * (0.48 + (frame.spectralCentroid - 0.5) * 0.08);
    const centerY = height * 0.52;
    const glow = context.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      Math.max(width, height) * 0.65,
    );
    glow.addColorStop(0, cssColor(palette.secondary, 0.16 + frame.rms * 0.3));
    glow.addColorStop(0.5, cssColor(palette.primary, 0.05 + frame.brightness * 0.08));
    glow.addColorStop(1, cssColor(palette.background, 0));
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    const ribbons = 6;
    context.shadowColor = cssColor(palette.secondary);
    context.shadowBlur = 8 + settings.bloom * 24;
    context.lineWidth = Math.max(1, width / 1100);
    for (let ribbon = 0; ribbon < ribbons; ribbon += 1) {
      const ribbonProgress = ribbon / Math.max(1, ribbons - 1);
      context.strokeStyle = cssColor(
        ribbonProgress > 0.62 ? palette.secondary : palette.primary,
        0.09 + frame.rms * 0.3,
      );
      context.beginPath();
      for (let index = 0; index <= 96; index += 1) {
        const progress = index / 96;
        const band = frame.bands[Math.min(
          frame.bands.length - 1,
          Math.floor(progress * frame.bands.length),
        )];
        const wave = frame.waveform[Math.min(
          frame.waveform.length - 1,
          Math.floor(progress * frame.waveform.length),
        )];
        const x = progress * width;
        const y = height * (0.2 + ribbonProgress * 0.6)
          + Math.sin(progress * 7 + ribbon * 0.9 + time * settings.motion) * height * (0.025 + band * 0.09)
          + wave * height * 0.035;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  }

  private drawLattice(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
    time: number,
  ): void {
    const context = this.context;
    const rows = Math.round(16 + settings.detail * 24);
    const size = height / rows;
    const columns = Math.ceil(width / size);
    const centerX = (columns - 1) / 2;
    const centerY = (rows - 1) / 2;
    const reach = (0.12 + frame.rms * 0.72) * Math.min(columns, rows);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column - centerX;
        const y = row - centerY;
        const distance = Math.hypot(x, y);
        const angle = (Math.atan2(y, x) + Math.PI) / (Math.PI * 2);
        const band = frame.bands[Math.min(frame.bands.length - 1, Math.floor(angle * frame.bands.length))];
        const ripple =
          Math.sin(distance * 0.9 - time * settings.motion) * frame.spectralFlux * 2.6;
        if (distance > reach + band * rows * 0.3 + ripple) continue;
        const alpha = Math.min(0.9, 0.2 + band * 0.8);
        context.fillStyle = cssColor(distance / Math.max(1, reach) > 0.72 ? palette.secondary : palette.primary, alpha);
        context.fillRect(column * size + 1, row * size + 1, size - 2, size - 2);
      }
    }
  }

  private drawContours(
    frame: FeatureFrame,
    settings: VisualSettings,
    palette: ReturnType<typeof findPalette>,
    width: number,
    height: number,
    time: number,
  ): void {
    const context = this.context;
    const lineCount = Math.round(9 + settings.detail * 12);
    context.shadowColor = cssColor(palette.primary);
    context.shadowBlur = 6 + settings.bloom * 18;
    for (let line = 0; line < lineCount; line += 1) {
      const progress = line / Math.max(1, lineCount - 1);
      context.strokeStyle = cssColor(progress > 0.65 ? palette.secondary : palette.primary, 0.18 + frame.rms * 0.46);
      context.lineWidth = Math.max(1, width / 1100);
      context.beginPath();
      for (let index = 0; index <= 96; index += 1) {
        const xProgress = index / 96;
        const band = frame.bands[Math.min(frame.bands.length - 1, Math.floor(xProgress * frame.bands.length))];
        const x = xProgress * width;
        const wave = Math.sin(xProgress * 12 + time * settings.motion + line * 0.7);
        const y = height * (0.15 + progress * 0.7) + wave * height * (0.012 + band * 0.055);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  }

  dispose(): void {
    // Canvas 2D does not retain explicit GPU resources.
  }
}

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
