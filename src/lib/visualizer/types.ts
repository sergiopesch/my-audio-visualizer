export type SceneId = "field" | "orbit" | "trace" | "lattice" | "contour";

export type PaletteId = "voltage" | "solar" | "tidal" | "infrared";

export type AspectId = "landscape" | "square" | "portrait";

export interface VisualSettings {
  scene: SceneId;
  palette: PaletteId;
  aspect: AspectId;
  intensity: number;
  motion: number;
  bloom: number;
  detail: number;
  sensitivity: number;
  flashSafe: boolean;
  seed: number;
}

export interface SceneDefinition {
  id: SceneId;
  index: number;
  name: string;
  shortName: string;
  description: string;
  mapping: string;
}

export interface PaletteDefinition {
  id: PaletteId;
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
    name: "Spectral Field",
    shortName: "Field",
    description: "A liquid light-field carved by timbre and dynamics.",
    mapping: "Bass bends space · mids form ribbons · air reveals grain",
  },
  {
    id: "orbit",
    index: 1,
    name: "Orbital Bloom",
    shortName: "Orbit",
    description: "A frequency mandala with transient-driven shockwaves.",
    mapping: "24 bands shape the bloom · attacks launch rings",
  },
  {
    id: "trace",
    index: 2,
    name: "Signal Trace",
    shortName: "Trace",
    description: "An oscilloscope transformed into a luminous sculpture.",
    mapping: "Waveform draws form · crest controls depth · flux leaves echoes",
  },
  {
    id: "lattice",
    index: 3,
    name: "Pulse Lattice",
    shortName: "Lattice",
    description: "The original pixel ripple, rebuilt with real spectral detail.",
    mapping: "Bands illuminate cells · bass expands · treble fractures edges",
  },
  {
    id: "contour",
    index: 4,
    name: "Contour Memory",
    shortName: "Contour",
    description: "Topographic signal lines that breathe with the track.",
    mapping: "Energy raises terrain · brightness shifts elevation · beats ripple",
  },
] as const;

export const PALETTES: readonly PaletteDefinition[] = [
  {
    id: "voltage",
    name: "Voltage",
    background: [0.012, 0.02, 0.025],
    primary: [0.78, 1, 0.26],
    secondary: [0.08, 0.82, 0.72],
    accent: [1, 0.28, 0.12],
    css: ["#c8ff43", "#14d1b8", "#ff471f"],
  },
  {
    id: "solar",
    name: "Solar",
    background: [0.025, 0.014, 0.01],
    primary: [1, 0.84, 0.38],
    secondary: [1, 0.27, 0.08],
    accent: [1, 0.96, 0.78],
    css: ["#ffd661", "#ff4514", "#fff5c7"],
  },
  {
    id: "tidal",
    name: "Tidal",
    background: [0.008, 0.018, 0.035],
    primary: [0.16, 0.75, 1],
    secondary: [0.26, 1, 0.73],
    accent: [0.78, 0.66, 1],
    css: ["#29bfff", "#42ffba", "#c7a8ff"],
  },
  {
    id: "infrared",
    name: "Infrared",
    background: [0.022, 0.008, 0.014],
    primary: [1, 0.1, 0.28],
    secondary: [1, 0.38, 0.08],
    accent: [0.96, 0.72, 0.78],
    css: ["#ff1a47", "#ff6114", "#f5b8c7"],
  },
] as const;

export const ASPECTS: readonly AspectDefinition[] = [
  { id: "landscape", label: "Landscape", ratio: "16:9", width: 1280, height: 720 },
  { id: "square", label: "Square", ratio: "1:1", width: 1080, height: 1080 },
  { id: "portrait", label: "Portrait", ratio: "9:16", width: 720, height: 1280 },
] as const;

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  scene: "field",
  palette: "voltage",
  aspect: "landscape",
  intensity: 0.78,
  motion: 0.62,
  bloom: 0.58,
  detail: 0.7,
  sensitivity: 1,
  flashSafe: true,
  seed: 17,
};

export function findScene(id: SceneId): SceneDefinition {
  return SCENES.find((scene) => scene.id === id) ?? SCENES[0];
}

export function findPalette(id: PaletteId): PaletteDefinition {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}

export function findAspect(id: AspectId): AspectDefinition {
  return ASPECTS.find((aspect) => aspect.id === id) ?? ASPECTS[0];
}
