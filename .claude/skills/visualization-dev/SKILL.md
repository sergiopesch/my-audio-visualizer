---
name: visualization-dev
description: Develop AV/01 signal representations without breaking the scientific or optical contracts
---

# Overview

Use this guidance when changing a scene, renderer, feature-to-pixel mapping or visual control.

# Required process

1. Name the signal representation and the narrow question it can answer.
2. Declare its exact `FeatureFrame` ownership in `src/lib/visualizer/types.ts`.
3. Add primary scientific sources and an explicit non-inference boundary.
4. Define the pixel mapping: axis, geometry, amplitude transform, history and smoothing.
5. Implement matching WebGL and Canvas 2D routes without autonomous time, noise or random decoration.
6. Use only black `#000000`, electric blue `#008CFF`, white `#FFFFFF` and their opacity blends.
7. Add a matched positive and negative control, deterministic unit coverage and a browser experiment.
8. Update `docs/SCIENCE.md`, `docs/VALIDATION.md` and the in-product method disclosure.

# Current scene families

- Auditory Field: ERB-spaced spectral bands, centroid, rolloff and high-frequency power fraction.
- Tonal Orbit: twelve-bin octave-folded pitch-class energy and unitless concentration index.
- Temporal Scope: mono waveform, RMS, sample peak, crest factor and zero-crossing fraction.
- Rhythm Lattice: onset change and short-term autocorrelation periodicity with a heuristic index.
- Recurrence Atlas: rolling cosine self-similarity of normalized log-ERB spectral shape.

# Optical roles

- Electric blue is signal-derived evidence.
- White is reference geometry, thresholds and annotations.
- Black is zero or absence.
- Magnitude is encoded by extent, opacity and/or line weight. Hue does not encode an extra variable.

# Performance constraints

- Analysis cadence and rendering cadence remain separate.
- Avoid allocation, layout reads and DOM mutation in the animation loop.
- Update the self-similarity texture only when that scene is active and the matrix changes.
- Preserve full-frame containment at every aspect ratio.

# Definition of done

All required commands in `.claude/CLAUDE.md` pass, both renderers preserve the declared mapping, keyboard and responsive journeys work, and the documentation states both the evidence and its limits.
