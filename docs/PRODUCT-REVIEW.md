# From Audio Visualizer to AV/01

I wrote this down because I do not want the first version to disappear underneath the new one.

It was not a mistake or something to hide. It was the experiment that proved the idea.

ThorstenClip was the next exploration. It pushed the analysis, interface and output much further, but it also became attached to a specific name and identity.

AV/01 brings the best of both projects together and gives the idea room to become itself.

This review tells the product story. [The scientific contract and provenance](SCIENCE.md) is the companion record for formulas, source literature, current windows and validation status.

## The versions I reviewed

- The literal beginning: Audio Visualizer commit [`7305457`](https://github.com/sergiopesch/my-audio-visualizer/commit/73054575ebad1975cd8b4afd683da361af060993)
- The finished original release: [`v0.1.0-original`](https://github.com/sergiopesch/my-audio-visualizer/tree/v0.1.0-original)
- The final pre-AV/01 baseline: Audio Visualizer commit [`065e80f`](https://github.com/sergiopesch/my-audio-visualizer/commit/065e80f)
- The ThorstenClip baseline reviewed for this rebuild: commit `f7127b2` in my private working repository

## The first experiment

I started Audio Visualizer in January 2025 with a local audio file, a 600 × 400 canvas and a 12 × 8 green grid.

The cells were ordered from the centre outward. An `AnalyserNode` split the audio into frequency bins, those bins illuminated the cells, and the canvas could be recorded with the audio into a WebM file.

That first implementation was already functional. More importantly, it had the core feeling I wanted: sound was not sitting next to an image—it was moving through it.

The project quickly became a radial pixel ripple with drag and drop, playback controls, a timeline, response settings, system-audio capture and video export. The green grid eventually became the blue/cyan visual shown in the original demo.

## What the original got right

- Opening a track was immediate.
- The centre-out pixel movement had a recognizable identity.
- Everything happened locally in the browser.
- The control surface was small enough to understand without instructions.
- Recording the visual result was part of the idea from the beginning.

Those qualities are still part of AV/01.

## Where the original reached its limit

The final pre-AV/01 version had grown, but its foundations still belonged to the first experiment:

- It reduced an audio frame to the single loudest FFT value, so rhythm, timbre and spectral balance disappeared into one number.
- `fftSize = 1024` limited low-frequency resolution.
- Random per-frame variation created flicker and made replay non-deterministic.
- The fixed canvas did not account for output ratio or device pixel density.
- Preview and export could behave differently, and an export started from a paused or ended file could stall.
- Recording assumed one hard-coded WebM format instead of negotiating what the browser could actually produce.
- Source streams, audio nodes, object URLs and recorder listeners were not managed as one complete lifecycle.
- Most of the application lived in one large client component.
- Local development depended on certificate files that were not included in the repository.

I could have kept patching those problems, but the project needed a new internal model, not another layer of fixes.

## What ThorstenClip taught me

ThorstenClip was where I tested a more ambitious version of the idea.

It introduced a stage-led workspace, richer audio analysis, waveform and radial compositions, captions, output presets and a stronger local render flow. It made the result feel closer to authored media than a browser effect.

The lessons worth bringing back were structural:

- Put the stage at the centre of the interface.
- Group frequencies perceptually instead of treating linear FFT bins as equally meaningful.
- Give RMS, peak, spectral flux, waveform and adaptive envelopes different visual jobs.
- Build a family of visual systems rather than one effect with different colors.
- Make output format and render state visible.
- Keep the workflow local and make the finished result feel deliberate.
- Give transport, active states and editing hierarchy the same attention as the canvas.

## What I left behind

I did not want Audio Visualizer to become ThorstenClip with a different logo.

I deliberately left behind:

- The Thorsten name, logo, red palette and personality-led identity.
- A transcription-first product direction. Text can become an optional layer later, but sound remains the instrument.
- Separate preview and render algorithms that produce visibly different results.
- Simulated energy during real silence.
- Per-frame allocations inside the main render loop.
- A fixed FFmpeg/Whisper dependency as the centre of the browser experience.
- “Saved” states before an artifact has actually been downloaded or persisted.

## The rule behind AV/01

I rebuilt AV/01 around one rule: the sound, the preview and the final recording must all belong to the same instrument.

```text
source → Web Audio graph → feature bus → scene renderer → canvas
                └───────────────────────────────→ export audio
                                             canvas → export video
```

For an active user source, the same audio graph, feature frame, scene, fixed optical system, settings and playback clock now drive what the user sees and exports. The landing state is a separately labeled deterministic synthetic preview; it is never presented as captured audio or used to replace a missing live signal.

That sounds obvious, but neither earlier project handled it completely.

## The new signal vocabulary

AV/01 now reads:

- 24 triangular frequency bands laid out on the ERB-rate scale.
- Twelve octave-folded pitch-class energy bins under a fixed A4 = 440 Hz, twelve-tone equal-tempered mapping.
- A recent mono waveform with RMS, sample peak, crest factor and zero-crossing rate.
- Positive log-spectral change for onset strength, then short-window autocorrelation for a periodicity candidate.
- A rolling cosine self-similarity matrix of level-normalized, mean-centred log-ERB spectral shape.
- Spectral centroid, 85% rolloff and a high-frequency power ratio as acoustic descriptors, not direct measures of perceived brightness.
- Silence hysteresis so visuals settle instead of chattering around a threshold.

These values move through reusable, allocation-stable feature frames on a nominal 50 Hz analysis clock, separate from display refresh. The renderer receives a coherent signal description instead of searching for one winning FFT bin every frame.

I also name the boundaries. The level is normalized digital dBFS, not LUFS or acoustic SPL. Web Audio gives AV/01 a browser-defined mono analyser window, not calibrated stereo measurement. Browser timing is nominal, and microphone processing can still vary even when AV/01 requests it off.

## The new visual vocabulary

### Auditory Field · `AV01-SCI-001`

A short-time spectrum grouped into 24 ERB-rate-spaced triangular regions. It shows how RMS-like spectral magnitude varies across those regions now; it does not recognize sources or instruments or model an individual listener.

### Tonal Orbit · `AV01-SCI-002`

Twelve octave-folded pitch-class energy bins become fixed sectors. It shows a unitless concentration index under the chosen mapping; it does not identify a note, octave, chord, key or tuning.

### Temporal Scope · `AV01-SCI-003`

The recent mono waveform becomes the form, with RMS, sample peak, crest factor and zero-crossing rate visible around it. It is not LUFS, SPL, true peak, stereo phase or a laboratory oscilloscope.

### Rhythm Lattice · `AV01-SCI-004`

Spectral-change evidence excites the original lattice idea, while short-term autocorrelation offers a periodicity candidate, a heuristic index and the history duration. The index is not a probability or calibrated confidence. The scene does not confirm a beat, tempo, downbeat, meter or groove.

### Recurrence Atlas · `AV01-SCI-005`

Recent spectral shape becomes a rolling time-by-time cosine self-similarity matrix. A bright off-diagonal cell means resemblance inside the current eight-second history; it does not label a chorus, verse, motif, source or structural boundary.

Scenes can be paired with sensitivity, intensity, glow, detail, frame and visual-comfort settings without changing the underlying analysis. The system is composable instead of being a collection of locked presets.

## The optical system

I have now removed the four interchangeable palettes. They made the instrument look flexible, but they also let arbitrary hue imply an audio dimension the analysis never computed.

AV/01 now uses one authored language: black for silence and the stage, electric blue for signal-derived evidence, and white for references, thresholds and words. Opacity, extent, weight and line form carry magnitude and state. Colour supports the reading; it does not invent one.

## The scientific contract

I do not want a citation to become decoration or borrowed authority. Each scene now has a stable claim ID, a narrow question, an explicit exclusion and a primary-source trail in [the scientific contract](SCIENCE.md#the-five-scene-contract).

Those sources establish precedents for the signal representations. They do not endorse AV/01, validate the artistic mappings or approve the implementation. The [release-candidate validation record](VALIDATION.md) now publishes the fixture, browser, lifecycle and provenance evidence: the five local-file scene contracts pass internally, while live-capture integration is partial and long-session timing remains open. Perceptual study, independent peer review and metrological certification are separate things, and AV/01 does not claim any of them.

## The standard I am setting

The AV/01 rebuild now includes:

- A WebGL 2 shader pipeline with a distinct Canvas 2D fallback.
- One enforceable black, white and electric-blue optical system shared by interface, WebGL, Canvas and export.
- Allocation-stable audio feature extraction, a nominal 50 Hz analysis clock decoupled from display refresh and explicit state reset across source discontinuities.
- Signal-derived scene state without an extra autonomous animation clock.
- Media-playhead transport/export coordination, with analysis history reset across seek, source change, stop and replay-from-end.
- Local file, microphone and shared tab/application sources.
- A real waveform timeline and keyboard-operable transport.
- Landscape, square and portrait output frames.
- Browser-aware recording format negotiation.
- Recorder timeslices, automatic file completion and manual live completion.
- Playback restoration, background-tab coordination and explicit time/memory ceilings.
- An explicit demo pause, reduced-motion, increased-contrast and reduced-transparency behavior, semantic controls, focus states and dialog semantics.
- Full-frame measured canvases that are contained rather than cropped at desktop and mobile sizes.
- Responsive desktop, mobile and short-landscape layouts.
- Standard clean-clone development and production commands.

## How I validate it

The first AV/01 rebuild established a UI, lifecycle and export baseline. That earlier release passed:

- TypeScript validation.
- ESLint, React hooks, imports and accessibility rules.
- A clean optimized Next.js production build.
- A dependency audit with no unexpected high or critical advisories.
- Desktop, mobile and short-landscape browser checks.
- All five WebGL scenes.
- Forced Canvas 2D fallback.
- WebGL context loss and recovery.
- Reduced-motion and truly frozen paused-frame checks.
- Export from paused and ended file states.
- Export across a background-tab transition.
- A complete recorded file verified as 1280 × 720 VP9 video with 48 kHz stereo Opus audio.

The new scientific-analysis release is a separate evidence set. Its deterministic numerical fixtures, signal-family fixtures, scene-contract routing, reset/seek/source lifecycle and local-file export provenance now pass internally in the [validation register](SCIENCE.md#validation-register). Browser integration is partial because system/microphone capture was not exercised, and long-session timing remains open.

I call the five local-file scene contracts internally validated only within the recorded evidence boundary. I do not call AV/01 peer reviewed, perceptually validated, metrologically certified or approved by any cited author, publisher or standards body.

## The project history is part of the product

I have kept the important milestones as named points in the history:

1. [`origin-green-grid`](https://github.com/sergiopesch/my-audio-visualizer/tree/origin-green-grid) points to the literal first working version.
2. [`v0.1.0-original`](https://github.com/sergiopesch/my-audio-visualizer/tree/v0.1.0-original) points to the completed original release.
3. [`av01-launch`](https://github.com/sergiopesch/my-audio-visualizer/tree/av01-launch) marks the first complete AV/01 rebuild.
4. [The archived V1 README](history/AUDIO-VISUALIZER-V1.md) preserves how the project described itself before this rebuild.

The old code does not need to stay inside the production application to remain part of the story. Git history and named tags keep it intact and runnable.

## What comes next

This version has a clear browser baseline: `AnalyserNode`, WebGL 2 with Canvas fallback and real-time `MediaRecorder` output.

The next level is:

1. Move analysis into `AudioWorklet` plus a worker/WASM feature engine for custom FFT windows and more stable scheduling.
2. Add tuning-aware pitch-class analysis and retain multiple periodicity hypotheses instead of collapsing ambiguity too early.
3. Extend recurrence across multiple time scales without turning visual similarity into unsupported song-structure labels.
4. Record cross-browser signal fixtures, publish release evidence and invite independent method review.
5. Add a progressive WebGPU renderer while retaining WebGL 2 and Canvas fallbacks.
6. Add project files, scene presets, automation lanes and MIDI/OSC input.
7. Add deterministic offline rendering with WebCodecs when browser coverage and audio-container tooling meet the reliability bar.
8. Add optional text, camera, image and depth layers without turning the core instrument into a transcription product.

## Standards informing the work

The complete paper and standards registry is in [the scientific contract](SCIENCE.md#primary-source-registry). The platform and measurement boundaries are grounded in official sources:

- [W3C Web Audio API Recommendation](https://www.w3.org/TR/2021/REC-webaudio-20210617/) and the [Web Audio API 1.1 First Public Working Draft](https://www.w3.org/TR/webaudio-1.1/)
- [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)
- [W3C MediaStream Recording](https://www.w3.org/TR/mediastream-recording/)
- [W3C WebGPU](https://www.w3.org/TR/webgpu/)
- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/)
- [W3C Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I) and [EBU R 128, version 5.0](https://tech.ebu.ch/publications/r128) for the loudness methods AV/01 does not claim to implement

The goal is not more particles, more controls or louder effects.

I want AV/01 to become the most expressive browser-native audio visualizer I can build: musically aware, visually distinctive, technically honest and open enough for someone else to make the result their own.

AV/01 is a major step toward that standard. It is not the end of the story.
