# Project Instructions

## Mission

Build and maintain a real-time audio visualizer web application. Users can capture system audio or upload files to see a radial ripple visualization, with adjustable settings and WebM video export.

## Principles

- Keep the codebase simple and self-contained
- Prioritize browser performance and compatibility
- No unnecessary dependencies or abstractions
- Every change must be testable in a browser

## Architecture

```
src/app/
  page.tsx        # Main client component (all logic: audio, canvas, UI)
  layout.tsx      # Root layout with metadata
  globals.css     # Design system: CSS variables, glass effects, animations, custom inputs
server.js         # Custom HTTPS server (required for getDisplayMedia and MediaRecorder)
```

Single-page architecture: all application logic lives in `src/app/page.tsx`.

### Key technologies
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript 5
- **UI**: React 19, Tailwind CSS 3.4
- **Browser APIs**: Web Audio API, Canvas API, MediaRecorder API, Screen Capture API

### Audio pipeline (dual-source)

**System audio:**
```
getDisplayMedia({ audio: true }) -> MediaStream -> MediaStreamSource -> AnalyserNode -> Canvas
```

**File upload:**
```
<audio> element -> MediaElementSource -> AnalyserNode -> destination -> Canvas
```

Both sources connect to the same `AnalyserNode`. System audio does not route to destination (avoids echo).

### Visualization
- Dynamic grid: cols/rows computed from `canvasWidth / pixelSize`
- Dark canvas background (`#09090b`) with 1px gaps between cells
- Blue-cyan HSL gradient: hue 200-220, bright center to deep edges
- Sensitivity multiplier scales the amplitude threshold
- Subtle random flicker for organic feel

### UI design system (`globals.css`)
- Pure black (`#000`) base with CSS custom properties
- `.glass` class: glassmorphism with `backdrop-filter: blur(12px)`
- `.canvas-glow` / `.canvas-glow.active`: ambient glow around canvas
- Custom range slider styling with glowing blue thumb
- `.animate-fade-in`: entry animation for views
- `.live-dot`: pulse-glow animation for system audio indicator

## Constraints

- **HTTPS required**: Both `getDisplayMedia` and `MediaRecorder` require secure context
- **No external UI libraries**: Tailwind CSS + custom CSS only
- **No state management libraries**: React hooks only
- **Single-component architecture**: All logic in `page.tsx` unless complexity demands splitting
- **Browser support**: Chrome/Edge 80+, Firefox 76+, Safari 14+

## Engineering standards

- Small, focused changes
- Clear, readable code over clever code
- No unnecessary abstractions for one-time operations
- Test with various audio files and formats after changes
- Verify both system audio and file upload modes after changes

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
- System audio capture works (with "Share audio" enabled)
- Audio drag-and-drop works
- File input selection works
- Play/Pause/Stop controls function (file mode)
- Timeline scrubbing works (file mode)
- Visualization renders during playback (both modes)
- Settings panel: sensitivity and pixel size adjust in real-time
- Export to WebM completes (file mode)
- Cancel export works during recording
- Back button returns to source picker and cleans up resources

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
