import { describe, expect, it } from "vitest";
import { SPECTRAL_FRAGMENT_SHADER } from "./shaders";
import { SCENES, type SceneId } from "./types";

const EXPECTED_PRIMARY_FEATURES: Record<SceneId, readonly string[]> = {
  field: [
    "bands",
    "spectralCentroidHz",
    "spectralRolloffHz",
    "highFrequencyRatio",
  ],
  orbit: ["chroma", "chromaConcentration", "dominantChroma"],
  trace: ["waveform", "rms", "peak", "crestFactor", "zeroCrossingRate"],
  lattice: [
    "onsetStrength",
    "periodicityBpm",
    "periodicityEvidence",
    "pulsePhase",
    "rhythmEvidenceSeconds",
    "transientCandidateCount",
  ],
  contour: [
    "selfSimilarity",
    "selfSimilaritySize",
    "selfSimilarityHead",
    "selfSimilarityCount",
    "recurrence",
  ],
};

const SCIENTIFIC_SHADER_TOKENS = [
  "uBands",
  "sampleBand",
  "uChroma",
  "uChromaMeta",
  "sampleChroma",
  "uWave",
  "uTemporal",
  "sampleWave",
  "uSpectral",
  "uRhythm",
  "uRhythmEvidence",
  "uSimilarity",
  "uSimilarityMeta",
  "sampleSimilarity",
] as const;

const ALLOWED_SHADER_TOKENS: Record<SceneId, readonly string[]> = {
  field: ["uBands", "sampleBand", "uSpectral"],
  orbit: ["uChroma", "uChromaMeta", "sampleChroma"],
  trace: ["uWave", "uTemporal", "sampleWave"],
  lattice: ["uRhythm", "uRhythmEvidence"],
  contour: ["uSimilarity", "uSimilarityMeta", "sampleSimilarity"],
};

function shaderSceneBlock(scene: SceneId): string {
  const start = `// scene:${scene}:start`;
  const end = `// scene:${scene}:end`;
  const startIndex = SPECTRAL_FRAGMENT_SHADER.indexOf(start);
  const endIndex = SPECTRAL_FRAGMENT_SHADER.indexOf(end);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return SPECTRAL_FRAGMENT_SHADER.slice(startIndex, endIndex);
}

describe("scientific scene contracts", () => {
  it("assigns one exact and non-overlapping feature family to each scene", () => {
    const claimed = new Set<string>();
    for (const scene of SCENES) {
      expect(scene.primaryFeatures).toEqual(EXPECTED_PRIMARY_FEATURES[scene.id]);
      for (const feature of scene.primaryFeatures) {
        expect(claimed.has(feature), `${feature} is claimed by more than one scene`).toBe(false);
        claimed.add(feature);
      }
    }
  });

  it("gives every scene a stable claim, question, limitation, and evidence trail", () => {
    expect(SCENES.map((scene) => scene.claimId)).toEqual([
      "AV01-SCI-001",
      "AV01-SCI-002",
      "AV01-SCI-003",
      "AV01-SCI-004",
      "AV01-SCI-005",
    ]);
    for (const scene of SCENES) {
      expect(scene.representation.length).toBeGreaterThan(20);
      expect(scene.question.endsWith("?")).toBe(true);
      expect(scene.limitation).toMatch(/^It (is|does) not/);
      expect(scene.evidence.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every shader scene inside its declared evidence channel", () => {
    for (const scene of SCENES) {
      const block = shaderSceneBlock(scene.id);
      const allowed = new Set(ALLOWED_SHADER_TOKENS[scene.id]);
      for (const token of SCIENTIFIC_SHADER_TOKENS) {
        if (!allowed.has(token)) {
          expect(block, `${scene.id} shader must not consume ${token}`).not.toContain(token);
        }
      }
    }
  });

  it("contains no autonomous clock, random grain, or procedural noise", () => {
    expect(SPECTRAL_FRAGMENT_SHADER).not.toContain("uTime");
    expect(SPECTRAL_FRAGMENT_SHADER).not.toMatch(/\b(hash|noise|grain|fbm)\w*\b/i);
  });
});
