import { describe, expect, it } from "vitest";

import { AudioFeatureBus } from "./feature-bus";
import type { FeatureFrame, LiveFeatureBusOptions } from "./types";

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 4_096;
const BIN_HZ = SAMPLE_RATE / FFT_SIZE;
const FLOOR_DB = -120;

class FakeAnalyser {
  readonly context = { sampleRate: SAMPLE_RATE };
  readonly fftSize = FFT_SIZE;
  readonly frequencyBinCount = FFT_SIZE / 2;
  readonly minDecibels = FLOOR_DB;
  readonly maxDecibels = 0;
  readonly timeDomain = new Float32Array(FFT_SIZE);
  readonly frequencyData = new Float32Array(FFT_SIZE / 2).fill(FLOOR_DB);

  getFloatTimeDomainData(target: Float32Array): void {
    target.set(this.timeDomain);
  }

  getFloatFrequencyData(target: Float32Array): void {
    target.set(this.frequencyData);
  }

  clear(): void {
    this.timeDomain.fill(0);
    this.frequencyData.fill(FLOOR_DB);
  }

  setSine(bin: number, amplitude: number, polarity = 1): void {
    this.clear();
    for (let sample = 0; sample < this.timeDomain.length; sample += 1) {
      this.timeDomain[sample] =
        polarity * amplitude * Math.sin((2 * Math.PI * bin * sample) / FFT_SIZE);
    }
    this.setSpectrumBin(bin, amplitude);
  }

  setSquare(bin: number, amplitude: number): void {
    this.clear();
    for (let sample = 0; sample < this.timeDomain.length; sample += 1) {
      const sine = Math.sin((2 * Math.PI * bin * (sample + 0.25)) / FFT_SIZE);
      this.timeDomain[sample] = sine >= 0 ? amplitude : -amplitude;
    }
    this.setSpectrumBin(bin, amplitude);
  }

  setSpectrumBin(bin: number, amplitude: number): void {
    this.frequencyData.fill(FLOOR_DB);
    this.frequencyData[bin] = 20 * Math.log10(amplitude);
  }

  setFlatSpectrum(amplitude: number, minHz = 55, maxHz = 5_000): void {
    this.clear();
    const firstBin = Math.ceil(minHz / BIN_HZ);
    const lastBin = Math.floor(maxHz / BIN_HZ);
    const levelDb = 20 * Math.log10(amplitude);
    this.frequencyData.fill(levelDb, firstBin, lastBin + 1);
  }
}

function createBus(
  analyser: FakeAnalyser,
  overrides: LiveFeatureBusOptions = {},
): AudioFeatureBus {
  return new AudioFeatureBus(analyser as unknown as AnalyserNode, {
    attackMs: 0,
    releaseMs: 0,
    spectrumFloorDb: -100,
    ...overrides,
  });
}

function maximumIndex(values: Float32Array): number {
  let bestIndex = -1;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] > bestValue) {
      bestValue = values[index];
      bestIndex = index;
    }
  }
  return bestIndex;
}

function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  let dot = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftEnergy += left[index] ** 2;
    rightEnergy += right[index] ** 2;
  }
  return dot / Math.sqrt(leftEnergy * rightEnergy);
}

function analyzeSingleBin(bin: number): FeatureFrame {
  const analyser = new FakeAnalyser();
  analyser.setSine(bin, 0.5);
  return createBus(analyser).update(0);
}

describe("AudioFeatureBus auditory bands", () => {
  it("publishes a monotonic 24-band ERB layout by default", () => {
    const frame = createBus(new FakeAnalyser()).frame;

    expect(frame.bands).toHaveLength(24);
    expect(frame.bandEdgesHz).toHaveLength(25);
    for (let band = 0; band < frame.bandCentersHz.length; band += 1) {
      expect(frame.bandCentersHz[band]).toBeGreaterThan(frame.bandEdgesHz[band]);
      expect(frame.bandCentersHz[band]).toBeLessThan(frame.bandEdgesHz[band + 1]);
      if (band > 0) {
        expect(frame.bandCentersHz[band]).toBeGreaterThan(frame.bandCentersHz[band - 1]);
      }
    }

    const lowWidth = frame.bandCentersHz[1] - frame.bandCentersHz[0];
    const highWidth = frame.bandCentersHz[23] - frame.bandCentersHz[22];
    expect(highWidth).toBeGreaterThan(lowWidth * 5);
  });

  it("separates low and high equal-RMS signals spectrally without changing level", () => {
    const low = analyzeSingleBin(32);
    const high = analyzeSingleBin(512);

    expect(low.rmsRaw).toBeCloseTo(high.rmsRaw, 6);
    expect(low.rmsRaw).toBeCloseTo(0.5 / Math.SQRT2, 5);
    expect(high.spectralCentroidHz).toBeGreaterThan(low.spectralCentroidHz * 10);
    expect(low.spectralRolloffHz).toBeCloseTo(32 * BIN_HZ, 6);
    expect(high.spectralRolloffHz).toBeCloseTo(512 * BIN_HZ, 6);
    expect(high.highFrequencyRatio).toBeGreaterThan(0.99);
    expect(low.highFrequencyRatio).toBeLessThan(0.01);
    expect(maximumIndex(high.bandsRaw)).toBeGreaterThan(maximumIndex(low.bandsRaw));
  });
});

describe("AudioFeatureBus temporal measurements", () => {
  it("measures RMS, dBFS, peak, and true crest factor from the time-domain window", () => {
    const analyser = new FakeAnalyser();
    const bus = createBus(analyser);
    analyser.setSine(32, 0.5);
    const sine = bus.update(0);

    expect(sine.rmsRaw).toBeCloseTo(0.5 / Math.SQRT2, 5);
    expect(sine.peakRaw).toBeCloseTo(0.5, 5);
    expect(sine.crestFactorRaw).toBeCloseTo(Math.SQRT2, 4);
    expect(sine.levelDbFs).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 4);
    expect(sine.zeroCrossingRate).toBeCloseTo(63 / (FFT_SIZE - 1), 8);

    analyser.setSquare(32, 0.5);
    const square = bus.update(20);
    expect(square.rmsRaw).toBeCloseTo(0.5, 6);
    expect(square.peakRaw).toBeCloseTo(0.5, 6);
    expect(square.crestFactorRaw).toBeCloseTo(1, 6);
  });

  it("does not clip over-full-scale graph samples before level measurement", () => {
    const analyser = new FakeAnalyser();
    const bus = createBus(analyser);
    analyser.setSquare(32, 1.25);
    const frame = bus.update(0);

    expect(frame.rmsRaw).toBeCloseTo(1.25, 6);
    expect(frame.peakRaw).toBeCloseTo(1.25, 6);
    expect(frame.levelDbFs).toBeCloseTo(20 * Math.log10(1.25), 6);
    expect(frame.crestFactorRaw).toBeCloseTo(1, 6);
    expect(Array.from(frame.waveform).every((value) => value >= -1 && value <= 1)).toBe(true);
  });

  it("preserves spectral measurements while exposing waveform polarity", () => {
    const analyser = new FakeAnalyser();
    const bus = createBus(analyser);
    analyser.setSine(8, 0.6, 1);
    const positiveFrame = bus.update(0);
    const waveform = positiveFrame.waveform.slice();
    const bands = positiveFrame.bandsRaw.slice();
    const rms = positiveFrame.rmsRaw;
    const centroid = positiveFrame.spectralCentroidHz;

    analyser.setSine(8, 0.6, -1);
    const invertedFrame = bus.update(20);

    expect(invertedFrame.rmsRaw).toBeCloseTo(rms, 7);
    expect(invertedFrame.spectralCentroidHz).toBeCloseTo(centroid, 7);
    expect(Array.from(invertedFrame.bandsRaw)).toEqual(Array.from(bands));
    for (let point = 0; point < waveform.length; point += 1) {
      expect(invertedFrame.waveform[point]).toBeCloseTo(-waveform[point], 6);
    }
  });

  it("keeps high-frequency time-domain energy visible in the reduced trace", () => {
    const analyser = new FakeAnalyser();
    const bus = createBus(analyser);
    // 512 cycles per 4096-sample window is 6 kHz at 48 kHz. The former
    // 16-sample block mean cancelled this signal to approximately zero.
    analyser.setSine(512, 0.7);
    const frame = bus.update(0);

    expect(Math.max(...frame.waveform)).toBeGreaterThan(0.69);
    expect(Math.min(...frame.waveform)).toBeLessThan(-0.69);
  });
});

describe("AudioFeatureBus chroma", () => {
  it("folds octaves together and rotates a semitone to the adjacent pitch class", () => {
    const lowA = analyzeSingleBin(19);
    const highA = analyzeSingleBin(38);
    const aSharp = analyzeSingleBin(40);

    expect(lowA.dominantChroma).toBe(9);
    expect(highA.dominantChroma).toBe(9);
    expect(cosineSimilarity(lowA.chromaRaw, highA.chromaRaw)).toBeGreaterThan(0.9999);
    expect(aSharp.dominantChroma).toBe((highA.dominantChroma + 1) % 12);
  });

  it("assigns lower concentration to broadband energy than a single tone", () => {
    const pure = analyzeSingleBin(38);
    const analyser = new FakeAnalyser();
    analyser.setFlatSpectrum(0.05);
    const broadband = createBus(analyser).update(0);

    expect(pure.chromaConcentration).toBeGreaterThan(0.65);
    expect(broadband.chromaConcentration).toBeLessThan(0.08);
    expect(broadband.chromaConcentration).toBeLessThan(pure.chromaConcentration);
  });

  it("clears tonal evidence when a pitched frame is followed by silence", () => {
    const analyser = new FakeAnalyser();
    const bus = createBus(analyser, { attackMs: 25, releaseMs: 240 });
    analyser.setSine(38, 0.5);
    const tone = bus.update(0);

    expect(tone.dominantChroma).toBe(9);
    expect(tone.chromaConcentration).toBeGreaterThan(0.65);

    analyser.clear();
    const silence = bus.update(20);

    expect(silence.dominantChroma).toBe(-1);
    expect(silence.chromaConcentration).toBe(0);
    expect(Array.from(silence.chroma).every((value) => value === 0)).toBe(true);
    expect(Array.from(silence.chromaRaw).every((value) => value === 0)).toBe(true);
  });
});

describe("AudioFeatureBus onset response", () => {
  it("spikes on positive spectral change and settles under a steady spectrum", () => {
    const analyser = new FakeAnalyser();
    const bus = createBus(analyser);
    bus.update(0);

    analyser.setSpectrumBin(32, 0.7);
    const attack = bus.update(20).onsetStrength;
    let timestampMs = 20;
    for (let frame = 0; frame < 75; frame += 1) {
      timestampMs += 20;
      bus.update(timestampMs);
    }
    const settled = bus.frame.onsetStrength;

    analyser.setSpectrumBin(256, 0.7);
    const changed = bus.update(timestampMs + 20).onsetStrength;

    expect(attack).toBeGreaterThan(0.8);
    expect(settled).toBeLessThan(0.01);
    expect(changed).toBeGreaterThan(0.8);
  });

  it.each([
    { bpm: 120, pulseWidthFrames: 5 },
    { bpm: 200, pulseWidthFrames: 1 },
  ])(
    "preserves a $bpm BPM-equivalent candidate through production onset smoothing",
    ({ bpm, pulseWidthFrames }) => {
      const analyser = new FakeAnalyser();
      const bus = createBus(analyser, { attackMs: 35, releaseMs: 220 });
      const frameSeconds = 0.02;
      const periodSeconds = 60 / bpm;
      let nextPulseSeconds = 0.5;
      let remainingPulseFrames = 0;
      bus.update(0);

      for (let frame = 1; frame <= 500; frame += 1) {
        const timeSeconds = frame * frameSeconds;
        if (timeSeconds + frameSeconds * 0.5 >= nextPulseSeconds) {
          nextPulseSeconds += periodSeconds;
          remainingPulseFrames = pulseWidthFrames;
        }
        if (remainingPulseFrames > 0) {
          analyser.setSpectrumBin(32, 0.7);
          remainingPulseFrames -= 1;
        } else {
          analyser.clear();
        }
        bus.update(timeSeconds * 1_000);
      }

      expect(Math.abs(bus.frame.periodicityBpm - bpm)).toBeLessThan(3);
      expect(bus.frame.periodicityEvidence).toBeGreaterThan(0.5);
      expect(bus.frame.transientCandidateCount).toBeGreaterThanOrEqual(4);
    },
  );

  it("does not expose periodicity for a sustained stationary spectrum", () => {
    const analyser = new FakeAnalyser();
    const bus = createBus(analyser, { attackMs: 35, releaseMs: 220 });
    bus.update(0);
    analyser.setSine(512, 0.7);
    let maximumCandidateCount = 0;
    let maximumBpm = 0;
    let maximumEvidence = 0;

    for (let frame = 1; frame <= 500; frame += 1) {
      const result = bus.update(frame * 20);
      maximumCandidateCount = Math.max(maximumCandidateCount, result.transientCandidateCount);
      maximumBpm = Math.max(maximumBpm, result.periodicityBpm);
      maximumEvidence = Math.max(maximumEvidence, result.periodicityEvidence);
    }

    expect(maximumCandidateCount).toBeLessThanOrEqual(1);
    expect(maximumBpm).toBe(0);
    expect(maximumEvidence).toBe(0);
  });
});

describe("AudioFeatureBus lifecycle and silence", () => {
  it("keeps frame and array identities stable, then resets all dynamic state", () => {
    const analyser = new FakeAnalyser();
    const bus = createBus(analyser);
    analyser.setSine(32, 0.5);
    const frame = bus.update(0);
    const identities = {
      waveform: frame.waveform,
      spectrum: frame.spectrum,
      bands: frame.bands,
      chroma: frame.chroma,
      selfSimilarity: frame.selfSimilarity,
    };
    bus.update(20);

    expect(bus.frame).toBe(frame);
    expect(bus.frame.waveform).toBe(identities.waveform);
    expect(bus.frame.spectrum).toBe(identities.spectrum);
    expect(bus.frame.bands).toBe(identities.bands);
    expect(bus.frame.chroma).toBe(identities.chroma);
    expect(bus.frame.selfSimilarity).toBe(identities.selfSimilarity);

    bus.reset();
    expect(bus.frame.sequence).toBe(0);
    expect(bus.frame.rmsRaw).toBe(0);
    expect(bus.frame.levelDbFs).toBe(-100);
    expect(bus.frame.dominantChroma).toBe(-1);
    expect(bus.frame.selfSimilarityHead).toBe(-1);
    expect(bus.frame.selfSimilarityCount).toBe(0);
    expect(bus.frame.transientCandidateCount).toBe(0);
    expect(Array.from(bus.frame.waveform).every((value) => value === 0)).toBe(true);
    expect(Array.from(bus.frame.selfSimilarity).every((value) => value === 0)).toBe(true);
  });

  it("reports silence without manufacturing spectral or tonal evidence", () => {
    const bus = createBus(new FakeAnalyser());
    bus.update(0);
    const frame = bus.update(500);

    expect(frame.isSilent).toBe(true);
    expect(frame.rmsRaw).toBe(0);
    expect(frame.levelDbFs).toBe(-100);
    expect(frame.spectralCentroidHz).toBe(0);
    expect(frame.highFrequencyRatio).toBe(0);
    expect(frame.onsetStrength).toBe(0);
    expect(frame.periodicityEvidence).toBe(0);
    expect(frame.dominantChroma).toBe(-1);
    expect(frame.recurrence).toBe(0);
  });
});
