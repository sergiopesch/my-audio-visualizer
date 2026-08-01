import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SAMPLE_RATE = 48_000;
const DEFAULT_OUTPUT = "output/science-fixtures";
const CHECK_MODE = process.argv.includes("--check");
const outputArgument = process.argv.slice(2).find((argument) => argument !== "--check");
const outputDirectory = CHECK_MODE
  ? mkdtempSync(join(tmpdir(), "av01-science-fixtures-"))
  : resolve(outputArgument ?? DEFAULT_OUTPUT);
const fixtures = [];

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function edgeFade(timeSeconds, durationSeconds, fadeSeconds = 0.02) {
  return Math.min(
    1,
    Math.max(0, timeSeconds / fadeSeconds),
    Math.max(0, (durationSeconds - timeSeconds) / fadeSeconds),
  );
}

function encodeMonoPcm16(samples) {
  const headerSize = 44;
  const bytes = Buffer.allocUnsafe(headerSize + samples.length * 2);
  const dataSize = samples.length * 2;
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SAMPLE_RATE, 24);
  bytes.writeUInt32LE(SAMPLE_RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = clampSample(samples[index]);
    const integer = sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767);
    bytes.writeInt16LE(integer, headerSize + index * 2);
  }
  return bytes;
}

function synthesize(durationSeconds, sampleAtTime) {
  const sampleCount = Math.round(durationSeconds * SAMPLE_RATE);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = clampSample(sampleAtTime(index / SAMPLE_RATE, index));
  }
  return samples;
}

function writeFixture(name, samples, specification, expected) {
  const wav = encodeMonoPcm16(samples);
  const fileName = `${name}.wav`;
  writeFileSync(resolve(outputDirectory, fileName), wav);
  fixtures.push({
    file: fileName,
    sha256: createHash("sha256").update(wav).digest("hex"),
    sampleRate: SAMPLE_RATE,
    channels: 1,
    sampleFormat: "PCM16LE",
    durationSeconds: samples.length / SAMPLE_RATE,
    specification,
    expected,
  });
}

function sineFixture(name, frequencyHz, amplitude = 0.353553, polarity = 1) {
  const durationSeconds = 4;
  const samples = synthesize(durationSeconds, (timeSeconds) =>
    polarity *
    amplitude *
    edgeFade(timeSeconds, durationSeconds) *
    Math.sin(2 * Math.PI * frequencyHz * timeSeconds));
  writeFixture(
    name,
    samples,
    `x(t) = ${polarity < 0 ? "-" : ""}${amplitude} sin(2π·${frequencyHz}·t), 20 ms edge fades`,
    {
      frequencyHz,
      rmsInterior: amplitude / Math.sqrt(2),
      crestFactorInterior: Math.sqrt(2),
      pitchClass: frequencyHz === 220 || frequencyHz === 440 ? "A" : undefined,
    },
  );
}

function clickTrain(name, eventTimesSeconds) {
  const durationSeconds = 8;
  const samples = synthesize(durationSeconds, (timeSeconds) => {
    let value = 0;
    for (const eventTime of eventTimesSeconds) {
      const age = timeSeconds - eventTime;
      if (age < 0 || age > 0.06) continue;
      const envelope = Math.exp(-age * 75);
      value += envelope * (
        0.34 * Math.sin(2 * Math.PI * 880 * age) +
        0.22 * Math.sin(2 * Math.PI * 3_520 * age)
      );
    }
    return value;
  });
  writeFixture(
    name,
    samples,
    "60 ms dual-sine exponential transients at the declared event times",
    { eventTimesSeconds },
  );
}

const motifFrequencies = {
  A: [187.5, 375],
  B: [750, 1_500],
  C: [3_000, 6_000],
  D: [9_000, 14_000],
};

function motifSequence(name, sections) {
  const sectionSeconds = 2;
  const durationSeconds = sections.length * sectionSeconds;
  const samples = synthesize(durationSeconds, (timeSeconds) => {
    const sectionIndex = Math.min(sections.length - 1, Math.floor(timeSeconds / sectionSeconds));
    const section = sections[sectionIndex];
    const localTime = timeSeconds - sectionIndex * sectionSeconds;
    const frequencies = motifFrequencies[section.label];
    const fade = edgeFade(localTime, sectionSeconds, 0.04);
    let value = 0;
    for (let index = 0; index < frequencies.length; index += 1) {
      value += Math.sin(2 * Math.PI * frequencies[index] * timeSeconds + index * 0.31);
    }
    return (value / frequencies.length) * section.amplitude * fade;
  });
  writeFixture(
    name,
    samples,
    "Two-second two-tone spectral-shape sections with 40 ms boundary fades",
    { spectralShapesHz: motifFrequencies, sections, sectionSeconds },
  );
}

mkdirSync(outputDirectory, { recursive: true });

sineFixture("tone-375hz-rms025", 375);
sineFixture("tone-6000hz-rms025", 6_000);
sineFixture("tone-a3-220hz", 220, 0.32);
sineFixture("tone-a4-440hz", 440, 0.32);
sineFixture("tone-375hz-inverted", 375, 0.353553, -1);

const periodicEvents = Array.from({ length: 15 }, (_, index) => 0.5 + index * 0.5);
const jitterPattern = [0, 0.14, -0.11, 0.19, -0.17, 0.08, -0.2, 0.12, -0.06, 0.18, -0.15, 0.04, 0.21, -0.12, 0.09];
clickTrain("pulses-120bpm-equivalent", periodicEvents);
clickTrain(
  "pulses-aperiodic-control",
  periodicEvents.map((time, index) => time + jitterPattern[index]),
);

motifSequence("motif-a-b-a-c", [
  { label: "A", amplitude: 0.5 },
  { label: "B", amplitude: 0.5 },
  { label: "A", amplitude: 0.28 },
  { label: "C", amplitude: 0.5 },
]);
motifSequence("motif-a-b-c-d-control", [
  { label: "A", amplitude: 0.5 },
  { label: "B", amplitude: 0.5 },
  { label: "C", amplitude: 0.5 },
  { label: "D", amplitude: 0.5 },
]);

const manifest = {
  schemaVersion: 1,
  generator: "scripts/generate-science-fixtures.mjs",
  deterministic: true,
  purpose: "Browser-path demonstration evidence; numerical unit tests remain the signal-analysis oracle.",
  fixtures,
};
writeFileSync(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

if (CHECK_MODE) {
  const validation = readFileSync(resolve("docs/VALIDATION.md"), "utf8");
  const problems = [];
  for (const fixture of fixtures) {
    const escapedFile = fixture.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const documented = validation.match(
      new RegExp("\\| `" + escapedFile + "` \\| `([a-f0-9]{64})` \\|"),
    )?.[1];
    if (!documented) problems.push(`${fixture.file}: missing from docs/VALIDATION.md`);
    else if (documented !== fixture.sha256) {
      problems.push(`${fixture.file}: generated ${fixture.sha256}, documented ${documented}`);
    }
  }
  rmSync(outputDirectory, { recursive: true, force: true });
  if (problems.length > 0) {
    throw new Error(`Science fixture verification failed:\n${problems.join("\n")}`);
  }
  console.log(`Verified ${fixtures.length} deterministic fixture hashes against docs/VALIDATION.md`);
} else {
  console.log(`Generated ${fixtures.length} deterministic fixtures in ${outputDirectory}`);
}
