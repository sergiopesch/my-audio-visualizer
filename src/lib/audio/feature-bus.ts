import type {
  AudioBandScale,
  AudioFeatureMode,
  DemoFeatureBusOptions,
  FeatureBus,
  FeatureFrame,
  LiveFeatureBusOptions,
} from "./types";

const WAVEFORM_SIZE = 64;
const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_SAMPLE_RATE = 48_000;
const DEFAULT_FRAME_MS = 1000 / 60;
const EPSILON = 1e-8;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutableFeatureFrame = Mutable<FeatureFrame>;
type ResolvedOptions = {
  bandCount: 16 | 24;
  bandScale: AudioBandScale;
  minFrequencyHz: number;
  maxFrequencyHz: number;
  brightnessCutoffHz: number;
  rolloffPercent: number;
  attackSeconds: number;
  releaseSeconds: number;
  fluxBaselineAttackSeconds: number;
  fluxBaselineReleaseSeconds: number;
  silenceThresholdDb: number;
  silenceHysteresisDb: number;
  silenceHoldSeconds: number;
  spectrumFloorDb: number;
  seed: number;
  bpm: number;
};

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function smoothingAlpha(deltaSeconds: number, timeSeconds: number): number {
  if (deltaSeconds <= 0) return 0;
  if (timeSeconds <= 0) return 1;
  return 1 - Math.exp(-deltaSeconds / timeSeconds);
}

function smoothAttackRelease(
  current: number,
  target: number,
  deltaSeconds: number,
  attackSeconds: number,
  releaseSeconds: number,
): number {
  const time = target > current ? attackSeconds : releaseSeconds;
  return current + (target - current) * smoothingAlpha(deltaSeconds, time);
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

function isValidFftSize(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 32 &&
    value <= 32768 &&
    (value & (value - 1)) === 0
  );
}

function resolveOptions(
  input: LiveFeatureBusOptions | DemoFeatureBusOptions,
  nyquistHz: number,
  binHz: number,
): ResolvedOptions {
  const bandCount = input.bandCount ?? 24;
  if (bandCount !== 16 && bandCount !== 24) {
    throw new RangeError("bandCount must be either 16 or 24");
  }

  const bandScale = input.bandScale ?? "log";
  if (bandScale !== "log" && bandScale !== "mel") {
    throw new RangeError('bandScale must be either "log" or "mel"');
  }

  const minimumAllowedHz = Math.max(1, binHz * 0.5);
  const minFrequencyHz = clamp(
    finiteOr(input.minFrequencyHz, 30),
    minimumAllowedHz,
    nyquistHz,
  );
  const maxFrequencyHz = clamp(
    finiteOr(input.maxFrequencyHz, Math.min(20_000, nyquistHz)),
    minFrequencyHz,
    nyquistHz,
  );

  if (maxFrequencyHz <= minFrequencyHz) {
    throw new RangeError("maxFrequencyHz must be greater than minFrequencyHz");
  }

  const brightnessCutoffHz = clamp(
    finiteOr(input.brightnessCutoffHz, 3_000),
    binHz,
    nyquistHz,
  );
  const rolloffPercent = clamp(finiteOr(input.rolloffPercent, 0.85), 0.5, 0.99);
  const attackSeconds = Math.max(0, finiteOr(input.attackMs, 35) / 1000);
  const releaseSeconds = Math.max(0, finiteOr(input.releaseMs, 220) / 1000);
  const fluxBaselineAttackSeconds = Math.max(
    0.001,
    finiteOr(input.fluxBaselineAttackMs, 900) / 1000,
  );
  const fluxBaselineReleaseSeconds = Math.max(
    0.001,
    finiteOr(input.fluxBaselineReleaseMs, 2_400) / 1000,
  );
  const silenceThresholdDb = clamp(
    finiteOr(input.silenceThresholdDb, -58),
    -120,
    -1,
  );
  const silenceHysteresisDb = clamp(
    finiteOr(input.silenceHysteresisDb, 6),
    0,
    30,
  );
  const silenceHoldSeconds = Math.max(
    0,
    finiteOr(input.silenceHoldMs, 450) / 1000,
  );
  const spectrumFloorDb = clamp(finiteOr(input.spectrumFloorDb, -100), -160, -20);

  return {
    bandCount,
    bandScale,
    minFrequencyHz,
    maxFrequencyHz,
    brightnessCutoffHz,
    rolloffPercent,
    attackSeconds,
    releaseSeconds,
    fluxBaselineAttackSeconds,
    fluxBaselineReleaseSeconds,
    silenceThresholdDb,
    silenceHysteresisDb,
    silenceHoldSeconds,
    spectrumFloorDb,
    seed: finiteOr("seed" in input ? input.seed : undefined, 7),
    bpm: clamp(finiteOr("bpm" in input ? input.bpm : undefined, 118), 30, 300),
  };
}

function nowMilliseconds(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export class AudioFeatureBus implements FeatureBus {
  readonly mode: AudioFeatureMode;
  readonly frame: FeatureFrame;

  private analyser: AnalyserNode | null;
  private readonly mutableFrame: MutableFeatureFrame;
  private readonly options: ResolvedOptions;
  private readonly timeDomain: Float32Array<ArrayBuffer>;
  private readonly byteTimeDomain: Uint8Array<ArrayBuffer> | null;
  private readonly byteFrequency: Uint8Array<ArrayBuffer> | null;
  private readonly previousSpectrum: Float32Array<ArrayBuffer>;
  private readonly bandWeights: Float32Array<ArrayBuffer>;
  private readonly bandWeightSums: Float32Array<ArrayBuffer>;
  private readonly bandStartBins: Int32Array<ArrayBuffer>;
  private readonly bandEndBins: Int32Array<ArrayBuffer>;
  private readonly hasFloatTimeData: boolean;
  private readonly hasFloatFrequencyData: boolean;
  private readonly seedPhaseA: number;
  private readonly seedPhaseB: number;

  private lastTimestampMs = Number.NaN;
  private elapsedSeconds = 0;
  private hasFrame = false;
  private hasSpectrumHistory = false;
  private belowSilenceSeconds = 0;
  private _disposed = false;

  constructor(analyser: AnalyserNode, options?: LiveFeatureBusOptions);
  constructor(analyser: null, options: DemoFeatureBusOptions);
  constructor(
    analyser: AnalyserNode | null,
    options: LiveFeatureBusOptions | DemoFeatureBusOptions = {},
  ) {
    this.mode = options.mode ?? "live";
    if (this.mode === "live" && !analyser) {
      throw new TypeError("Live audio analysis requires an AnalyserNode");
    }
    if (this.mode === "demo" && analyser) {
      throw new TypeError("Demo mode must not be constructed with an AnalyserNode");
    }

    const sampleRate =
      analyser?.context.sampleRate ??
      finiteOr("sampleRate" in options ? options.sampleRate : undefined, DEFAULT_SAMPLE_RATE);
    const fftSize =
      analyser?.fftSize ??
      finiteOr("fftSize" in options ? options.fftSize : undefined, DEFAULT_FFT_SIZE);

    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("sampleRate must be a positive finite number");
    }
    if (!isValidFftSize(fftSize)) {
      throw new RangeError("fftSize must be a power of two between 32 and 32768");
    }

    const frequencyBinCount = fftSize / 2;
    const binHz = sampleRate / fftSize;
    const nyquistHz = sampleRate / 2;
    this.options = resolveOptions(options, nyquistHz, binHz);
    this.analyser = analyser;

    this.hasFloatTimeData =
      analyser !== null && typeof analyser.getFloatTimeDomainData === "function";
    this.hasFloatFrequencyData =
      analyser !== null && typeof analyser.getFloatFrequencyData === "function";
    this.timeDomain = new Float32Array(fftSize);
    this.byteTimeDomain =
      this.mode === "live" && !this.hasFloatTimeData ? new Uint8Array(fftSize) : null;
    this.byteFrequency =
      this.mode === "live" && !this.hasFloatFrequencyData
        ? new Uint8Array(frequencyBinCount)
        : null;

    const waveform = new Float32Array(WAVEFORM_SIZE);
    const spectrum = new Float32Array(frequencyBinCount);
    const spectrumDb = new Float32Array(frequencyBinCount);
    spectrumDb.fill(this.options.spectrumFloorDb);
    const bands = new Float32Array(this.options.bandCount);
    const bandsRaw = new Float32Array(this.options.bandCount);
    const bandCentersHz = new Float32Array(this.options.bandCount);
    const bandEdgesHz = new Float32Array(this.options.bandCount + 1);

    this.previousSpectrum = new Float32Array(frequencyBinCount);
    this.bandWeights = new Float32Array(this.options.bandCount * frequencyBinCount);
    this.bandWeightSums = new Float32Array(this.options.bandCount);
    this.bandStartBins = new Int32Array(this.options.bandCount);
    this.bandEndBins = new Int32Array(this.options.bandCount);

    this.mutableFrame = {
      mode: this.mode,
      sampleRate,
      fftSize,
      binHz,
      sequence: 0,
      timestampMs: 0,
      timeSeconds: 0,
      deltaSeconds: 0,
      rms: 0,
      rmsRaw: 0,
      peak: 0,
      peakRaw: 0,
      crestFactor: 0,
      crestFactorRaw: 0,
      levelDb: this.options.spectrumFloorDb,
      spectralCentroidHz: 0,
      spectralCentroid: 0,
      spectralRolloffHz: 0,
      spectralRolloff: 0,
      brightness: 0,
      spectralFlux: 0,
      spectralFluxRaw: 0,
      spectralFluxBaseline: 0,
      isSilent: true,
      silenceDurationSeconds: 0,
      waveform,
      spectrum,
      spectrumDb,
      bands,
      bandsRaw,
      bandCentersHz,
      bandEdgesHz,
    };
    this.frame = this.mutableFrame;

    const numericSeed = this.options.seed;
    this.seedPhaseA = (Math.sin(numericSeed * 12.9898) * 43758.5453) % 1;
    this.seedPhaseB = (Math.sin((numericSeed + 17) * 78.233) * 12345.6789) % 1;

    this.buildBandLayout();
  }

  get disposed(): boolean {
    return this._disposed;
  }

  update(timestampMs?: number): FeatureFrame {
    if (this._disposed) {
      throw new Error("Cannot update a disposed AudioFeatureBus");
    }

    let timestamp = timestampMs;
    if (timestamp === undefined) {
      timestamp =
        this.mode === "demo"
          ? Number.isFinite(this.lastTimestampMs)
            ? this.lastTimestampMs + DEFAULT_FRAME_MS
            : 0
          : nowMilliseconds();
    }
    if (!Number.isFinite(timestamp)) {
      throw new TypeError("timestampMs must be a finite number");
    }

    let deltaSeconds = 0;
    if (Number.isFinite(this.lastTimestampMs)) {
      deltaSeconds = Math.max(0, (timestamp - this.lastTimestampMs) / 1000);
    }
    this.lastTimestampMs = timestamp;
    this.elapsedSeconds += deltaSeconds;

    if (this.mode === "live") {
      this.readAnalyser();
    } else {
      this.writeDemoData(this.elapsedSeconds);
    }

    this.extractFeatures(deltaSeconds);

    const frame = this.mutableFrame;
    frame.sequence += 1;
    frame.timestampMs = timestamp;
    frame.timeSeconds = this.elapsedSeconds;
    frame.deltaSeconds = deltaSeconds;
    this.hasFrame = true;
    return this.frame;
  }

  reset(): void {
    const frame = this.mutableFrame;
    frame.sequence = 0;
    frame.timestampMs = 0;
    frame.timeSeconds = 0;
    frame.deltaSeconds = 0;
    frame.rms = 0;
    frame.rmsRaw = 0;
    frame.peak = 0;
    frame.peakRaw = 0;
    frame.crestFactor = 0;
    frame.crestFactorRaw = 0;
    frame.levelDb = this.options.spectrumFloorDb;
    frame.spectralCentroidHz = 0;
    frame.spectralCentroid = 0;
    frame.spectralRolloffHz = 0;
    frame.spectralRolloff = 0;
    frame.brightness = 0;
    frame.spectralFlux = 0;
    frame.spectralFluxRaw = 0;
    frame.spectralFluxBaseline = 0;
    frame.isSilent = true;
    frame.silenceDurationSeconds = 0;
    frame.waveform.fill(0);
    frame.spectrum.fill(0);
    frame.spectrumDb.fill(this.options.spectrumFloorDb);
    frame.bands.fill(0);
    frame.bandsRaw.fill(0);
    this.timeDomain.fill(0);
    this.previousSpectrum.fill(0);
    this.byteTimeDomain?.fill(128);
    this.byteFrequency?.fill(0);

    this.lastTimestampMs = Number.NaN;
    this.elapsedSeconds = 0;
    this.hasFrame = false;
    this.hasSpectrumHistory = false;
    this.belowSilenceSeconds = 0;
  }

  dispose(): void {
    if (this._disposed) return;
    this.reset();
    this.analyser = null;
    this._disposed = true;
  }

  private buildBandLayout(): void {
    const frame = this.mutableFrame;
    const edges = frame.bandEdgesHz;
    const centers = frame.bandCentersHz;
    const bandCount = this.options.bandCount;
    const minHz = this.options.minFrequencyHz;
    const maxHz = this.options.maxFrequencyHz;

    if (this.options.bandScale === "mel") {
      const minMel = hzToMel(minHz);
      const melRange = hzToMel(maxHz) - minMel;
      for (let index = 0; index <= bandCount; index += 1) {
        edges[index] = melToHz(minMel + (melRange * index) / bandCount);
      }
      for (let index = 0; index < bandCount; index += 1) {
        centers[index] = melToHz(
          (hzToMel(edges[index]) + hzToMel(edges[index + 1])) * 0.5,
        );
      }
    } else {
      const ratio = maxHz / minHz;
      for (let index = 0; index <= bandCount; index += 1) {
        edges[index] = minHz * ratio ** (index / bandCount);
      }
      for (let index = 0; index < bandCount; index += 1) {
        centers[index] = Math.sqrt(edges[index] * edges[index + 1]);
      }
    }

    const binHz = frame.binHz;
    const binCount = frame.spectrum.length;
    for (let band = 0; band < bandCount; band += 1) {
      const lowHz = edges[band];
      const highHz = edges[band + 1];
      let firstBin = binCount - 1;
      let lastBin = 0;
      let totalWeight = 0;
      const weightOffset = band * binCount;

      for (let bin = 0; bin < binCount; bin += 1) {
        const binLowHz = Math.max(0, (bin - 0.5) * binHz);
        const binHighHz = (bin + 0.5) * binHz;
        const overlapHz = Math.max(
          0,
          Math.min(highHz, binHighHz) - Math.max(lowHz, binLowHz),
        );
        const weight = overlapHz / binHz;
        if (weight > 0) {
          this.bandWeights[weightOffset + bin] = weight;
          totalWeight += weight;
          if (bin < firstBin) firstBin = bin;
          if (bin > lastBin) lastBin = bin;
        }
      }

      if (totalWeight === 0) {
        const nearestBin = clamp(Math.round(centers[band] / binHz), 0, binCount - 1);
        this.bandWeights[weightOffset + nearestBin] = 1;
        totalWeight = 1;
        firstBin = nearestBin;
        lastBin = nearestBin;
      }

      this.bandWeightSums[band] = totalWeight;
      this.bandStartBins[band] = firstBin;
      this.bandEndBins[band] = lastBin;
    }
  }

  private readAnalyser(): void {
    const analyser = this.analyser;
    if (!analyser) return;
    const frame = this.mutableFrame;
    if (
      analyser.fftSize !== frame.fftSize ||
      analyser.frequencyBinCount !== frame.spectrum.length
    ) {
      throw new Error(
        "AnalyserNode.fftSize changed after AudioFeatureBus construction; create a new bus",
      );
    }

    if (this.hasFloatTimeData) {
      analyser.getFloatTimeDomainData(this.timeDomain);
    } else {
      const bytes = this.byteTimeDomain;
      if (!bytes) return;
      analyser.getByteTimeDomainData(bytes);
      for (let index = 0; index < bytes.length; index += 1) {
        this.timeDomain[index] = (bytes[index] - 128) / 128;
      }
    }

    if (this.hasFloatFrequencyData) {
      analyser.getFloatFrequencyData(frame.spectrumDb);
    } else {
      const bytes = this.byteFrequency;
      if (!bytes) return;
      analyser.getByteFrequencyData(bytes);
      const minDb = analyser.minDecibels;
      const dbRange = analyser.maxDecibels - minDb;
      for (let index = 0; index < bytes.length; index += 1) {
        frame.spectrumDb[index] = minDb + (bytes[index] / 255) * dbRange;
      }
    }

    const floorDb = this.options.spectrumFloorDb;
    const spectrum = frame.spectrum;
    const spectrumDb = frame.spectrumDb;
    for (let index = 0; index < spectrum.length; index += 1) {
      const db = spectrumDb[index];
      spectrum[index] =
        Number.isFinite(db) && db > floorDb ? clamp(10 ** (db * 0.05), 0, 1) : 0;
    }
  }

  private writeDemoData(timeSeconds: number): void {
    const frame = this.mutableFrame;
    const beat = (timeSeconds * this.options.bpm) / 60;
    const beatPhase = beat - Math.floor(beat);
    const halfBeat = beat * 2 - Math.floor(beat * 2);
    const barPhase = beat / 4 - Math.floor(beat / 4);
    const kick = Math.exp(-beatPhase * 13);
    const hat = Math.exp(-halfBeat * 28);
    const movement = 0.5 + 0.5 * Math.sin(timeSeconds * 0.37 + this.seedPhaseA * 6.28);
    const drop = barPhase > 0.84 ? clamp((1 - barPhase) / 0.16, 0.08, 1) : 1;
    const sampleRate = frame.sampleRate;
    const sampleCount = this.timeDomain.length;
    const windowStart = timeSeconds - sampleCount / sampleRate;

    for (let index = 0; index < sampleCount; index += 1) {
      const sampleTime = windowStart + index / sampleRate;
      const bass = Math.sin(
        2 * Math.PI * (54 + movement * 9) * sampleTime + this.seedPhaseA,
      );
      const body = Math.sin(2 * Math.PI * 173 * sampleTime + this.seedPhaseB * 2.1);
      const air = Math.sin(2 * Math.PI * 947 * sampleTime + this.seedPhaseA * 4.7);
      this.timeDomain[index] = clamp(
        drop * (bass * (0.28 + kick * 0.32) + body * 0.15 + air * hat * 0.035),
        -1,
        1,
      );
    }

    const spectrum = frame.spectrum;
    const spectrumDb = frame.spectrumDb;
    const binHz = frame.binHz;
    const bassCenter = 58 + movement * 28;
    const midCenter = 440 + 210 * Math.sin(timeSeconds * 0.21 + this.seedPhaseB);

    for (let bin = 0; bin < spectrum.length; bin += 1) {
      const hz = Math.max(binHz, bin * binHz);
      const bassDistance = Math.log2(hz / bassCenter);
      const bodyDistance = Math.log2(hz / midCenter);
      const airDistance = Math.log2(hz / 6_200);
      const bass = Math.exp(-bassDistance * bassDistance * 10) * (0.18 + kick * 0.62);
      const body = Math.exp(-bodyDistance * bodyDistance * 2.4) * (0.08 + movement * 0.2);
      const air = Math.exp(-airDistance * airDistance * 3.2) * hat * 0.16;
      const texture =
        (0.5 +
          0.5 *
            Math.sin(
              bin * 1.618 + timeSeconds * 1.73 + this.seedPhaseA * 19.1,
            )) * 0.008;
      const amplitude = clamp(drop * (bass + body + air + texture), 0, 1);
      spectrum[bin] = amplitude;
      spectrumDb[bin] =
        amplitude > EPSILON ? 20 * Math.log10(amplitude) : this.options.spectrumFloorDb;
    }
  }

  private extractFeatures(deltaSeconds: number): void {
    const frame = this.mutableFrame;
    const sampleCount = this.timeDomain.length;
    let squareSum = 0;
    let peakRaw = 0;

    for (let index = 0; index < sampleCount; index += 1) {
      const sample = clamp(this.timeDomain[index], -1, 1);
      const absolute = Math.abs(sample);
      squareSum += sample * sample;
      if (absolute > peakRaw) peakRaw = absolute;
    }

    const rmsRaw = Math.sqrt(squareSum / sampleCount);
    const crestRaw = rmsRaw > EPSILON ? Math.min(32, peakRaw / rmsRaw) : 0;
    this.downsampleWaveform();

    const spectrum = frame.spectrum;
    const binHz = frame.binHz;
    const nyquistHz = frame.sampleRate / 2;
    const brightnessBin = Math.ceil(this.options.brightnessCutoffHz / binHz);
    let magnitudeSum = 0;
    let weightedFrequencySum = 0;
    let powerSum = 0;
    let brightPowerSum = 0;
    let fluxSum = 0;

    for (let bin = 1; bin < spectrum.length; bin += 1) {
      const amplitude = spectrum[bin];
      const power = amplitude * amplitude;
      magnitudeSum += amplitude;
      weightedFrequencySum += amplitude * bin * binHz;
      powerSum += power;
      if (bin >= brightnessBin) brightPowerSum += power;
      if (this.hasSpectrumHistory) {
        const delta = amplitude - this.previousSpectrum[bin];
        if (delta > 0) fluxSum += delta;
      }
      this.previousSpectrum[bin] = amplitude;
    }

    const centroidRaw =
      magnitudeSum > EPSILON ? weightedFrequencySum / magnitudeSum : 0;
    const rolloffTarget = powerSum * this.options.rolloffPercent;
    let cumulativePower = 0;
    let rolloffRaw = 0;
    if (rolloffTarget > EPSILON) {
      for (let bin = 1; bin < spectrum.length; bin += 1) {
        cumulativePower += spectrum[bin] * spectrum[bin];
        if (cumulativePower >= rolloffTarget) {
          rolloffRaw = bin * binHz;
          break;
        }
      }
    }
    const brightnessRaw = powerSum > EPSILON ? brightPowerSum / powerSum : 0;
    const fluxRaw = this.hasSpectrumHistory
      ? fluxSum / Math.max(1, spectrum.length - 1)
      : 0;

    const previousBaseline = frame.spectralFluxBaseline;
    const fluxScale = Math.max(0.00025, previousBaseline * 2);
    const fluxTarget = 1 - Math.exp(-Math.max(0, fluxRaw - previousBaseline) / fluxScale);
    const baselineTime =
      fluxRaw > previousBaseline
        ? this.options.fluxBaselineAttackSeconds
        : this.options.fluxBaselineReleaseSeconds;
    const baseline =
      previousBaseline +
      (fluxRaw - previousBaseline) * smoothingAlpha(deltaSeconds, baselineTime);

    this.extractBands(deltaSeconds);

    const initialize = !this.hasFrame;
    frame.rmsRaw = rmsRaw;
    frame.peakRaw = peakRaw;
    frame.crestFactorRaw = crestRaw;
    frame.spectralFluxRaw = fluxRaw;
    frame.spectralFluxBaseline = initialize ? fluxRaw : baseline;

    frame.rms = initialize
      ? rmsRaw
      : smoothAttackRelease(
          frame.rms,
          rmsRaw,
          deltaSeconds,
          this.options.attackSeconds,
          this.options.releaseSeconds,
        );
    frame.peak = initialize
      ? peakRaw
      : smoothAttackRelease(
          frame.peak,
          peakRaw,
          deltaSeconds,
          this.options.attackSeconds,
          this.options.releaseSeconds,
        );
    frame.crestFactor = initialize
      ? crestRaw
      : smoothAttackRelease(
          frame.crestFactor,
          crestRaw,
          deltaSeconds,
          this.options.attackSeconds,
          this.options.releaseSeconds,
        );
    frame.spectralCentroidHz = initialize
      ? centroidRaw
      : smoothAttackRelease(
          frame.spectralCentroidHz,
          centroidRaw,
          deltaSeconds,
          this.options.attackSeconds,
          this.options.releaseSeconds,
        );
    frame.spectralRolloffHz = initialize
      ? rolloffRaw
      : smoothAttackRelease(
          frame.spectralRolloffHz,
          rolloffRaw,
          deltaSeconds,
          this.options.attackSeconds,
          this.options.releaseSeconds,
        );
    frame.brightness = initialize
      ? brightnessRaw
      : smoothAttackRelease(
          frame.brightness,
          brightnessRaw,
          deltaSeconds,
          this.options.attackSeconds,
          this.options.releaseSeconds,
        );
    frame.spectralFlux = initialize
      ? 0
      : smoothAttackRelease(
          frame.spectralFlux,
          fluxTarget,
          deltaSeconds,
          this.options.attackSeconds,
          this.options.releaseSeconds,
        );
    frame.spectralCentroid = clamp(frame.spectralCentroidHz / nyquistHz, 0, 1);
    frame.spectralRolloff = clamp(frame.spectralRolloffHz / nyquistHz, 0, 1);
    frame.levelDb =
      frame.rms > EPSILON
        ? Math.max(this.options.spectrumFloorDb, 20 * Math.log10(frame.rms))
        : this.options.spectrumFloorDb;

    this.updateSilenceState(rmsRaw, deltaSeconds);
    this.hasSpectrumHistory = true;
  }

  private extractBands(deltaSeconds: number): void {
    const frame = this.mutableFrame;
    const binCount = frame.spectrum.length;
    for (let band = 0; band < this.options.bandCount; band += 1) {
      const offset = band * binCount;
      const startBin = this.bandStartBins[band];
      const endBin = this.bandEndBins[band];
      let weightedPower = 0;
      for (let bin = startBin; bin <= endBin; bin += 1) {
        const amplitude = frame.spectrum[bin];
        weightedPower += amplitude * amplitude * this.bandWeights[offset + bin];
      }
      const raw = Math.sqrt(weightedPower / this.bandWeightSums[band]);
      frame.bandsRaw[band] = raw;
      frame.bands[band] = this.hasFrame
        ? smoothAttackRelease(
            frame.bands[band],
            raw,
            deltaSeconds,
            this.options.attackSeconds,
            this.options.releaseSeconds,
          )
        : raw;
    }
  }

  private downsampleWaveform(): void {
    const waveform = this.mutableFrame.waveform;
    const source = this.timeDomain;
    for (let point = 0; point < WAVEFORM_SIZE; point += 1) {
      const sourcePosition = (point * (source.length - 1)) / (WAVEFORM_SIZE - 1);
      const lowerIndex = Math.floor(sourcePosition);
      const upperIndex = Math.min(source.length - 1, lowerIndex + 1);
      const mix = sourcePosition - lowerIndex;
      waveform[point] = clamp(
        source[lowerIndex] + (source[upperIndex] - source[lowerIndex]) * mix,
        -1,
        1,
      );
    }
  }

  private updateSilenceState(rmsRaw: number, deltaSeconds: number): void {
    const frame = this.mutableFrame;
    const rawDb = rmsRaw > EPSILON ? 20 * Math.log10(rmsRaw) : -160;
    const wakeThreshold =
      this.options.silenceThresholdDb + this.options.silenceHysteresisDb;

    if (!this.hasFrame && rawDb >= this.options.silenceThresholdDb) {
      frame.isSilent = false;
      this.belowSilenceSeconds = 0;
    } else if (frame.isSilent) {
      if (rawDb >= wakeThreshold) {
        frame.isSilent = false;
        this.belowSilenceSeconds = 0;
      } else {
        this.belowSilenceSeconds += deltaSeconds;
      }
    } else if (rawDb < this.options.silenceThresholdDb) {
      this.belowSilenceSeconds += deltaSeconds;
      if (this.belowSilenceSeconds >= this.options.silenceHoldSeconds) {
        frame.isSilent = true;
      }
    } else {
      this.belowSilenceSeconds = 0;
    }

    frame.silenceDurationSeconds = frame.isSilent ? this.belowSilenceSeconds : 0;
  }
}

export function createAudioFeatureBus(
  analyser: AnalyserNode,
  options: LiveFeatureBusOptions = {},
): AudioFeatureBus {
  return new AudioFeatureBus(analyser, options);
}

/** Explicit opt-in: demo data is never substituted for a missing live source. */
export function createDemoFeatureBus(options: DemoFeatureBusOptions): AudioFeatureBus {
  if (options.mode !== "demo") {
    throw new TypeError('createDemoFeatureBus requires { mode: "demo" }');
  }
  return new AudioFeatureBus(null, options);
}
