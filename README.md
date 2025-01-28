# Green Audio Visualizer

A minimal **Next.js 13** application that lets you:

1. **Select an audio file** (MP3, WAV, etc.)  
2. **Play** it via a native `<audio>` element with controls (seek, pause, etc.).  
3. **Visualize** the waveform in a **“center-out”** green pixel pattern.  
4. **Record** a `.webm` video combining the **canvas animation** and **audio** output, then **download** it.

## Features

- **Audio File Input**  
  You pick a file from disk using `<input type="file">`.  
- **Green-Only Visualization**  
  A hue of 120 (green) that shifts brightness based on amplitude.  
- **Center-Out**  
  The grid is sorted by distance from center, so the **center** squares light up first.  
- **MediaRecorder**  
  Uses the [`canvas.captureStream()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream) and [`audioElement.captureStream()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/captureStream) to record audio + visual into a single `.webm`.  
- **TypeScript**  
  Includes type definitions for `captureStream`, so TypeScript won’t complain.
