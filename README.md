# AV/01 — Audio Visualizer

> Sound, seen.

I started this project with one simple idea: choose a track, let the sound move a field of pixels, and record the result.

The first version was one page, one canvas and a small green grid. It was simple, imperfect and immediately alive. That version still matters to me because it proved the idea.

AV/01 is what happened when I stopped treating that idea like an effect and started treating it like an instrument.

It listens for rhythm, timbre, transients, brightness, spectral movement and waveform shape, then turns them into five visual systems that can be played, shaped, captured and recorded in real time.

![AV/01 running the Pulse Lattice scene](output/playwright/av01-studio-readme.png)

## Where it started

The original Audio Visualizer had one scene and one beautifully direct idea: let sound push a ripple through a field of pixels.

![The original Audio Visualizer](public/Screen_Recording.gif)

I am keeping that first version visible. It is not something I want to erase underneath the rebuild—it is the reason the rebuild exists.

- [`origin-green-grid`](https://github.com/sergiopesch/my-audio-visualizer/tree/origin-green-grid) marks the literal first working green-grid version from January 2025.
- [`v0.1.0-original`](https://github.com/sergiopesch/my-audio-visualizer/tree/v0.1.0-original) preserves the finished original release.
- [`av01-launch`](https://github.com/sergiopesch/my-audio-visualizer/tree/av01-launch) marks the first complete AV/01 rebuild now living on `main`.
- [The archived V1 README](docs/history/AUDIO-VISUALIZER-V1.md) preserves the original README text, with only an archival note and its demo-image path adjusted.
- [From Audio Visualizer to AV/01](docs/PRODUCT-REVIEW.md) explains what changed, what I learned from ThorstenClip and why I rebuilt the system this way.

Along the way, I built ThorstenClip to find out how much further this idea could go. It taught me a lot about stage-first design, deeper audio analysis, visual composition and making the final result feel authored instead of decorative.

I brought the strongest lessons back here without bringing the Thorsten name, look or personality with them. AV/01 has its own identity.

## What AV/01 is now

AV/01 is a browser-native visual instrument for music, voice, instruments and live system audio.

- Open local audio by picker or drag and drop.
- Capture audio from a shared tab or application.
- Use a microphone for a room, voice or instrument.
- Read the signal through 24 perceptual frequency bands and a full set of dynamics and spectral features.
- Shape five real-time scenes with response, motion, bloom, detail, palette and frame controls.
- Save still frames or record a complete visual performance with audio.
- Keep the entire process local to the browser.

Your audio stays with you. There is no upload service, account or tracking layer. The browser does the listening, drawing, snapshotting and recording.

## Five visual systems

| Key | Scene | What the sound controls |
| --- | --- | --- |
| `1` | **Spectral Field** | Bass bends space, mids form ribbons and high frequencies reveal grain. |
| `2` | **Orbital Bloom** | All 24 bands shape a radial bloom while transients launch shockwaves. |
| `3` | **Signal Trace** | The waveform becomes the form; crest factor and spectral flux create depth and echoes. |
| `4` | **Pulse Lattice** | The original pixel ripple returns with directional frequency detail. |
| `5` | **Contour Memory** | Energy, brightness and transients raise and disturb a topographic field. |

Every scene can be combined with four color systems and three output frames. Sensitivity, intensity, motion, bloom and detail remain independent, so the result can become yours rather than a fixed preset.

## It listens to more than volume

The original visualizer reduced each frame of audio to one peak value. AV/01 keeps the immediacy but gives the sound a much larger vocabulary:

- 24 log/perceptual frequency bands with real frequency boundaries.
- RMS and peak for continuous energy and transient scale.
- Crest factor for the relationship between body and attack.
- Spectral centroid, rolloff and brightness for tonal shape.
- Adaptive spectral flux for change and onset energy.
- Waveform samples for shape and polarity.
- Silence hysteresis so the visuals settle instead of chattering around a threshold.

The goal is not to show more data. It is to make the visuals respond in ways that feel musical.

## Start the instrument

### Requirements

- Node.js `22.12.0` or newer
- npm `11`
- A current desktop browser; Chrome and Edge currently provide the broadest capture and recording support

### Install and run

```bash
git clone https://github.com/sergiopesch/my-audio-visualizer.git
cd my-audio-visualizer
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No local certificate is required. `localhost` is accepted as a trustworthy development origin by the browser. Use HTTPS when the app is served from a hostname, LAN address, preview deployment or production domain.

For a production build:

```bash
npm run build
npm run start
```

## Using AV/01

1. Choose **Open a track**, **Capture audio** or **Use microphone**.
2. When capturing system audio, select a tab or application and enable the browser's **Share audio** option.
3. Choose a scene and shape its response in the inspector.
4. Scrub a file with the waveform timeline or perform against a live source.
5. Save a PNG frame, enter fullscreen or open **Export** to record the performance.

### Keyboard controls

| Key | Action |
| --- | --- |
| `Space` | Play or pause the landing demo/audio source |
| `1`–`5` | Switch visual scene |
| `F` | Enter or leave stage fullscreen |
| `S` | Download the current frame as PNG |
| `E` | Open the export panel |

Shortcuts are ignored while a form control is focused or the export dialog is open.

## Exporting a performance

AV/01 records in real time at 30 FPS. The canvas and the recordable audio destination are joined inside the browser, so the recording uses the same signal, scene, palette, settings and playback clock as the live stage.

| Frame | Dimensions | File source | Live source |
| --- | ---: | --- | --- |
| Landscape | 1280 × 720 | Starts at `00:00`; ends with the track or first safety limit | Stops when requested or at the first safety limit |
| Square | 1080 × 1080 | Starts at `00:00`; ends with the track or first safety limit | Stops when requested or at the first safety limit |
| Portrait | 720 × 1280 | Starts at `00:00`; ends with the track or first safety limit | Stops when requested or at the first safety limit |

The browser negotiates the recording format. WebM with VP9/VP8 and Opus is preferred; MP4/H.264/AAC is attempted where the browser exposes it. The downloaded extension always follows the actual recorder output.

Important boundaries:

- A three-minute track takes roughly three minutes to render. This is real-time capture.
- File and live renders stop at 10 minutes.
- Encoded output stops at 256 MB to protect the browser tab from exhausting memory.
- When the AV/01 tab is backgrounded during a render, recording and file playback pause together and resume when the tab becomes visible again.
- System-audio capture and available recording formats vary by browser and operating system.

## Under the hood

```text
file / system share / microphone
              │
              ▼
       Web Audio graph ──────────────► recordable audio destination
              │
              ▼
    4096-point AnalyserNode
              │
              ▼
   allocation-stable feature bus
   bands · dynamics · spectral shape · waveform · silence
              │
              ▼
   WebGL 2 scene renderer ───────────► Canvas 2D fallback
              │
              ├──────────────────────► PNG snapshot
              └──── canvas stream + audio ──► MediaRecorder
```

The render loop is ref-driven and does not push React state on every frame. Feature arrays are allocated once and reused. File playback time provides deterministic timing across pause, seek, preview and export.

| Path | Responsibility |
| --- | --- |
| `src/hooks/useAudioEngine.ts` | Audio context, file decoding, waveform peaks, live capture, transport and recording output. |
| `src/lib/audio/feature-bus.ts` | Perceptual bands, dynamics, spectral features, smoothing and silence detection. |
| `src/lib/visualizer/shaders.ts` | Full-screen WebGL shader programs for the five scenes. |
| `src/lib/visualizer/renderer.ts` | Feature-to-uniform mapping, WebGL lifecycle and Canvas 2D fallback. |
| `src/hooks/useCanvasRecorder.ts` | Format negotiation, capture composition, progress, limits and downloadable recordings. |
| `src/components/studio/` | Source picker, stage, scene rail, inspector, transport, waveform and export interface. |

## Accessibility and visual comfort

- The landing animation can always be paused from the canvas or with `Space`.
- A reduced-motion preference opens the landing experience as a static frame.
- **Visual comfort** is enabled by default and softens rapid audio-driven changes, high-frequency grain and bloom.
- Scene, palette, frame, transport, timeline and switch controls expose semantic names and states.
- Focus indicators, dialog semantics and error announcements are built into the interface.

Visual comfort is a comfort aid, not a certified photosensitivity safeguard.

## Browser support

Browser support is based on capabilities rather than a version number:

| Capability | Browser API | Notes |
| --- | --- | --- |
| Audio-file visualization | Web Audio API | Exact MP3, AAC/M4A, FLAC, OGG, Opus, WAV and WebM decoding support varies. |
| Microphone input | `getUserMedia()` | Requires permission and a secure context. |
| System/tab audio | `getDisplayMedia()` with audio | Availability depends on the browser, OS and selected share target. |
| Primary renderer | WebGL 2 | Canvas 2D is used when WebGL 2 cannot be created. |
| Video export | `captureStream()` and `MediaRecorder` | MIME types and codecs are browser-specific. |
| Fullscreen stage | Fullscreen API | Some mobile browsers limit element fullscreen behavior. |

## Development checks

```bash
npm run type-check
npm run lint
npm run build
npm run audit:ci
```

The AV/01 release has also been exercised in a real browser across desktop, mobile and short-landscape layouts; WebGL context loss; Canvas 2D fallback; reduced motion; file playback; background-tab recording; and a complete 1280 × 720 VP9/Opus video export.

## What comes next

This version has a clear technical boundary: `AnalyserNode`, WebGL 2 with Canvas fallback and real-time `MediaRecorder` output.

The next steps I care about are AudioWorklet/WASM analysis, beat phase, chroma, tempo confidence, a progressive WebGPU renderer, project files, automation, MIDI/OSC control and deterministic offline export through WebCodecs.

The goal is not more particles, more controls or louder effects. I want AV/01 to become the most expressive browser-native audio visualizer I can build: musically aware, visually distinctive, technically honest and open enough for someone else to make the result their own.

AV/01 is a major step toward that standard. It is not the end of the story.
