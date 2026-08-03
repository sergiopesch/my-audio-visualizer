# AV/01 research roadmap

> Make the evidence stronger before making the claim bigger.

I ran this research pass on 1 August 2026 because I do not want AV/01 to become a catalogue of impressive-looking effects. A new scene earns its place only when it asks a genuinely different question about sound, exposes the transform behind it and survives a matched control.

## What changed now

These improvements strengthen the current five scenes without changing their validated DSP thresholds:

- One optical language now spans the interface, WebGL, Canvas and export: black `#000000`, electric blue `#008CFF` and white `#FFFFFF`; scalar tone mapping and rendered-pixel gates prevent highlight processing from drifting the blue toward cyan.
- Coordinate-driven hue ramps are gone. Frequency position, pitch class, BPM and matrix position no longer invent colour dimensions.
- Electric blue identifies signal-derived evidence. White identifies references and annotation. Geometry, extent, opacity and line form carry value.
- Concentration, spectral change, periodicity support and cosine similarity are displayed as unitless indices instead of probability-looking percentages.
- The exact feature-to-pixel mappings are now part of the [scientific contract](SCIENCE.md#visual-encoding-contract).
- The full measured frame is contained on narrow screens instead of being cropped.
- Keyboard controls keep their native behaviour, radiogroups support expected navigation, and contrast/transparency preferences have explicit treatments.
- Canvas sizing and test telemetry no longer force layout reads and dozens of DOM mutations on every animation frame.
- A minimal reference-gallery interface now keeps the stage primary and moves method, provenance and appearance detail behind explicit disclosures.
- Five deterministic built-in references make the expected response of every current view audible and visible without requiring a user file.
- The time-domain display now retains ordered block extrema, so high-frequency signals cannot cancel to a flat trace through whole-cycle block averaging.
- The high-frequency Field overlay is positioned from the configured cutoff on the actual ERB layout rather than a fixed screen coordinate.

## The current public demonstration and next experiment

The first demonstration layer now ships: five on-demand reference signals select the relevant scene and publish what to listen for, what to watch and what stays controlled. Their headers, hashes and core signal properties are executable tests.

The highest-value product addition is not a sixth scene. It is a true paired **Experiment / Compare** view built from the existing deterministic controls. It should expose both the positive signal and its matched negative control side by side, retain numerical observations and make the following comparisons directly falsifiable:

| Comparison | Expected selectivity | Expected invariant |
| --- | --- | --- |
| 375 Hz / 6 kHz at equal RMS | Auditory Field position changes | RMS level remains stable |
| A3 / A4 | Spectrum and waveform period change | Tonal Orbit's strongest class remains A |
| Waveform / polarity inverse | Temporal trace mirrors | RMS, peak and crest remain stable |
| Periodic / jittered equal-count pulses | Periodicity index separates | Candidate event count stays matched |
| A–B–A / A–B–C | Off-diagonal similarity separates | Per-frame ERB-shape vocabulary stays fixed |

The interface should publish the expected change, expected invariant, numerical tolerance and observed value. That turns the differentiator into something anyone can try to falsify.

## Science architecture before new claims

The current 50 Hz analysis schedule runs on the browser main thread. After a stall, the timer can read the same latest `AnalyserNode` window into more than one nominal history step. It is honest to call that cadence nominal; it is not honest to call it sample accurate.

The next architecture should use AudioWorklet acquisition, a fixed-hop custom STFT and worker/WASM analysis, with the current `AnalyserNode` path retained as a fallback. Every fixture and threshold must be re-baselined after that change.

That architecture also makes these upgrades defensible:

1. Multiple periodicity hypotheses with the selected autocorrelation peak, alternatives, history and event count exposed.
2. Tuning-offset estimation, peak weighting and harmonic whitening for stronger pitch-class energy—still not note, chord or key recognition.
3. Multiscale recurrence with explicit gain-invariance controls—still not verse or chorus labeling.
4. Recorded Firefox, WebKit, 44.1/48/96 kHz, hidden-tab, sustained-load and long-session gates.

## The strongest sixth representation

A spectrotemporal modulation field is the clearest candidate I found in the recent literature. It would place temporal modulation rate on one axis and spectral modulation scale on the other over a rolling log-ERB spectrogram. That is materially different from current spectrum, chroma, waveform, onset periodicity and self-similarity.

The safe claim is narrow: **energy fluctuations by temporal rate and spectral scale**. It must not be sold as a model of auditory cortex, emotion, sound-source identity or classification. Recent work by Chang and colleagues demonstrates the interpretability and machine-listening value of spectrotemporal modulation features, but it does not validate an AV/01 scene. See [Interspeech 2025, DOI 10.21437/Interspeech.2025-1021](https://doi.org/10.21437/Interspeech.2025-1021).

## What approval would actually mean

AV/01 can currently claim five mathematically distinct, cited and falsifiably routed browser-audio representations with internal fixture validation. It cannot claim to be scientifically proven best, peer reviewed, perceptually validated, sample accurate across browsers or externally approved.

A real perceptual claim needs a preregistered, counterbalanced listener study against waveform and spectrum baselines, with effect sizes and confidence intervals. A broader scientific claim needs independent DSP and accessibility review. I would rather leave that line visible than borrow authority the project has not earned.

## Research used in this pass

- [Müller and Chiu: novelty and activation functions, 2024](https://doi.org/10.5334/tismir.202)
- [Chang et al.: spectrotemporal modulation, Interspeech 2025](https://doi.org/10.21437/Interspeech.2025-1021)
- [Crameri and Hason: colour integrity, 2024](https://doi.org/10.1016/j.patter.2024.100972)
- [Color Maker: accessible continuous colour maps, CHI 2024](https://doi.org/10.1145/3613904.3642265)
- [Esmaeili et al.: motion as quantitative visual encoding](https://doi.org/10.1109/TVCG.2022.3193756)
- [W3C Web Audio API 1.0](https://www.w3.org/TR/webaudio-1.0/) and [Web Audio API 1.1 draft](https://www.w3.org/TR/webaudio-1.1/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
