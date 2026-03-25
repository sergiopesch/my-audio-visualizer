# Audio Visualizer

A real-time audio visualizer built with Next.js. Capture system audio or upload a file to see a radial ripple visualization on a dark canvas. Export your visualizations as WebM videos.

![Audio Visualizer Demo](public/Screen_Recording.gif)

## Features

- **System Audio Capture**: Visualize audio from any browser tab or application via `getDisplayMedia`
- **File Upload**: Drag & drop or browse for audio files
- **Radial Ripple Visualization**: Amplitude-driven grid cells illuminate from center outward with a blue-cyan gradient on a dark canvas
- **Adjustable Settings**: Real-time sensitivity and pixel size controls
- **Playback Controls**: Play/pause toggle, stop, and timeline scrubbing (file mode)
- **Video Export**: Record visualization + audio to WebM with progress tracking (file mode)
- **Dark UI**: Glassmorphism cards, ambient canvas glow, custom-styled controls

## Tech Stack

- [Next.js 15](https://nextjs.org/) - React framework with App Router
- [React 19](https://react.dev/) - UI library
- [TypeScript 5](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS 3.4](https://tailwindcss.com/) - Styling
- Web Audio API - Audio analysis via `AnalyserNode`
- Canvas API - Visualization rendering
- MediaRecorder API - Video export
- Screen Capture API - System audio via `getDisplayMedia`

## Getting Started

### Prerequisites

- Node.js 18+
- SSL certificates for local HTTPS (required for system audio capture and video export)

### Generate SSL Certificates

Generate local certificates using [mkcert](https://github.com/FiloSottile/mkcert):

```bash
# Install mkcert (macOS)
brew install mkcert
mkcert -install

# Generate certificates in the project root
mkcert localhost
```

This creates `localhost.pem` and `localhost-key.pem` in the project directory.

### Installation

```bash
git clone https://github.com/sergiopesch/my-audio-visualizer.git
cd my-audio-visualizer
npm install
npm run dev
```

Open [https://localhost:3000](https://localhost:3000) in your browser.

## Usage

1. **Choose a source**: Select "System Audio" to capture from a tab/app, or "Upload File" to load an audio file
2. **System Audio**: Grant screen sharing permission (check "Share audio"), and the visualizer starts immediately
3. **File Mode**: Use play/pause, stop, and the timeline to control playback
4. **Settings**: Click the settings icon to adjust sensitivity and pixel size in real-time
5. **Export** (file mode): Click the download icon to record as WebM video

## How It Works

1. Audio is routed through an `AnalyserNode` (FFT size 1024, smoothing 0.3)
2. Frequency data determines the peak amplitude, normalized to `[0, 1]`
3. Amplitude is scaled by the sensitivity multiplier to set a threshold
4. Grid cells within the threshold illuminate from center outward
5. HSL colors shift from bright cyan (center) to deep blue (edges)
6. 1px gaps between cells and subtle flicker add depth

### Audio Sources

| Source | API | Pipeline |
|--------|-----|----------|
| System | `getDisplayMedia({ audio: true })` | MediaStream -> MediaStreamSource -> AnalyserNode |
| File | `<audio>` element | Audio element -> MediaElementSource -> AnalyserNode -> destination |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start HTTPS development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Browser Support

- Chrome/Edge 80+
- Firefox 76+ (system audio may require additional flags)
- Safari 14+ (limited `getDisplayMedia` audio support)

System audio capture requires `getDisplayMedia` with audio support. Video export requires `HTMLMediaElement.captureStream()`.

## License

MIT
