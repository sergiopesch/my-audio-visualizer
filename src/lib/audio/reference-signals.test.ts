import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { findScene } from "../visualizer/types";
import {
  REFERENCE_SIGNALS,
  createReferenceSignalFile,
  type ReferenceSignalId,
} from "./reference-signals";

const referenceFileCache = new Map<ReferenceSignalId, File>();

function referenceFile(id: ReferenceSignalId): File {
  const cached = referenceFileCache.get(id);
  if (cached) return cached;
  const file = createReferenceSignalFile(id);
  referenceFileCache.set(id, file);
  return file;
}

function ascii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, index) =>
    String.fromCharCode(view.getUint8(offset + index))).join("");
}

async function decodePcm(id: Parameters<typeof createReferenceSignalFile>[0]): Promise<Float32Array> {
  const buffer = await referenceFile(id).arrayBuffer();
  const view = new DataView(buffer);
  const samples = new Float32Array((buffer.byteLength - 44) / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(44 + index * 2, true) / 32_768;
  }
  return samples;
}

function segment(
  samples: Float32Array,
  startSeconds: number,
  endSeconds: number,
): Float32Array {
  return samples.slice(Math.round(startSeconds * 48_000), Math.round(endSeconds * 48_000));
}

function rms(samples: Float32Array): number {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  return Math.sqrt(energy / Math.max(1, samples.length));
}

function peak(samples: Float32Array): number {
  let maximum = 0;
  for (const sample of samples) maximum = Math.max(maximum, Math.abs(sample));
  return maximum;
}

function correlation(first: Float32Array, second: Float32Array): number {
  const count = Math.min(first.length, second.length);
  let dot = 0;
  let firstEnergy = 0;
  let secondEnergy = 0;
  for (let index = 0; index < count; index += 1) {
    dot += first[index] * second[index];
    firstEnergy += first[index] ** 2;
    secondEnergy += second[index] ** 2;
  }
  return dot / Math.sqrt(firstEnergy * secondEnergy);
}

describe("built-in reference signals", () => {
  it("covers every scientific scene exactly once", () => {
    expect(REFERENCE_SIGNALS.map((signal) => signal.scene)).toEqual([
      "field",
      "orbit",
      "trace",
      "lattice",
      "contour",
    ]);
    expect(new Set(REFERENCE_SIGNALS.map((signal) => signal.claimId)).size).toBe(5);
    for (const signal of REFERENCE_SIGNALS) {
      const scene = findScene(signal.scene);
      expect(signal.index).toBe(scene.index);
      expect(signal.claimId).toBe(scene.claimId);
    }
  });

  it.each(REFERENCE_SIGNALS)("encodes $name as deterministic mono PCM16", async (signal) => {
    const file = referenceFile(signal.id);
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const expectedSamples = signal.durationSeconds * 48_000;

    expect(file.name).toBe(signal.fileName);
    expect(file.type).toBe("audio/wav");
    expect(file.lastModified).toBe(0);
    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(expectedSamples * 2);
    expect(buffer.byteLength).toBe(44 + expectedSamples * 2);
    expect(createHash("sha256").update(new Uint8Array(buffer)).digest("hex")).toBe(signal.sha256);
  });

  it(
    "produces identical bytes for repeated synthesis",
    { timeout: 15_000 },
    async () => {
      const first = new Uint8Array(await referenceFile("periodicity").arrayBuffer());
      const second = new Uint8Array(await createReferenceSignalFile("periodicity").arrayBuffer());
      expect(first).toEqual(second);
    },
  );

  it("holds RMS nearly constant while the spectrum changes register", async () => {
    const samples = await decodePcm("spectrum");
    const low = segment(samples, 0.1, 1.4);
    const high = segment(samples, 1.6, 2.9);
    expect(rms(low)).toBeCloseTo(rms(high), 5);
    expect(peak(low)).toBeCloseTo(peak(high), 5);
  });

  it("holds level constant across the A3 and A4 octave pair", async () => {
    const samples = await decodePcm("pitch-class");
    const a3 = segment(samples, 0.1, 1.4);
    const a4 = segment(samples, 1.6, 2.9);
    expect(rms(a3)).toBeCloseTo(rms(a4), 5);
    expect(peak(a3)).toBeCloseTo(peak(a4), 5);
  });

  it("holds peak constant while producing three distinct crest factors", async () => {
    const samples = await decodePcm("wave-shape");
    const shapes = [
      segment(samples, 0.1, 1.9),
      segment(samples, 2.1, 3.9),
      segment(samples, 4.1, 5.9),
    ];
    const peaks = shapes.map(peak);
    const crestFactors = shapes.map((shape, index) => peaks[index] / rms(shape));
    expect(peaks[0]).toBeCloseTo(peaks[1], 5);
    expect(peaks[1]).toBeCloseTo(peaks[2], 5);
    expect(crestFactors[0]).toBeCloseTo(Math.SQRT2, 3);
    expect(crestFactors[1]).toBeCloseTo(Math.sqrt(3), 3);
    expect(crestFactors[2]).toBeLessThan(1.2);
  });

  it("places fifteen separated transients on a 0.5 second grid", async () => {
    const samples = await decodePcm("periodicity");
    const eventStarts: number[] = [];
    let insideEvent = false;
    let quietSamples = 48_000;
    for (let index = 0; index < samples.length; index += 1) {
      const active = Math.abs(samples[index]) > 0.02;
      if (active && !insideEvent && quietSamples > 4_000) {
        eventStarts.push(index / 48_000);
        insideEvent = true;
      }
      if (active) quietSamples = 0;
      else quietSamples += 1;
      if (insideEvent && quietSamples > 2_000) insideEvent = false;
    }
    expect(eventStarts).toHaveLength(15);
    for (let index = 1; index < eventStarts.length; index += 1) {
      expect(eventStarts[index] - eventStarts[index - 1]).toBeCloseTo(0.5, 3);
    }
  });

  it("repeats spectral shape A at a lower gain before changing to C", async () => {
    const samples = await decodePcm("recurrence");
    const firstA = segment(samples, 0.1, 1.9);
    const secondA = segment(samples, 4.1, 5.9);
    const c = segment(samples, 6.1, 7.9);
    expect(correlation(firstA, secondA)).toBeGreaterThan(0.999);
    expect(rms(secondA) / rms(firstA)).toBeCloseTo(0.56, 2);
    expect(Math.abs(correlation(firstA, c))).toBeLessThan(0.01);
  });
});
