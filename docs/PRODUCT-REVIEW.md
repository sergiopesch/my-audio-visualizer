# From Audio Visualizer to AV/01

I wrote this down because I do not want the first version to disappear underneath the new one.

It was not a mistake or something to hide. It was the experiment that proved the idea.

ThorstenClip was the next exploration. It pushed the analysis, interface and output much further, but it also became attached to a specific name and identity.

AV/01 brings the best of both projects together and gives the idea room to become itself.

## The versions I reviewed

- The literal beginning: Audio Visualizer commit [`7305457`](https://github.com/sergiopesch/my-audio-visualizer/commit/73054575ebad1975cd8b4afd683da361af060993)
- The finished original release: [`v0.1.0-original`](https://github.com/sergiopesch/my-audio-visualizer/tree/v0.1.0-original)
- The final pre-AV/01 baseline: Audio Visualizer commit [`065e80f`](https://github.com/sergiopesch/my-audio-visualizer/commit/065e80f)
- The ThorstenClip baseline reviewed for this rebuild: commit [`f7127b2`](https://github.com/sergiopesch/ThorstenClip/commit/f7127b2)

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

The same audio graph, feature frame, scene, palette, settings and playback clock now drive everything the user sees and exports.

That sounds obvious, but neither earlier project handled it completely.

## The new signal vocabulary

AV/01 now reads:

- 24 log/perceptual frequency bands with real frequency boundaries.
- RMS and peak for continuous energy and transient scale.
- Crest factor for the relationship between body and attack.
- Spectral centroid and rolloff for perceived brightness and bandwidth.
- Adaptive spectral flux for change and onset energy rather than raw loudness.
- Waveform samples for shape and polarity.
- Silence hysteresis so visuals settle instead of chattering around a threshold.

These values move through reusable, allocation-stable feature frames. The renderer receives a coherent signal description instead of searching for one winning FFT bin every frame.

## The new visual vocabulary

### Spectral Field

A liquid spatial field carved by timbre and dynamics. Bass bends the space, mids form ribbons and high frequencies reveal surface detail.

### Orbital Bloom

All 24 bands shape a radial instrument. Transients create their own shockwaves rather than only increasing the size of everything else.

### Signal Trace

The waveform becomes a visual form instead of a diagnostic line. Crest factor and spectral change create depth and repetition.

### Pulse Lattice

This is the original pixel-ripple idea rebuilt rather than discarded. Frequency bands illuminate different cells, bass expands the structure and treble fractures its edges.

### Contour Memory

Energy, brightness and transients raise and disturb a topographic field, giving the signal a sense of terrain and history.

Scenes are independent from palette, frame, response and visual-comfort settings. The system is composable instead of being a collection of locked presets.

## The standard I am setting

The AV/01 rebuild now includes:

- A WebGL 2 shader pipeline with a distinct Canvas 2D fallback.
- Allocation-stable audio feature extraction and a ref-driven render loop.
- Deterministic file timing across pause, seek, preview and export.
- Local file, microphone and shared tab/application sources.
- A real waveform timeline and keyboard-operable transport.
- Landscape, square and portrait output frames.
- Browser-aware recording format negotiation.
- Recorder timeslices, automatic file completion and manual live completion.
- Playback restoration, background-tab coordination and explicit time/memory ceilings.
- An explicit demo pause, reduced-motion behavior, semantic controls, focus states and dialog semantics.
- Responsive desktop, mobile and short-landscape layouts.
- Standard clean-clone development and production commands.

## How I tested it

The finished rebuild passed:

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

1. Move analysis into `AudioWorklet` plus a worker/WASM feature engine for custom FFT windows, beat phase, chroma, key and tempo confidence.
2. Add a progressive WebGPU renderer while retaining WebGL 2 and Canvas fallbacks.
3. Add project files, scene presets, automation lanes and MIDI/OSC input.
4. Add deterministic offline rendering with WebCodecs when browser coverage and audio-container tooling meet the reliability bar.
5. Add optional text, camera, image and depth layers without turning the core instrument into a transcription product.
6. Build automated visual-regression, audio-fixture, recorder-lifecycle and long-session performance suites.

## Standards informing the work

- [Web Audio API specification](https://www.w3.org/TR/webaudio-1.1/)
- [MDN: AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [MDN: AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [MDN: MediaStreamAudioDestinationNode](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamAudioDestinationNode)
- [MDN: WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [WebGPU support across major browsers](https://web.dev/blog/webgpu-supported-major-browsers)
- [WCAG: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
- [WCAG: Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)

The goal is not more particles, more controls or louder effects.

I want AV/01 to become the most expressive browser-native audio visualizer I can build: musically aware, visually distinctive, technically honest and open enough for someone else to make the result their own.

AV/01 is a major step toward that standard. It is not the end of the story.
