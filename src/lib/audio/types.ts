export type AudioFeatureMode = "live" | "demo";

export type AudioBandCount = 16 | 24;

export type AudioBandScale = "log" | "mel";

export interface AudioFeatureOptions {
  bandCount?: AudioBandCount;
  bandScale?: AudioBandScale;
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  brightnessCutoffHz?: number;
  rolloffPercent?: number;
  attackMs?: number;
  releaseMs?: number;
  fluxBaselineAttackMs?: number;
  fluxBaselineReleaseMs?: number;
  silenceThresholdDb?: number;
  silenceHysteresisDb?: number;
  silenceHoldMs?: number;
  spectrumFloorDb?: number;
}

export interface LiveFeatureBusOptions extends AudioFeatureOptions {
  mode?: "live";
}

export interface DemoFeatureBusOptions extends AudioFeatureOptions {
  mode: "demo";
  sampleRate?: number;
  fftSize?: number;
  seed?: number;
  bpm?: number;
}

/**
 * A mutable-in-place snapshot. The object and every typed array keep the same
 * identity for the lifetime of the bus, so they can be bound directly to a
 * renderer without per-frame copies.
 */
export interface FeatureFrame {
  readonly mode: AudioFeatureMode;
  readonly sampleRate: number;
  readonly fftSize: number;
  readonly binHz: number;
  readonly sequence: number;
  readonly timestampMs: number;
  readonly timeSeconds: number;
  readonly deltaSeconds: number;

  readonly rms: number;
  readonly rmsRaw: number;
  readonly peak: number;
  readonly peakRaw: number;
  readonly crestFactor: number;
  readonly crestFactorRaw: number;
  readonly levelDb: number;

  readonly spectralCentroidHz: number;
  readonly spectralCentroid: number;
  readonly spectralRolloffHz: number;
  readonly spectralRolloff: number;
  readonly brightness: number;
  readonly spectralFlux: number;
  readonly spectralFluxRaw: number;
  readonly spectralFluxBaseline: number;

  readonly isSilent: boolean;
  readonly silenceDurationSeconds: number;

  /** 64 evenly spaced time-domain samples in the -1..1 range. */
  readonly waveform: Float32Array<ArrayBuffer>;
  /** Linear-amplitude FFT bins. */
  readonly spectrum: Float32Array<ArrayBuffer>;
  /** Raw FFT bins in dBFS, useful for diagnostics and custom mappings. */
  readonly spectrumDb: Float32Array<ArrayBuffer>;
  /** Attack/release-smoothed perceptual band amplitudes. */
  readonly bands: Float32Array<ArrayBuffer>;
  readonly bandsRaw: Float32Array<ArrayBuffer>;
  readonly bandCentersHz: Float32Array<ArrayBuffer>;
  readonly bandEdgesHz: Float32Array<ArrayBuffer>;
}

export interface FeatureBus {
  readonly mode: AudioFeatureMode;
  readonly frame: FeatureFrame;
  readonly disposed: boolean;

  /** Pass the requestAnimationFrame timestamp when one is available. */
  update(timestampMs?: number): FeatureFrame;
  reset(): void;
  dispose(): void;
}
