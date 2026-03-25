# Project Instructions

## Mission

Build and maintain a real-time audio visualizer web application. Users drag-and-drop audio files to see a radial ripple visualization driven by frequency data, with the ability to export the result as a WebM video.

## Principles

- Keep the codebase simple and self-contained
- Prioritize browser performance and compatibility
- No unnecessary dependencies or abstractions
- Every change must be testable in a browser

## Architecture

```
src/app/
  page.tsx        # Main client component (all visualization logic)
  layout.tsx      # Root layout with metadata
  globals.css     # Tailwind and CSS variables
server.js         # Custom HTTPS server (required for MediaRecorder)
```

Single-page architecture: all application logic lives in `src/app/page.tsx`.

### Key technologies
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript 5
- **UI**: React 19, Tailwind CSS 3.4
- **Browser APIs**: Web Audio API (AnalyserNode), Canvas API, MediaRecorder API

### Audio pipeline
```
Audio file -> <audio> element -> AudioContext -> MediaElementSource -> AnalyserNode -> FFT data -> Canvas rendering
```

### Visualization
- 10x7 grid of cells, sorted by distance from center
- Cells illuminate outward based on amplitude threshold
- HSL color gradient: light blue (center, 80%) to deep blue (edges, 30%)
- Subtle random flicker for organic feel

## Constraints

- **HTTPS required**: MediaRecorder audio capture requires secure context. The custom `server.js` handles this with local SSL certs (`localhost-key.pem`, `localhost.pem`)
- **No external UI libraries**: Use only Tailwind CSS
- **No state management libraries**: React hooks only (`useState`, `useRef`, `useCallback`, `useMemo`)
- **Single-component architecture**: Keep all logic in `page.tsx` unless complexity demands splitting
- **Browser support**: Chrome/Edge 80+, Firefox 76+, Safari 14+

## Engineering standards

- Small, focused changes
- Clear, readable code over clever code
- No unnecessary abstractions for one-time operations
- Test with various audio files and formats after changes
- Verify export functionality after any audio/canvas changes

## Workflow

1. Understand the task fully before writing code
2. Read the relevant source files
3. Plan the minimal change needed
4. Implement the change
5. Validate with `npm run build` and `npm run lint`

## Testing

Required checks before considering work complete:

```bash
npm run lint    # No ESLint errors
npm run build   # Production build succeeds
```

### Manual verification checklist
- Audio drag-and-drop works
- File input selection works
- Play/Pause/Stop controls function
- Timeline scrubbing works
- Visualization renders during playback
- Export to WebM completes
- Cancel export works during recording

## Documentation

- README.md must reflect actual current functionality
- No aspirational features or roadmap items in docs
- Keep inline comments minimal; only where logic is non-obvious

## Permissions philosophy

- Least privilege for auto-mode
- Never expose SSL certificates or secrets
- No destructive filesystem or git operations without confirmation

## Auto mode rules

- Allow: read, write, edit, glob, grep, npm scripts, git read commands
- Deny: sudo, rm -rf, secret file access, piped curl/wget execution
- Prefer constrained autonomy over full shell access

## Anti-goals

- Do NOT turn this into a multi-page application without explicit request
- Do NOT add external state management (Redux, Zustand, etc.)
- Do NOT add a backend API or database
- Do NOT add authentication or user accounts
- Do NOT over-engineer the single-file architecture prematurely

## Definition of done

- Code works in the browser
- `npm run build` passes
- `npm run lint` passes
- Manual testing checklist verified
- No regressions to existing features
- README updated if user-facing behavior changed
