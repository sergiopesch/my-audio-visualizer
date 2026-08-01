# Project instructions

## Mission

Build AV/01 as a local-first audio experiment: five real-time visual representations of five declared signal transforms. The interface must show what the browser actually computes, state what each view cannot infer, and never turn presentation into an unsupported scientific claim.

## Non-negotiable contracts

- Every scene owns one declared feature family. Do not reuse an audio feature in another scene merely to make it move.
- No autonomous animation clocks, procedural noise, random grain or decorative motion in measured scenes.
- Keep synthetic preview data explicitly labeled `ILLUSTRATIVE · NOT MEASURED`.
- Percentages are only for real fractions. Heuristic scores, concentration and cosine similarity are unitless indices, never probability or confidence.
- Visual settings alter presentation only. They do not change the underlying analysis and the pixels are not metrological output.
- Keep limitations and provenance visible in the product and complete in `docs/SCIENCE.md`.

## Optical system

Use exactly three source pigments:

- black `#000000` for silence, absence and the stage;
- electric blue `#008CFF` for signal-derived evidence and interaction;
- white `#FFFFFF` for reference geometry, labels and structure.

Tonal hierarchy may use opacity blends of those three only. Do not add alternate palettes, semantic red, rainbow ramps or coordinate-driven hue. State changes must also use text, icons, geometry or line form so colour is never the only cue.

## Architecture

```text
src/app/                         Next.js shell, metadata and design system
src/components/studio/           source, scene, stage, inspector, transport and export UI
src/hooks/                       Web Audio lifecycle and MediaRecorder lifecycle
src/lib/audio/                   fixed feature bus and scientific transforms
src/lib/visualizer/              scene contracts, WebGL shader and Canvas fallback
tests/e2e/                       optimized-browser signal experiments
docs/SCIENCE.md                  methods, formulas, sources and limits
docs/VALIDATION.md               recorded internal release evidence
docs/history/                    preserved project history
```

The analysis clock is separate from the render clock. WebGL 2 is preferred and Canvas 2D is the fallback; both must preserve the same scene meaning. Audio stays on-device.

## Engineering standards

- Prefer small, explicit changes and zero-allocation render paths.
- Never crop a measured frame; preview and export must show the same full analysis canvas.
- Do not mutate DOM telemetry or read layout on every animation frame.
- Preserve browser-resource cleanup for tracks, nodes, contexts, timers, listeners and object URLs.
- Keep native keyboard behavior. Custom radiogroups must support roving focus, arrow keys, Home and End.
- Honour reduced motion, increased contrast, reduced transparency and forced colours.
- Preserve history instead of rewriting old artefacts to look current.

## Required validation

```bash
npm run type-check
npm run lint -- --max-warnings=0
npm test
npm run science:fixtures:check
npm run audit:ci
npm run test:e2e
```

Also inspect a real WebGL render and the Canvas fallback at desktop and mobile widths, exercise keyboard controls, verify there is no horizontal overflow, and compare the implementation against the committed optical and scientific contracts.

## Documentation

README and current documentation must describe what ships, in plain and direct language. Keep aspirations in an explicitly labeled roadmap. Do not claim peer review, perceptual validation, calibrated measurement, statistical independence or external scientific approval unless that work has actually happened.
