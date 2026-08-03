# AV/01 release-candidate validation record

> Internal engineering evidence, not external scientific certification.

This record is the evidence behind the status language in the [scientific contract](SCIENCE.md). I am publishing the numbers because “tested” is not useful unless the controls, failures and boundaries are visible.

The core measurements below were recorded on 1 August 2026 against the scientific-analysis release candidate. A 2 August addendum records the minimal-interface and built-in-reference release. Together they approve the five declared scene contracts for the deterministic, built-in-reference and local-file paths tested here. They do **not** constitute peer review, a perceptual study, microphone calibration, metrological certification or approval by any cited author or standards body.

Recorded environment: macOS 26.6 (`arm64`), Codex in-app browser runtime (browser build version/user agent not exposed by the validation harness), 1280 × 720 viewport, final `WEBGL2` renderer at approximately 60–63 FPS, with the Canvas 2D fallback also exercised earlier. The analysis `AudioContext` and separately decoded file-overview buffer both reported 44.1 kHz.

## Automated evidence

The release suite currently contains 51 deterministic tests across five unit-test files, plus five Chromium end-to-end tests:

- 15 feature-bus tests for ERB layout, equal-RMS spectral separation, waveform descriptors, over-full-scale samples, polarity, peak-preserving high-frequency waveform reduction, chroma, tone-to-silence clearing, onset response, production-smoothed 120/200 BPM-equivalent periodicity, sustained-spectrum rejection, state identity and reset;
- 16 scientific-analysis tests for ERB transforms, pitch-class folding, entropy, production-smoothed 90/120/180/200 BPM-equivalent periodicity, an aperiodic control, constant and sub-threshold envelope rejection, one-shot transient hysteresis and rolling recurrence;
- 12 built-in-reference tests for scene coverage, deterministic mono PCM16 encoding and hashes, repeatable synthesis, matched RMS/peak controls, distinct crest factors, 0.5-second event spacing and gain-invariant A–B–A recurrence;
- 4 scene-contract tests for non-overlapping feature ownership, visible limitations, WebGL evidence isolation and the absence of autonomous clocks, noise and grain;
- 4 optical-system tests that enforce the exact black, `#008CFF` and white source pigments, reject undeclared colour literals and hue-shifting brightness filters, require scalar shader tone mapping, and verify the required foreground/background contrast pairs;
- 5 Chromium end-to-end tests for hydration and responsive layout, built-in/user provenance isolation (including a same-filename adversarial case), native radiogroup keyboard behavior, measured-frame containment and ordering, the sustained-tone negative control, all five scene routes, stop/reset and the periodic-versus-jittered transient control.

## 2 August 2026 minimal-reference addendum

The latest release adds five browser-generated reference signals without introducing a parallel analysis path. Selecting one synthesizes a deterministic 48 kHz mono PCM16 WAV, wraps it in a `File`, and sends it through the same decode, `AnalyserNode`, feature-bus and renderer path as a user file. Provenance is held as explicit application state, rather than inferred from a filename; an end-to-end regression verifies that a user file deliberately given a built-in filename remains labelled `user-source`.

Each signal is a compact within-file control that varies a declared input while publishing the properties held fixed: equal-RMS register alternation, octave-related A tones, equal-peak waveform families, a 0.5-second transient grid, and gain-changed A–B–A–C recurrence. The references demonstrate established signal-analysis relationships; they are teaching controls, not proof that a particular visual encoding improves human perception.

The waveform renderer now receives time-ordered block minima and maxima instead of block means. A deterministic 6 kHz regression at 48 kHz verifies that the reduced trace retains approximately ±0.69 amplitude instead of cancelling toward zero. The Auditory Field cutoff annotation is derived from the configured cutoff and Nyquist limit, and the recurrence frontier is rendered independently of the recurrence score so absence of similarity cannot erase the population boundary.

The minimal interface was inspected in the Codex in-app browser at 1440 × 900 and 390 × 844. The desktop reference library displayed all five controls in one row; the mobile library used an intentional horizontal carousel. The selected reference opened at the top of the studio, with the stage, transport and inspector in visual and focus order, no horizontal document overflow, measured-frame provenance intact, WebGL 2 active and no browser console warnings or errors. This is a targeted responsive pass, not the open cross-browser and assistive-technology matrix.

The subsequent brand-consistency pass made the three roles explicit in code as background, signal and reference rather than interchangeable primary/secondary/accent slots. It fixed the intended Unbounded/DM Mono font variables, reserves electric-blue-on-white for large text and non-text accents, raises small light-surface copy above 4.5:1, and renders 38% white reference geometry after presentation tone mapping so its contrast remains above 3:1. Selected frame controls now also change border weight, source transitions reset mobile scroll after the studio commits, and the active scene is centered inside the mobile rail.

### Built-in reference hashes

The byte-level tests regenerate and verify these browser-library WAV files:

| Reference file | SHA-256 |
| --- | --- |
| `reference-01-low-high-spectrum.wav` | `adeadc7e74b0b480eb1d4e8878d5de62a839ae1676e003c9283e3ee04322f219` |
| `reference-02-a3-a4-pitch-class.wav` | `19d58fcae91507a1295c48ab1133f4b89044874918676ccdc601eefc4cc4ba2d` |
| `reference-03-wave-shapes.wav` | `0aac34404dcc8f18cd18f59961827f71a0f074f349b752d425a9f98fc2cbbd78` |
| `reference-04-pulses-120-bpm-equivalent.wav` | `5cb0712a452790d298ad26a4337d8b68b4a4642a958915a4d419e22b0884a35f` |
| `reference-05-a-b-a-c-recurrence.wav` | `bad24113217959364267d999fe134e0fce6a2a16df918e4a08890e0a32b861b6` |

## Current optical and interface regression pass

The fixed optical system is now part of the executable contract rather than a style-guide promise. A recursive test rejects undeclared hexadecimal, comma- or space-form RGB, HSL, HWB, Lab/LCH, display-colour and named-pigment sources across first-party source, public assets and configuration; quieter tones must be alpha or `color-mix()` derivatives of black, electric blue and white. Shader highlight compression operates on one scalar intensity before multiplying the preserved pigment ratio, fixed reference geometry is composited afterward, and CSS brightness filters are prohibited. Rendered-pixel gates inspect both WebGL 2 and Canvas 2D output against the black/electric-blue/white mixture gamut; the reproducible README capture repeats the same check on a populated Recurrence Atlas before writing a lossless PNG. The landing journey also verifies the computed `#008CFF` action surface with black text, the two branded font families and the small-text light-surface roles.

The measured interface was repeated in the Codex in-app browser at 1280 × 720 and 390 × 844. The two-column desktop studio filled the viewport without document overflow. The mobile pass reported no horizontal overflow, transport before inspector, `object-fit: contain`, a 9:16 displayed ratio of `0.5625` against an intrinsic ratio of `0.5628`, and successful arrow-key scene changes. The browser console contained no warnings or errors. These checks approve the recorded layouts and interactions; they are not a substitute for the still-open cross-browser and assistive-technology matrix.

The landing journey keeps the browser's default renderer path. The two fixed-duration signal journeys deliberately select AV/01's production Canvas 2D fallback before navigation. That prevents a CI runner's software-WebGL throughput from shortening the evidence history while leaving the WAV fixture, `AnalyserNode`, analysis timer, feature bus and every scientific threshold unchanged.

The required release commands are:

```bash
npm run release:check
```

A clean checkout must run `npm run browsers:install` once before this gate.

That gate expands to the following independently runnable checks:

```bash
npm run type-check
npm run lint -- --max-warnings=0
npm test
npm run science:fixtures:check
npm run audit:ci
npm run build
npm run test:e2e
```

## Deterministic browser fixtures

`npm run science:fixtures` creates nine mono PCM16LE WAV files at 48 kHz. The browser used for this record produced a 44.1 kHz decoded overview buffer and a 44.1 kHz analysis `AudioContext`. The inspector now labels those as separate paths and warns that browser decode/playback may resample; neither is claimed as the original encoded rate. The generated files stay outside the repository, while their generator and specifications are committed.

| Fixture | SHA-256 |
| --- | --- |
| `tone-375hz-rms025.wav` | `7feb22f5e180180d924a41bbafa5aee4c71ca9b23b5bbbdaaf7114464cf83f15` |
| `tone-6000hz-rms025.wav` | `27400e6cf94056b384c9537789a2efe410a089145bceb0c0720e200f7809eae1` |
| `tone-a3-220hz.wav` | `918eff061eef2c45e75d5681354d902cfe3ca2eff1cbc7229fdfcc9ec5b42133` |
| `tone-a4-440hz.wav` | `4e47d0970dbc1fb575ec41f59a1c4d7cf96812862a6c6b42a84c4399d82149d8` |
| `tone-375hz-inverted.wav` | `69f7e571bfec5b015e8f5f47c7993022a6cc98c3d804bcfdfd18d9e2a7aca548` |
| `pulses-120bpm-equivalent.wav` | `5cb0712a452790d298ad26a4337d8b68b4a4642a958915a4d419e22b0884a35f` |
| `pulses-aperiodic-control.wav` | `aab6665fe03c31c80f6294d3a75cb11017db5218f4eb47dd2edd8113df38548a` |
| `motif-a-b-a-c.wav` | `fe8eb86242da2071ccbc2a3e76f30383dbfacd71acaa9082129f84b6695d528b` |
| `motif-a-b-c-d-control.wav` | `7db1791508a11ab8fa0978c10f59ee7358843ec3fdbccbe7462922e6a626fa21` |

## Matched browser experiments

The browser run exercised the real file decode, `AnalyserNode`, feature clock, scene UI and renderer. The early measurements ran through the Canvas 2D fallback. After a GLSL reserved-word compile failure was found and fixed, the final runtime reported WebGL 2 at about 60 FPS; recurrence and temporal controls were repeated on that path.

| Representation | Matched control | Recorded result | Decision |
| --- | --- | --- | --- |
| Auditory Field | 375 Hz and 6 kHz sine waves with equal generated RMS | Levels `-12.033` and `-12.041` dBFS; centroids `375` and `6000` Hz; >3 kHz power `0%` and `100%` | Pass: level is held while spectral position changes |
| Tonal Orbit | A3 at 220 Hz and A4 at 440 Hz | Both report strongest class `A`; concentrations about `54.5%` and `73.2%`; levels differ by about `0.002` dB | Pass: octave folds while the display avoids note/octave inference |
| Temporal Scope | 375 Hz reference and polarity-inverted copy | Reference/inverted: level `-12.041`/`-12.030` dBFS, peak `0.3536`/`0.3536`, ZCR `0.0171`/`0.0171`, crest `1.4168`/`1.4265`; the numerical unit fixture verifies every displayed waveform point changes sign | Pass: waveform polarity changes while magnitude descriptors remain invariant within browser-window tolerance |
| Rhythm Lattice | 15 periodic pulses at 120 BPM-equivalent and 15 jittered pulses | Seven fresh Chromium runs: periodic candidate `119.57`–`120.06`, evidence `0.8136`–`0.9475`, 13–15 retained candidates; matched aperiodic evidence `0.2694`–`0.3534` at the same analysis-history point | Pass: repeated onset timing separates from the matched event-count control; the value remains a candidate and the score is not probability |
| Recurrence Atlas | level-changed A–B–A sequence and A–B–C control | At the repeated A, recurrence `1.000`; at C, recurrence `0.000`; both final reads used WebGL 2 with 43 populated matrix samples | Pass: level-normalized repeated spectral shape separates from a non-repeating control |

### The failed control I kept in the story

The first recurrence control used differently transposed but broadly similar two-tone shapes. It produced `1.00` for A–B–A and approximately `0.96` for the supposed A–B–C control. That was not a pass: the control did not isolate the variable the scene measures.

I replaced it with four well-separated two-tone ERB shapes—A `[187.5, 375]`, B `[750, 1500]`, C `[3000, 6000]`, D `[9000, 14000]` Hz—and reran the experiment. The corrected A–B–A/A–B–C result is the `1.000`/`0.000` pair above. The failure is recorded because it changed the test, not because it was convenient to hide.

### The false rhythm candidate the release audit caught

A fresh browser replay of the sustained 6 kHz control exposed `200` BPM-equivalent with about `0.48` evidence even though the maximum observed onset strength was below the declared `0.28` transient threshold. Autocorrelation had found weak periodic numerical modulation, not a credible event sequence.

The first attempted guard was also rejected: it counted several rising samples from one smooth attack as several candidates. A hysteresis-only revision then coupled re-arming to the displayed 220 ms release envelope and missed wider or faster transient trains. The approved implementation separates those jobs. Autocorrelation receives the smoothed onset envelope; the one-shot candidate gate observes the unsmoothed adaptive flux target, triggers at `0.28`, and re-arms only after that raw target falls to `0.14`. Four separated candidates are required before any periodicity value is exposed.

The committed regression matrix now covers production smoothing at 90, 120, 180 and 200 BPM-equivalent, multiple transient widths, a single smooth attack with a periodic sub-threshold tail, and a full FeatureBus sustained spectrum tracked over ten seconds. The optimized-browser gate reports the sustained 6 kHz tone with at most one candidate and exactly `0.00` BPM / `0.0000` evidence.

## Runtime, reset and export evidence

- The landing visual is exposed as `synthetic-preview`, `ILLUSTRATIVE · NOT MEASURED`; real fixtures expose `analysisSource=measured`.
- A shader compile failure on the identifier `centroid` was visible only in a real WebGL implementation. Renaming that GLSL local restored `WEBGL2` at about 60 FPS. The production build alone would not have caught it.
- Stop changed sequence `200` to `0`, similarity history `32` to `0`, recurrence `1.000` to `0.000`, dominant chroma to `-1` and every exposed scalar to its zero-evidence state.
- Replaying from the end originally leaked the prior pass. That failure was fixed; the browser then changed sequence `401` to `29` and similarity history `64` to `5` after a 320 ms fresh replay.
- Source changes began with sequence and stateful history at zero.
- A full-track 1280 × 720 WebGL render completed through the browser's negotiated MediaRecorder path, produced a downloadable WebM, used the same scene and measured graph, and restored playback to `00:00`.
- The committed README image is a real 1280 × 720 browser frame of Recurrence Atlas at `1.000` recurrence with its method and limitation visible. The capture script separately verifies measured provenance, a populated similarity history, the three-pigment render contract and the absence of browser runtime failures before writing the image.

## Gate register

| Gate | Status on this candidate | Evidence boundary |
| --- | --- | --- |
| `AV01-VAL-001` deterministic numerical fixtures | **Pass** | 51/51 unit tests, including production-smoothed 90/120/180/200 BPM-equivalent cases, transient-gate adversarial controls, peak-preserving waveform reduction, built-in-reference synthesis and fixed-optical-system enforcement |
| `AV01-VAL-002` signal-family fixtures | **Pass** | Nine offline fixtures plus five browser-library reference files, hash verification and two fixed-duration signal-control journeys within the five-test optimized Chromium suite |
| `AV01-VAL-003` scene-contract routing | **Pass** | Non-overlapping feature declarations and WebGL block-isolation tests; Canvas routing exercised by optimized-browser signal gates against the same contract |
| `AV01-VAL-004` browser integration | **Partial** | Local-file provenance, decoded rate, FFT/window disclosure, Canvas 2D and WebGL 2 passed in the recorded browser; system capture and microphone permission/settings were not exercised |
| `AV01-VAL-005` reset/seek/source lifecycle | **Pass** | Reset unit tests plus source, stop, replay-from-end and export restoration checks |
| `AV01-VAL-006` export provenance | **Pass** | Full local-file WebGL render completed through the shared measured graph |
| `AV01-VAL-007` long-session timing | **Not completed** | Timer/visibility behavior is bounded and documented in code, but hidden-tab behavior under sustained load and a defined long-duration run were not recorded for this candidate |
| `AV01-VAL-008` perceptual study | **Not performed** | No preregistered listener study |
| `AV01-VAL-009` independent peer review | **Not performed** | Internal code review is not external specialist peer review |
| `AV01-VAL-010` metrological certification | **Not applicable; not performed** | AV/01 is not presented as a calibrated measurement instrument |

The release decision is therefore narrow and explicit: the five visual representations, deterministic descriptors, local-file browser demonstration, lifecycle resets and export provenance are internally approved against their declared contracts. Live-capture negotiation, long-session behavior, listener interpretation and calibrated measurement remain open or out of scope, and the product does not borrow those missing forms of approval.
