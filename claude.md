# Claude Development Guidelines

This document provides guidelines for AI assistants working on the Audio Visualizer project.

## Project Overview

A Next.js 15 application that creates real-time audio visualizations using the Web Audio API. Users can drag and drop audio files to see a radial ripple visualization and export the result as a WebM video.

## Tech Stack

- **Framework**: Next.js 15.5.9 with App Router
- **Language**: TypeScript 5
- **UI**: React 19, Tailwind CSS 3.4
- **APIs**: Web Audio API, Canvas API, MediaRecorder API

## Architecture

```
src/app/
├── page.tsx      # Main client component with all visualization logic
├── layout.tsx    # Root layout with metadata
├── globals.css   # Tailwind and CSS variables
└── favicon.ico   # App icon
```

The application follows a single-page architecture with all logic contained in `page.tsx`:

- **Audio Processing**: Web Audio API with AnalyserNode for frequency analysis
- **Visualization**: Canvas-based radial ripple effect with HSL color gradients
- **Export**: MediaRecorder API for WebM video capture

## Key Patterns

### State Management
All state is managed via React hooks (`useState`, `useRef`). No external state library is used.

### Audio Analysis
```typescript
// FFT configuration
analyser.fftSize = 1024;
analyser.smoothingTimeConstant = 0.3;
```

### Visualization Grid
- 10 columns x 7 rows cell grid
- Canvas size: 600x400 pixels
- Cells illuminate from center outward based on audio amplitude

## Development Commands

```bash
npm run dev    # Start HTTPS dev server (requires SSL certs)
npm run build  # Build for production
npm run lint   # Run ESLint
```

## Important Notes

1. **HTTPS Required**: The export feature requires HTTPS. The custom `server.js` handles this using local SSL certificates (`localhost-key.pem`, `localhost.pem`).

2. **Browser Compatibility**: Uses feature detection for `captureStream` and `mozCaptureStream` for Firefox support.

3. **Performance**: Animation uses `requestAnimationFrame` for 60fps rendering. The cell distance array is memoized to avoid recalculation.

## When Making Changes

- Keep the single-file architecture for simplicity
- Maintain the clean, minimal UI aesthetic
- Test with various audio files (different lengths, formats)
- Verify export functionality works after changes
- Ensure responsive design is preserved
