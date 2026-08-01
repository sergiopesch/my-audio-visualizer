import type { FeatureFrame } from "@/lib/audio";

export type SceneId = "field" | "orbit" | "trace" | "lattice" | "contour";

export type OpticalSystemId = "electric";

export type AspectId = "landscape" | "square" | "portrait";

export interface VisualSettings {
  scene: SceneId;
  opticalSystem: OpticalSystemId;
  aspect: AspectId;
  intensity: number;
  bloom: number;
  detail: number;
  sensitivity: number;
  highlightCompression: boolean;
  seed: number;
}

export interface SceneDefinition {
  id: SceneId;
  index: number;
  claimId: `AV01-SCI-00${1 | 2 | 3 | 4 | 5}`;
  name: string;
  shortName: string;
  description: string;
  mapping: string;
  /** The signal representation shown by this scene, stated without inference. */
  representation: string;
  /** The narrow analytical question this representation can answer. */
  question: string;
  /** The strongest claim the scene deliberately does not make. */
  limitation: string;
  /** FeatureFrame fields that are evidence for this scene. */
  primaryFeatures: readonly (keyof FeatureFrame)[];
  /** Stable source IDs resolved in the science documentation. */
  evidence: readonly string[];
}

export interface OpticalSystemDefinition {
  id: OpticalSystemId;
  name: string;
  background: readonly [number, number, number];
  primary: readonly [number, number, number];
  secondary: readonly [number, number, number];
  accent: readonly [number, number, number];
  css: readonly [string, string, string];
}

export interface AspectDefinition {
  id: AspectId;
  label: string;
  ratio: string;
  width: number;
  height: number;
}

export const SCENES: readonly SceneDefinition[] = [
  {
    id: "field",
    index: 0,
    claimId: "AV01-SCI-001",
    name: "Auditory Field",
    shortName: "Field",
    description: "A current spectrum grouped into 24 ERB-rate-spaced triangular regions.",
    mapping: "24 ERB bands form the field · centroid and rolloff remain explicit markers",
    representation: "ERB-spaced short-time RMS-like spectral magnitude",
    question: "How does RMS-like spectral magnitude vary across ERB-rate-spaced regions now?",
    limitation: "It is not a source separator, instrument detector, or model of hearing loss.",
    primaryFeatures: [
      "bands",
      "spectralCentroidHz",
      "spectralRolloffHz",
      "highFrequencyRatio",
    ],
    evidence: ["allen-rabiner-1977", "glasberg-moore-1990", "peeters-2004"],
  },
  {
    id: "orbit",
    index: 1,
    claimId: "AV01-SCI-002",
    name: "Tonal Orbit",
    shortName: "Orbit",
    description: "Octave-folded pitch-class energy arranged as twelve fixed sectors.",
    mapping: "12 chroma bins set sector radii · concentration and strongest class are annotated",
    representation: "Twelve-bin chroma (octave-folded pitch-class energy)",
    question: "How concentrated is spectral energy among the twelve pitch classes?",
    limitation: "It does not identify a played note, chord, key, tuning, or octave.",
    primaryFeatures: ["chroma", "chromaConcentration", "dominantChroma"],
    evidence: ["bartsch-wakefield-2001", "gomez-2006"],
  },
  {
    id: "trace",
    index: 2,
    claimId: "AV01-SCI-003",
    name: "Temporal Scope",
    shortName: "Trace",
    description: "A direct view of the recent mono time-domain signal and level descriptors.",
    mapping: "Samples draw the trace · RMS and peak set rails · crest and zero crossings set gauges",
    representation: "Recent mono waveform with RMS, peak, crest factor, and zero-crossing rate",
    question: "How is amplitude changing within the current analysis window?",
    limitation: "It is not calibrated SPL, LUFS, stereo phase, or an analog oscilloscope measurement.",
    primaryFeatures: ["waveform", "rms", "peak", "crestFactor", "zeroCrossingRate"],
    evidence: ["peeters-2004", "w3c-webaudio-1.1"],
  },
  {
    id: "lattice",
    index: 3,
    claimId: "AV01-SCI-004",
    name: "Rhythm Lattice",
    shortName: "Lattice",
    description: "Onset change and short-term periodicity shown with a heuristic evidence score.",
    mapping: "Onset strength excites the core · phase advances the lattice · evidence limits visibility",
    representation: "Spectral-change onset strength with short-term autocorrelation periodicity",
    question: "Is the recent onset envelope repeating at a plausible pulse period?",
    limitation: "It does not assert a beat, downbeat, musical tempo, meter, or groove; vibrato and noise can create candidates, while soft onsets can be missed.",
    primaryFeatures: [
      "onsetStrength",
      "periodicityBpm",
      "periodicityEvidence",
      "pulsePhase",
      "rhythmEvidenceSeconds",
      "transientCandidateCount",
    ],
    evidence: ["bello-2005", "dixon-2006", "scheirer-1998"],
  },
  {
    id: "contour",
    index: 4,
    claimId: "AV01-SCI-005",
    name: "Recurrence Atlas",
    shortName: "Contour",
    description: "A rolling self-similarity matrix of normalized auditory spectral shape.",
    mapping: "Time runs on both axes · brighter cells are more similar · non-flat shapes identify with themselves on the diagonal",
    representation: "Cosine self-similarity of level-normalized log ERB-band vectors",
    question: "When has the recent spectral shape resembled another recent moment?",
    limitation: "It does not identify song sections, motifs, sources, or structural boundaries.",
    primaryFeatures: [
      "selfSimilarity",
      "selfSimilaritySize",
      "selfSimilarityHead",
      "selfSimilarityCount",
      "recurrence",
    ],
    evidence: ["foote-1999", "foote-2000"],
  },
] as const;

export const OPTICAL_SYSTEMS: readonly OpticalSystemDefinition[] = [
  {
    id: "electric",
    name: "Zero / Signal / Reference",
    background: [0, 0, 0],
    primary: [0, 140 / 255, 1],
    secondary: [1, 1, 1],
    accent: [1, 1, 1],
    css: ["#008CFF", "#FFFFFF", "#FFFFFF"],
  },
] as const;

export const ASPECTS: readonly AspectDefinition[] = [
  { id: "landscape", label: "Landscape", ratio: "16:9", width: 1280, height: 720 },
  { id: "square", label: "Square", ratio: "1:1", width: 1080, height: 1080 },
  { id: "portrait", label: "Portrait", ratio: "9:16", width: 720, height: 1280 },
] as const;

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  scene: "field",
  opticalSystem: "electric",
  aspect: "landscape",
  intensity: 0.78,
  bloom: 0.58,
  detail: 0.7,
  sensitivity: 1,
  highlightCompression: true,
  seed: 17,
};

export function findScene(id: SceneId): SceneDefinition {
  return SCENES.find((scene) => scene.id === id) ?? SCENES[0];
}

export function findOpticalSystem(id: OpticalSystemId): OpticalSystemDefinition {
  return OPTICAL_SYSTEMS.find((opticalSystem) => opticalSystem.id === id)
    ?? OPTICAL_SYSTEMS[0];
}

export function findAspect(id: AspectId): AspectDefinition {
  return ASPECTS.find((aspect) => aspect.id === id) ?? ASPECTS[0];
}
