export const CHROMA_BIN_COUNT = 12;
export const SELF_SIMILARITY_SIZE = 64;
export const SELF_SIMILARITY_RATE_HZ = 8;
export const RECURRENCE_EXCLUSION_SECONDS = 2;
export const RECURRENCE_EXCLUSION_FRAMES =
  SELF_SIMILARITY_RATE_HZ * RECURRENCE_EXCLUSION_SECONDS;
export const RHYTHM_SAMPLE_RATE_HZ = 50;

export const PITCH_CLASS_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;

const EPSILON = 1e-8;

export type ScientificBandScale = "erb" | "log" | "mel";

export function clampUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Glasberg and Moore's ERB-rate scale (normal-hearing population model). */
export function hzToErbRate(hz: number): number {
  return 21.4 * Math.log10(1 + 0.00437 * Math.max(0, hz));
}

export function erbRateToHz(erbRate: number): number {
  return (10 ** (erbRate / 21.4) - 1) / 0.00437;
}

export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + Math.max(0, hz) / 700);
}

export function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

function scaleFrequency(hz: number, scale: ScientificBandScale): number {
  if (scale === "erb") return hzToErbRate(hz);
  if (scale === "mel") return hzToMel(hz);
  return Math.log(Math.max(EPSILON, hz));
}

function unscaleFrequency(value: number, scale: ScientificBandScale): number {
  if (scale === "erb") return erbRateToHz(value);
  if (scale === "mel") return melToHz(value);
  return Math.exp(value);
}

/**
 * Fill equally spaced points on the selected frequency scale. A triangular
 * filterbank with B filters needs B + 2 points (low, B centres, high).
 */
export function fillScalePoints(
  target: Float32Array,
  scale: ScientificBandScale,
  minFrequencyHz: number,
  maxFrequencyHz: number,
): void {
  const low = scaleFrequency(minFrequencyHz, scale);
  const span = scaleFrequency(maxFrequencyHz, scale) - low;
  const last = Math.max(1, target.length - 1);
  for (let index = 0; index < target.length; index += 1) {
    target[index] = unscaleFrequency(low + span * (index / last), scale);
  }
}

export function pitchClassForFrequency(frequencyHz: number): number {
  if (!(frequencyHz > 0)) return Number.NaN;
  const midi = 69 + 12 * Math.log2(frequencyHz / 440);
  return ((midi % 12) + 12) % 12;
}

export function normalizedEntropyConcentration(values: Float32Array): number {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index];
  if (total <= EPSILON || values.length <= 1) return 0;

  let entropy = 0;
  for (let index = 0; index < values.length; index += 1) {
    const probability = values[index] / total;
    if (probability > EPSILON) entropy -= probability * Math.log(probability);
  }
  return clampUnit(1 - entropy / Math.log(values.length));
}

export interface RhythmEstimate {
  readonly periodicityBpm: number;
  readonly periodicitySeconds: number;
  /** Heuristic correlation-and-coverage evidence in 0..1; not a probability. */
  readonly periodicityEvidence: number;
  readonly pulsePhase: number;
  readonly evidenceSeconds: number;
}

/**
 * A causal, short-term autocorrelation of an onset-strength envelope. It finds
 * periodicity candidates; it does not assert a musical beat or authoritative
 * tempo. The 50 Hz internal grid makes the result independent of display FPS.
 */
export class RhythmPeriodicityTracker {
  private readonly values: Float32Array;
  private readonly correlations: Float32Array;
  private head = -1;
  private count = 0;
  private accumulatorSeconds = 0;
  private estimateAccumulatorSeconds = 0;
  private elapsedSeconds = 0;
  private lastCandidateSeconds = Number.NaN;
  private previousOnset = 0;
  private periodicityBpm = 0;
  private periodicitySeconds = 0;
  private periodicityEvidence = 0;

  constructor(
    private readonly sampleRateHz = RHYTHM_SAMPLE_RATE_HZ,
    historySeconds = 8,
  ) {
    this.values = new Float32Array(Math.max(64, Math.round(sampleRateHz * historySeconds)));
    this.correlations = new Float32Array(Math.round((sampleRateHz * 60) / 50) + 1);
  }

  update(onsetStrength: number, deltaSeconds: number): RhythmEstimate {
    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const onset = clampUnit(onsetStrength);
    this.elapsedSeconds += safeDelta;

    if (onset >= 0.28 && onset > this.previousOnset * 1.08) {
      this.lastCandidateSeconds = this.elapsedSeconds;
    }
    this.previousOnset = onset;

    const interval = 1 / this.sampleRateHz;
    this.accumulatorSeconds += safeDelta;
    this.estimateAccumulatorSeconds += safeDelta;
    while (this.accumulatorSeconds >= interval) {
      this.push(onset);
      this.accumulatorSeconds -= interval;
    }

    if (this.estimateAccumulatorSeconds >= 0.25) {
      this.estimateAccumulatorSeconds %= 0.25;
      this.estimate();
    }

    const pulsePhase =
      this.periodicitySeconds > 0 && Number.isFinite(this.lastCandidateSeconds)
        ? ((this.elapsedSeconds - this.lastCandidateSeconds) / this.periodicitySeconds) % 1
        : 0;

    return {
      periodicityBpm: this.periodicityBpm,
      periodicitySeconds: this.periodicitySeconds,
      periodicityEvidence: this.periodicityEvidence,
      pulsePhase: pulsePhase < 0 ? pulsePhase + 1 : pulsePhase,
      evidenceSeconds: this.count / this.sampleRateHz,
    };
  }

  reset(): void {
    this.values.fill(0);
    this.head = -1;
    this.count = 0;
    this.accumulatorSeconds = 0;
    this.estimateAccumulatorSeconds = 0;
    this.elapsedSeconds = 0;
    this.lastCandidateSeconds = Number.NaN;
    this.previousOnset = 0;
    this.periodicityBpm = 0;
    this.periodicitySeconds = 0;
    this.periodicityEvidence = 0;
  }

  private push(value: number): void {
    this.head = (this.head + 1) % this.values.length;
    this.values[this.head] = value;
    this.count = Math.min(this.values.length, this.count + 1);
  }

  private chronological(index: number): number {
    const oldest = this.count < this.values.length ? 0 : (this.head + 1) % this.values.length;
    return this.values[(oldest + index) % this.values.length];
  }

  private estimate(): void {
    const minimumEvidence = Math.round(this.sampleRateHz * 2.5);
    if (this.count < minimumEvidence) {
      this.periodicityBpm = 0;
      this.periodicitySeconds = 0;
      this.periodicityEvidence = 0;
      return;
    }

    let mean = 0;
    for (let index = 0; index < this.count; index += 1) mean += this.chronological(index);
    mean /= this.count;

    let variance = 0;
    for (let index = 0; index < this.count; index += 1) {
      const centered = this.chronological(index) - mean;
      variance += centered * centered;
    }
    if (variance <= 1e-5) {
      this.periodicityBpm = 0;
      this.periodicitySeconds = 0;
      this.periodicityEvidence = 0;
      return;
    }

    const minimumLag = Math.max(2, Math.round((this.sampleRateHz * 60) / 200));
    const maximumLag = Math.min(
      this.count - 2,
      Math.round((this.sampleRateHz * 60) / 50),
    );
    let bestLag = 0;
    let bestCorrelation = 0;
    this.correlations.fill(0);

    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
      let numerator = 0;
      let leftEnergy = 0;
      let rightEnergy = 0;
      for (let index = lag; index < this.count; index += 1) {
        const left = this.chronological(index) - mean;
        const right = this.chronological(index - lag) - mean;
        numerator += left * right;
        leftEnergy += left * left;
        rightEnergy += right * right;
      }
      const correlation =
        leftEnergy > EPSILON && rightEnergy > EPSILON
          ? Math.max(0, numerator / Math.sqrt(leftEnergy * rightEnergy))
          : 0;
      this.correlations[lag] = correlation;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }

    if (bestLag === 0 || bestCorrelation < 0.18) {
      this.periodicityBpm = 0;
      this.periodicitySeconds = 0;
      this.periodicityEvidence = 0;
      return;
    }

    // Prefer the shortest metrical candidate within 96% of the maximum.
    for (let lag = minimumLag; lag < bestLag; lag += 1) {
      if (this.correlations[lag] >= bestCorrelation * 0.96) {
        bestLag = lag;
        break;
      }
    }

    // A fractional fast period can spread across adjacent 50 Hz lag bins while
    // an integer subharmonic aligns perfectly (180 BPM is the canonical case:
    // about 16.67 frames versus an exact 50-frame third subharmonic). Look for
    // a locally supported divisor of the winning lag instead of silently
    // turning that quantization artefact into a slower authoritative answer.
    // The deliberately conservative 55% rule is an operational candidate
    // selector, not a music-theory claim; the evidence score uses the selected peak.
    const metricalWinner = bestLag;
    for (let divisor = 4; divisor >= 2; divisor -= 1) {
      const target = metricalWinner / divisor;
      if (target < minimumLag || target > maximumLag) continue;
      const center = Math.round(target);
      let localLag = center;
      let localCorrelation = 0;
      for (
        let lag = Math.max(minimumLag, center - 1);
        lag <= Math.min(maximumLag, center + 1);
        lag += 1
      ) {
        if (this.correlations[lag] > localCorrelation) {
          localCorrelation = this.correlations[lag];
          localLag = lag;
        }
      }
      if (localCorrelation >= bestCorrelation * 0.55) {
        bestLag = localLag;
        break;
      }
    }

    // A three-point parabolic interpolation reduces the quantization imposed
    // by the 50 Hz envelope grid. It refines the candidate; it does not add
    // evidence or turn this descriptor into an authoritative tempo estimate.
    let refinedLag = bestLag;
    if (bestLag > minimumLag && bestLag < maximumLag) {
      const left = this.correlations[bestLag - 1];
      const center = this.correlations[bestLag];
      const right = this.correlations[bestLag + 1];
      const curvature = left - 2 * center + right;
      if (Math.abs(curvature) > EPSILON) {
        refinedLag += clampUnit(0.5 + (0.5 * (left - right)) / curvature) - 0.5;
      }
    }

    this.periodicitySeconds = refinedLag / this.sampleRateHz;
    this.periodicityBpm = 60 / this.periodicitySeconds;
    const evidenceCoverage = clampUnit(this.count / (this.sampleRateHz * 6));
    const selectedCorrelation = this.correlations[bestLag];
    this.periodicityEvidence = clampUnit(
      ((selectedCorrelation - 0.18) / 0.72) * evidenceCoverage,
    );
  }
}

export interface SimilarityEstimate {
  readonly head: number;
  readonly count: number;
  readonly recurrence: number;
}

/**
 * Rolling non-negative cosine self-similarity over level-normalized log
 * auditory-band shape. Negative correlations are reported as zero. The matrix
 * is stable in memory and stored in physical ring-buffer order.
 */
export class SelfSimilarityTracker {
  readonly matrix = new Float32Array(SELF_SIMILARITY_SIZE * SELF_SIMILARITY_SIZE);

  private readonly vectors: Float32Array;
  private head = -1;
  private count = 0;
  private recurrence = 0;

  constructor(
    private readonly bandCount: number,
    private readonly recurrenceExclusionFrames = RECURRENCE_EXCLUSION_FRAMES,
  ) {
    if (!Number.isInteger(recurrenceExclusionFrames) || recurrenceExclusionFrames < 0) {
      throw new RangeError("recurrenceExclusionFrames must be a non-negative integer");
    }
    this.vectors = new Float32Array(SELF_SIMILARITY_SIZE * bandCount);
  }

  update(bands: Float32Array): SimilarityEstimate {
    if (bands.length !== this.bandCount) {
      throw new RangeError(`Expected ${this.bandCount} ERB-spaced bands`);
    }

    this.head = (this.head + 1) % SELF_SIMILARITY_SIZE;
    this.count = Math.min(SELF_SIMILARITY_SIZE, this.count + 1);
    const offset = this.head * this.bandCount;

    // Normalize level before compression. Dividing by the band sum makes a
    // uniformly scaled spectrum produce the same descriptor, while log1p
    // keeps narrow peaks from overwhelming the shape comparison.
    let bandSum = 0;
    for (let band = 0; band < this.bandCount; band += 1) {
      bandSum += Math.max(0, bands[band]);
    }

    let mean = 0;
    for (let band = 0; band < this.bandCount; band += 1) {
      const normalized =
        bandSum > EPSILON
          ? (Math.max(0, bands[band]) * this.bandCount) / bandSum
          : 0;
      const value = Math.log1p(normalized * 8);
      this.vectors[offset + band] = value;
      mean += value;
    }
    mean /= this.bandCount;

    let normSquared = 0;
    for (let band = 0; band < this.bandCount; band += 1) {
      const centered = this.vectors[offset + band] - mean;
      this.vectors[offset + band] = centered;
      normSquared += centered * centered;
    }
    const norm = Math.sqrt(normSquared);
    if (norm > EPSILON) {
      for (let band = 0; band < this.bandCount; band += 1) {
        this.vectors[offset + band] /= norm;
      }
    } else {
      this.vectors.fill(0, offset, offset + this.bandCount);
    }

    this.recurrence = 0;
    for (let frame = 0; frame < SELF_SIMILARITY_SIZE; frame += 1) {
      const populated = this.isPopulated(frame);
      let similarity = 0;
      if (populated && norm > EPSILON) {
        const otherOffset = frame * this.bandCount;
        for (let band = 0; band < this.bandCount; band += 1) {
          similarity += this.vectors[offset + band] * this.vectors[otherOffset + band];
        }
        similarity = clampUnit(similarity);
      }
      this.matrix[this.head * SELF_SIMILARITY_SIZE + frame] = similarity;
      this.matrix[frame * SELF_SIMILARITY_SIZE + this.head] = similarity;
      if (
        frame !== this.head &&
        this.ageFromHead(frame) > this.recurrenceExclusionFrames
      ) {
        this.recurrence = Math.max(this.recurrence, similarity);
      }
    }
    this.matrix[this.head * SELF_SIMILARITY_SIZE + this.head] = norm > EPSILON ? 1 : 0;

    return { head: this.head, count: this.count, recurrence: this.recurrence };
  }

  reset(): void {
    this.matrix.fill(0);
    this.vectors.fill(0);
    this.head = -1;
    this.count = 0;
    this.recurrence = 0;
  }

  private isPopulated(physicalIndex: number): boolean {
    if (this.count === SELF_SIMILARITY_SIZE) return true;
    return physicalIndex >= 0 && physicalIndex < this.count;
  }

  private ageFromHead(physicalIndex: number): number {
    return (this.head - physicalIndex + SELF_SIMILARITY_SIZE) % SELF_SIMILARITY_SIZE;
  }
}
