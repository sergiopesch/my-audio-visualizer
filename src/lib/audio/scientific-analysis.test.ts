import { describe, expect, it } from "vitest";

import {
  RHYTHM_SAMPLE_RATE_HZ,
  RHYTHM_TRANSIENT_REARM,
  SELF_SIMILARITY_SIZE,
  RhythmPeriodicityTracker,
  SelfSimilarityTracker,
  erbRateToHz,
  fillScalePoints,
  hzToErbRate,
  normalizedEntropyConcentration,
  pitchClassForFrequency,
} from "./scientific-analysis";

function feedPeriodicRhythm(
  bpm: number,
  pulseWidthFrames: number,
): ReturnType<RhythmPeriodicityTracker["update"]> {
  const tracker = new RhythmPeriodicityTracker();
  const intervalSeconds = 1 / RHYTHM_SAMPLE_RATE_HZ;
  const periodSeconds = 60 / bpm;
  let nextPulseSeconds = 0;
  let remainingPulseFrames = 0;
  let smoothedOnset = 0;
  let estimate = tracker.update(0, 0, 0);

  for (let sample = 0; sample < RHYTHM_SAMPLE_RATE_HZ * 10; sample += 1) {
    const timeSeconds = sample * intervalSeconds;
    if (timeSeconds + intervalSeconds * 0.5 >= nextPulseSeconds) {
      nextPulseSeconds += periodSeconds;
      remainingPulseFrames = pulseWidthFrames;
    }
    const rawOnset = remainingPulseFrames > 0 ? 1 : 0;
    remainingPulseFrames = Math.max(0, remainingPulseFrames - 1);
    const timeConstant = rawOnset > smoothedOnset ? 0.035 : 0.22;
    smoothedOnset +=
      (rawOnset - smoothedOnset) * (1 - Math.exp(-intervalSeconds / timeConstant));
    estimate = tracker.update(smoothedOnset, intervalSeconds, rawOnset);
  }

  return estimate;
}

describe("auditory scale helpers", () => {
  it("round-trips the Glasberg-Moore ERB-rate transform", () => {
    for (const frequencyHz of [0, 30, 100, 1_000, 8_000, 20_000]) {
      expect(erbRateToHz(hzToErbRate(frequencyHz))).toBeCloseTo(frequencyHz, 8);
    }
  });

  it("produces increasing ERB-spaced filters whose Hz bandwidth grows with frequency", () => {
    const points = new Float32Array(26);
    fillScalePoints(points, "erb", 30, 20_000);

    for (let index = 1; index < points.length; index += 1) {
      expect(points[index]).toBeGreaterThan(points[index - 1]);
    }

    const lowWidth = points[2] - points[0];
    const middleWidth = points[14] - points[12];
    const highWidth = points[25] - points[23];
    expect(middleWidth).toBeGreaterThan(lowWidth);
    expect(highWidth).toBeGreaterThan(middleWidth);
  });

  it("maps octaves to the same pitch class and semitones one class apart", () => {
    expect(pitchClassForFrequency(220)).toBeCloseTo(9, 10);
    expect(pitchClassForFrequency(440)).toBeCloseTo(9, 10);
    expect(pitchClassForFrequency(880)).toBeCloseTo(9, 10);
    expect(pitchClassForFrequency(440 * 2 ** (1 / 12))).toBeCloseTo(10, 10);
  });

  it("reports entropy concentration only for non-uniform distributions", () => {
    const uniform = new Float32Array(12).fill(1 / 12);
    const concentrated = new Float32Array(12);
    concentrated[9] = 1;

    expect(normalizedEntropyConcentration(uniform)).toBeCloseTo(0, 6);
    expect(normalizedEntropyConcentration(concentrated)).toBeCloseTo(1, 6);
    expect(normalizedEntropyConcentration(new Float32Array(12))).toBe(0);
  });
});

describe("short-term rhythm periodicity", () => {
  it.each([
    { bpm: 90, pulseWidthFrames: 5, minimumEvidence: 0.55 },
    { bpm: 120, pulseWidthFrames: 5, minimumEvidence: 0.7 },
    { bpm: 180, pulseWidthFrames: 2, minimumEvidence: 0.55 },
    { bpm: 200, pulseWidthFrames: 1, minimumEvidence: 0.5 },
  ])("recovers a $bpm BPM-equivalent periodic pulse after production onset smoothing", ({
    bpm,
    pulseWidthFrames,
    minimumEvidence,
  }) => {
    const estimate = feedPeriodicRhythm(bpm, pulseWidthFrames);

    expect(Math.abs(estimate.periodicityBpm - bpm)).toBeLessThan(3);
    expect(estimate.periodicityEvidence).toBeGreaterThan(minimumEvidence);
    expect(estimate.evidenceSeconds).toBeCloseTo(8, 1);
    expect(estimate.transientCandidateCount).toBeGreaterThanOrEqual(4);
    expect(estimate.pulsePhase).toBeGreaterThanOrEqual(0);
    expect(estimate.pulsePhase).toBeLessThan(1);
  });

  it("assigns much less evidence to an aperiodic impulse sequence", () => {
    const periodic = feedPeriodicRhythm(120, 5);
    const tracker = new RhythmPeriodicityTracker();
    let randomState = 0x5f3759df;
    let estimate = tracker.update(0, 0);

    for (let sample = 0; sample < RHYTHM_SAMPLE_RATE_HZ * 10; sample += 1) {
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
      const isImpulse = randomState / 0x1_0000_0000 < 0.04;
      estimate = tracker.update(isImpulse ? 1 : 0, 1 / RHYTHM_SAMPLE_RATE_HZ);
    }

    expect(estimate.periodicityEvidence).toBeLessThan(
      periodic.periodicityEvidence * 0.5,
    );
  });

  it("does not invent periodicity from a constant envelope", () => {
    const tracker = new RhythmPeriodicityTracker();
    let estimate = tracker.update(0, 0);
    for (let sample = 0; sample < RHYTHM_SAMPLE_RATE_HZ * 8; sample += 1) {
      estimate = tracker.update(0.2, 1 / RHYTHM_SAMPLE_RATE_HZ);
    }

    expect(estimate.periodicityBpm).toBe(0);
    expect(estimate.periodicitySeconds).toBe(0);
    expect(estimate.periodicityEvidence).toBe(0);
    expect(estimate.transientCandidateCount).toBe(0);
  });

  it("rejects periodic sub-threshold modulation without transient candidates", () => {
    const tracker = new RhythmPeriodicityTracker();
    let estimate = tracker.update(0, 0);
    for (let sample = 0; sample < RHYTHM_SAMPLE_RATE_HZ * 8; sample += 1) {
      const phase = (sample / RHYTHM_SAMPLE_RATE_HZ) * Math.PI * 4;
      estimate = tracker.update(0.12 + Math.sin(phase) * 0.06, 1 / RHYTHM_SAMPLE_RATE_HZ);
    }

    expect(estimate.transientCandidateCount).toBe(0);
    expect(estimate.periodicityBpm).toBe(0);
    expect(estimate.periodicitySeconds).toBe(0);
    expect(estimate.periodicityEvidence).toBe(0);
  });

  it("counts one smooth attack once and rejects its periodic sub-threshold tail", () => {
    const tracker = new RhythmPeriodicityTracker();
    const intervalSeconds = 1 / RHYTHM_SAMPLE_RATE_HZ;
    let estimate = tracker.update(0, 0);

    for (const onset of [0.18, 0.435, 0.681, 0.82, 0.898, 0.72, 0.46, 0.22]) {
      estimate = tracker.update(onset, intervalSeconds);
    }
    expect(estimate.transientCandidateCount).toBe(1);

    for (let sample = 0; sample < RHYTHM_SAMPLE_RATE_HZ * 7.5; sample += 1) {
      const phase = (sample / RHYTHM_SAMPLE_RATE_HZ) * Math.PI * 4;
      estimate = tracker.update(0.12 + Math.sin(phase) * 0.06, intervalSeconds);
    }

    expect(estimate.transientCandidateCount).toBe(1);
    expect(estimate.periodicityBpm).toBe(0);
    expect(estimate.periodicitySeconds).toBe(0);
    expect(estimate.periodicityEvidence).toBe(0);
  });

  it("re-arms only after the onset envelope falls below the hysteresis floor", () => {
    const tracker = new RhythmPeriodicityTracker();
    const intervalSeconds = 1 / RHYTHM_SAMPLE_RATE_HZ;
    tracker.update(0, 0);

    tracker.update(0.4, intervalSeconds);
    tracker.update(0.2, intervalSeconds);
    let estimate = tracker.update(0.5, intervalSeconds);
    expect(estimate.transientCandidateCount).toBe(1);

    tracker.update(RHYTHM_TRANSIENT_REARM, intervalSeconds);
    estimate = tracker.update(0.5, intervalSeconds);
    expect(estimate.transientCandidateCount).toBe(2);
  });
});

describe("rolling auditory self-similarity", () => {
  it("recognizes a gain-invariant A-B-A recurrence without conflating B", () => {
    const tracker = new SelfSimilarityTracker(6, 1);
    const patternA = Float32Array.from([1, 0.5, 0.2, 0.05, 0.01, 0]);
    const patternB = Float32Array.from([0, 0.01, 0.05, 0.2, 0.5, 1]);
    const quieterA = Float32Array.from(patternA, (value) => value * 0.17);

    tracker.update(patternA);
    tracker.update(patternB);
    const repeated = tracker.update(quieterA);

    expect(tracker.matrix[SELF_SIMILARITY_SIZE]).toBeLessThan(0.05);
    expect(tracker.matrix[2 * SELF_SIMILARITY_SIZE]).toBeCloseTo(1, 5);
    expect(repeated.recurrence).toBeCloseTo(1, 5);
    expect(repeated.count).toBe(3);
  });

  it("summarizes recurrence only beyond the two-second local-continuity zone", () => {
    const tracker = new SelfSimilarityTracker(3);
    const patternA = Float32Array.from([1, 0.1, 0]);
    const patternB = Float32Array.from([0, 0.1, 1]);

    tracker.update(patternA);
    for (let frame = 0; frame < 16; frame += 1) tracker.update(patternB);
    expect(tracker.update(patternA).recurrence).toBeCloseTo(1, 5);

    const localOnly = new SelfSimilarityTracker(3);
    for (let frame = 0; frame < 16; frame += 1) localOnly.update(patternA);
    expect(localOnly.update(patternA).recurrence).toBe(0);
  });

  it("keeps its matrix identity and clears all state on reset", () => {
    const tracker = new SelfSimilarityTracker(3);
    const matrix = tracker.matrix;
    tracker.update(Float32Array.from([1, 0, 0]));
    tracker.update(Float32Array.from([0, 1, 0]));
    tracker.reset();

    expect(tracker.matrix).toBe(matrix);
    expect(Array.from(tracker.matrix).every((value) => value === 0)).toBe(true);
    expect(tracker.update(new Float32Array(3))).toEqual({
      head: 0,
      count: 1,
      recurrence: 0,
    });
  });
});
