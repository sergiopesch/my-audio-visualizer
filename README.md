# My Audio Visualizer

A real-time audio visualizer built with Next.js that creates a radial ripple effect synchronized to your music. Export your visualizations as WebM videos.

![Audio Visualizer Demo](public/Screen_Recording.gif)

## Features

- **Drag & Drop**: Load audio files by dragging them onto the interface
- **Radial Ripple Visualization**: Audio amplitude drives a grid-based ripple effect from the center outward
- **Playback Controls**: Play, pause, stop, and timeline scrubbing
- **Video Export**: Record visualization + audio to WebM format with progress tracking

## Tech Stack

- [Next.js 15](https://nextjs.org/) - React framework with App Router
- [React 19](https://react.dev/) - UI library
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- Web Audio API - Audio analysis
- Canvas API - Visualization rendering
- MediaRecorder API - Video export

## Getting Started

### Prerequisites

- Node.js 18+
- SSL certificates for local HTTPS (required for video export)

### Generate SSL Certificates

The video export feature requires HTTPS. Generate local certificates using [mkcert](https://github.com/FiloSottile/mkcert):

```bash
# Install mkcert (macOS)
brew install mkcert
mkcert -install

# Generate certificates
mkcert localhost
# Rename to expected filenames
mv localhost.pem localhost.pem
mv localhost-key.pem localhost-key.pem
```

### Installation

```bash
# Clone the repository
git clone https://github.com/sergiopesch/my-audio-visualizer.git
cd my-audio-visualizer

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [https://localhost:3000](https://localhost:3000) in your browser.

## Usage

1. **Load Audio**: Drag and drop an audio file onto the drop zone, or click to browse
2. **Play**: Click the play button to start visualization
3. **Control**: Use pause/stop buttons or scrub the timeline
4. **Export**: Click the export button to record your visualization as a WebM video

## How It Works

The visualizer uses the Web Audio API to analyze frequency data in real-time:

1. Audio is routed through an `AnalyserNode` with FFT analysis
2. Frequency data determines the amplitude threshold
3. A 10x7 grid of cells illuminates from center outward based on amplitude
4. HSL colors create a gradient from light blue (center) to deep blue (edges)
5. Subtle flicker effects add organic movement

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start HTTPS development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Browser Support

- Chrome/Edge 80+
- Firefox 76+
- Safari 14+

Note: Video export requires browser support for `HTMLMediaElement.captureStream()`.

## License

MIT
