export type AudioFeatureMode = "live" | "demo";

export type AudioBandCount = 16 | 24;

export type AudioBandScale = "erb" | "log" | "mel";

export interface AudioFeatureOptions {
  bandCount?: AudioBandCount;
  bandScale?: AudioBandScale;
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  highFrequencyCutoffHz?: number;
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
  /** Nominal cadence of feature extraction; browser scheduling can jitter. */
  readonly analysisRateHz: number;
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
  /** Relative digital level. This is dBFS, not LUFS, SPL, or loudness. */
  readonly levelDbFs: number;
  /** Sign changes per adjacent sample pair in the current mono analysis window. */
  readonly zeroCrossingRate: number;

  readonly spectralCentroidHz: number;
  readonly spectralCentroid: number;
  readonly spectralRolloffHz: number;
  readonly spectralRolloff: number;
  /** Fraction of spectral power above the configured cutoff (3 kHz by default). */
  readonly highFrequencyRatio: number;
  /** Adaptive half-wave spectral-flux response in the 0..1 range. */
  readonly onsetStrength: number;
  readonly spectralFluxRaw: number;
  readonly spectralFluxBaseline: number;

  /** BPM-equivalent of the selected short-term onset-periodicity candidate. */
  readonly periodicityBpm: number;
  readonly periodicitySeconds: number;
  /** Heuristic periodicity evidence score in 0..1; not probability or confidence. */
  readonly periodicityEvidence: number;
  readonly pulsePhase: number;
  readonly rhythmEvidenceSeconds: number;

  readonly isSilent: boolean;
  readonly silenceDurationSeconds: number;

  /** 256 block-averaged time-domain samples in the -1..1 range. */
  readonly waveform: Float32Array<ArrayBuffer>;
  /** Linear-amplitude FFT bins. */
  readonly spectrum: Float32Array<ArrayBuffer>;
  /** Browser analyser FFT dB values, not the waveform RMS dBFS metric. */
  readonly spectrumDb: Float32Array<ArrayBuffer>;
  /** Attack/release-smoothed triangular frequency-band amplitudes. */
  readonly bands: Float32Array<ArrayBuffer>;
  readonly bandsRaw: Float32Array<ArrayBuffer>;
  readonly bandCentersHz: Float32Array<ArrayBuffer>;
  readonly bandEdgesHz: Float32Array<ArrayBuffer>;

  /** Octave-folded twelve-tone pitch-class energy; not note/chord/key inference. */
  readonly chroma: Float32Array<ArrayBuffer>;
  readonly chromaRaw: Float32Array<ArrayBuffer>;
  readonly chromaConcentration: number;
  readonly dominantChroma: number;

  /** Rolling non-negative cosine similarity of level-normalized ERB-band shape. */
  readonly selfSimilarity: Float32Array<ArrayBuffer>;
  readonly selfSimilaritySize: number;
  readonly selfSimilarityHead: number;
  readonly selfSimilarityCount: number;
  /** Strongest similarity to the newest vector outside the two-second local zone. */
  readonly recurrence: number;
}

export interface FeatureBus {
  readonly mode: AudioFeatureMode;
  readonly frame: FeatureFrame;
  readonly disposed: boolean;

  /** Pass a monotonic analysis-clock timestamp; rendering cadence is independent. */
  update(timestampMs?: number): FeatureFrame;
  reset(): void;
  dispose(): void;
}
