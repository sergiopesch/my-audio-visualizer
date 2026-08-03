import type { SceneId } from "../visualizer/types";

export type ReferenceSignalId =
  | "spectrum"
  | "pitch-class"
  | "wave-shape"
  | "periodicity"
  | "recurrence";

export interface ReferenceSignalDefinition {
  readonly id: ReferenceSignalId;
  readonly index: number;
  readonly scene: SceneId;
  readonly claimId: `AV01-SCI-00${1 | 2 | 3 | 4 | 5}`;
  readonly name: string;
  readonly fileName: string;
  readonly durationSeconds: number;
  readonly sha256: string;
  readonly signal: string;
  readonly listenFor: string;
  readonly watchFor: string;
  readonly controlledVariable: string;
}

/**
 * Short, deterministic PCM references designed to isolate the representation
 * owned by each scene. They are demonstrations, not musical examples or
 * external scientific certification.
 */
export const REFERENCE_SIGNALS: readonly ReferenceSignalDefinition[] = [
  {
    id: "spectrum",
    index: 0,
    scene: "field",
    claimId: "AV01-SCI-001",
    name: "Low / high tone",
    fileName: "reference-01-low-high-spectrum.wav",
    durationSeconds: 6,
    sha256: "adeadc7e74b0b480eb1d4e8878d5de62a839ae1676e003c9283e3ee04322f219",
    signal: "375 Hz and 6 kHz sine tones alternate every 1.5 seconds.",
    listenFor: "The pitch jumps between low and high registers.",
    watchFor: "Energy moves across the ERB field; centroid and rolloff follow it.",
    controlledVariable: "Sine amplitude and segment duration remain equal.",
  },
  {
    id: "pitch-class",
    index: 1,
    scene: "orbit",
    claimId: "AV01-SCI-002",
    name: "Same class, one octave apart",
    fileName: "reference-02-a3-a4-pitch-class.wav",
    durationSeconds: 6,
    sha256: "19d58fcae91507a1295c48ab1133f4b89044874918676ccdc601eefc4cc4ba2d",
    signal: "A3 at 220 Hz and A4 at 440 Hz alternate every 1.5 seconds.",
    listenFor: "The register changes; both tones share pitch class A.",
    watchFor: "The strongest pitch class stays near A while the waveform period changes.",
    controlledVariable: "Pitch class, sine amplitude and segment duration remain equal.",
  },
  {
    id: "wave-shape",
    index: 2,
    scene: "trace",
    claimId: "AV01-SCI-003",
    name: "Three wave shapes",
    fileName: "reference-03-wave-shapes.wav",
    durationSeconds: 6,
    sha256: "0aac34404dcc8f18cd18f59961827f71a0f074f349b752d425a9f98fc2cbbd78",
    signal: "A 220 Hz sine, triangle and softly clipped sine play for two seconds each.",
    listenFor: "The timbre becomes progressively more angular.",
    watchFor: "The trace and crest factor change even though frequency and peak stay fixed.",
    controlledVariable: "Fundamental frequency, peak amplitude and segment duration remain equal.",
  },
  {
    id: "periodicity",
    index: 3,
    scene: "lattice",
    claimId: "AV01-SCI-004",
    name: "Periodic pulse train",
    fileName: "reference-04-pulses-120-bpm-equivalent.wav",
    durationSeconds: 8,
    sha256: "5cb0712a452790d298ad26a4337d8b68b4a4642a958915a4d419e22b0884a35f",
    signal: "Fifteen short dual-tone transients recur every 0.5 seconds.",
    listenFor: "A steady two-pulses-per-second pattern.",
    watchFor: "After enough history, a candidate settles near 120 BPM-equivalent.",
    controlledVariable: "Event spectrum, level and spacing remain fixed; the score is not probability.",
  },
  {
    id: "recurrence",
    index: 4,
    scene: "contour",
    claimId: "AV01-SCI-005",
    name: "A–B–A–C sequence",
    fileName: "reference-05-a-b-a-c-recurrence.wav",
    durationSeconds: 8,
    sha256: "bad24113217959364267d999fe134e0fce6a2a16df918e4a08890e0a32b861b6",
    signal: "Four two-second spectral shapes follow A–B–A–C; the second A is quieter.",
    listenFor: "The first spectral colour returns once before a new ending.",
    watchFor: "An off-diagonal match appears when A returns despite its lower level.",
    controlledVariable: "Section length and within-shape frequency ratios remain fixed.",
  },
] as const;

const SAMPLE_RATE = 48_000;
const PCM_HEADER_BYTES = 44;

function clampSample(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function edgeFade(timeSeconds: number, durationSeconds: number, fadeSeconds = 0.02): number {
  return Math.min(
    1,
    Math.max(0, timeSeconds / fadeSeconds),
    Math.max(0, (durationSeconds - timeSeconds) / fadeSeconds),
  );
}

function segmentFade(timeSeconds: number, segmentSeconds: number, fadeSeconds = 0.018): number {
  const localTime = timeSeconds % segmentSeconds;
  return Math.min(
    1,
    Math.max(0, localTime / fadeSeconds),
    Math.max(0, (segmentSeconds - localTime) / fadeSeconds),
  );
}

function sampleSpectrum(timeSeconds: number): number {
  const segmentSeconds = 1.5;
  const segment = Math.floor(timeSeconds / segmentSeconds);
  const frequencyHz = segment % 2 === 0 ? 375 : 6_000;
  return 0.34
    * segmentFade(timeSeconds, segmentSeconds)
    * Math.sin(2 * Math.PI * frequencyHz * timeSeconds);
}

function samplePitchClass(timeSeconds: number): number {
  const segmentSeconds = 1.5;
  const segment = Math.floor(timeSeconds / segmentSeconds);
  const frequencyHz = segment % 2 === 0 ? 220 : 440;
  return 0.34
    * segmentFade(timeSeconds, segmentSeconds)
    * Math.sin(2 * Math.PI * frequencyHz * timeSeconds);
}

function sampleWaveShape(timeSeconds: number): number {
  const frequencyHz = 220;
  const phase = Math.sin(2 * Math.PI * frequencyHz * timeSeconds);
  const segment = Math.min(2, Math.floor(timeSeconds / 2));
  let shape = phase;
  if (segment === 1) shape = (2 / Math.PI) * Math.asin(phase);
  if (segment === 2) shape = Math.tanh(2.4 * phase) / Math.tanh(2.4);
  return 0.34 * segmentFade(timeSeconds, 2) * shape;
}

function samplePulseTrain(timeSeconds: number): number {
  const firstEventSeconds = 0.5;
  const spacingSeconds = 0.5;
  const eventIndex = Math.round((timeSeconds - firstEventSeconds) / spacingSeconds);
  if (eventIndex < 0 || eventIndex >= 15) return 0;
  const eventTime = firstEventSeconds + eventIndex * spacingSeconds;
  const age = timeSeconds - eventTime;
  if (age < 0 || age > 0.06) return 0;
  const envelope = Math.exp(-age * 75);
  return envelope * (
    0.34 * Math.sin(2 * Math.PI * 880 * age)
    + 0.22 * Math.sin(2 * Math.PI * 3_520 * age)
  );
}

const MOTIF_FREQUENCIES = [
  [187.5, 375],
  [750, 1_500],
  [187.5, 375],
  [3_000, 6_000],
] as const;

function sampleRecurrence(timeSeconds: number): number {
  const segmentSeconds = 2;
  const segment = Math.min(3, Math.floor(timeSeconds / segmentSeconds));
  const [firstFrequency, secondFrequency] = MOTIF_FREQUENCIES[segment];
  const amplitude = segment === 2 ? 0.28 : 0.5;
  const fade = segmentFade(timeSeconds, segmentSeconds, 0.04);
  return amplitude * fade * 0.5 * (
    Math.sin(2 * Math.PI * firstFrequency * timeSeconds)
    + Math.sin(2 * Math.PI * secondFrequency * timeSeconds + 0.31)
  );
}

function sampleAtTime(id: ReferenceSignalId, timeSeconds: number): number {
  if (id === "spectrum") return sampleSpectrum(timeSeconds);
  if (id === "pitch-class") return samplePitchClass(timeSeconds);
  if (id === "wave-shape") return sampleWaveShape(timeSeconds);
  if (id === "periodicity") return samplePulseTrain(timeSeconds);
  return sampleRecurrence(timeSeconds);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeReferenceSignal(definition: ReferenceSignalDefinition): ArrayBuffer {
  const sampleCount = Math.round(definition.durationSeconds * SAMPLE_RATE);
  const dataBytes = sampleCount * Int16Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(PCM_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * Int16Array.BYTES_PER_ELEMENT, true);
  view.setUint16(32, Int16Array.BYTES_PER_ELEMENT, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const timeSeconds = index / SAMPLE_RATE;
    const sample = clampSample(
      sampleAtTime(definition.id, timeSeconds)
      * edgeFade(timeSeconds, definition.durationSeconds),
    );
    const integer = sample < 0
      ? Math.round(sample * 32_768)
      : Math.round(sample * 32_767);
    view.setInt16(PCM_HEADER_BYTES + index * 2, integer, true);
  }

  return buffer;
}

export function findReferenceSignal(
  id: ReferenceSignalId,
): ReferenceSignalDefinition {
  return REFERENCE_SIGNALS.find((signal) => signal.id === id) ?? REFERENCE_SIGNALS[0];
}

export function createReferenceSignalFile(id: ReferenceSignalId): File {
  const definition = findReferenceSignal(id);
  return new File(
    [encodeReferenceSignal(definition)],
    definition.fileName,
    { type: "audio/wav", lastModified: 0 },
  );
}
