# Agent Instructions

Guidelines for automated agents working on this repository.

## Quick Start

```bash
# Install dependencies
npm install

# Generate SSL certificates (required for audio capture)
# Using mkcert or openssl, create localhost-key.pem and localhost.pem

# Start development server
npm run dev
```

## Project Context

This is a **self-contained audio visualizer** built with Next.js. The entire application logic resides in a single file (`src/app/page.tsx`) for simplicity.

## Testing Checklist

When making changes, verify:

- [ ] Audio file drag-and-drop works
- [ ] Audio file selection via input works
- [ ] Play/Pause/Stop controls function correctly
- [ ] Timeline scrubbing works
- [ ] Visualization renders during playback
- [ ] Export to WebM completes successfully
- [ ] Cancel export works during recording

## Code Quality

```bash
npm run lint   # Check for linting errors
npm run build  # Ensure production build succeeds
```

## Common Tasks

### Adding a new visualization mode
1. Create a new rendering function in `page.tsx`
2. Add state to toggle between modes
3. Integrate into the `animate()` function

### Modifying the color scheme
The HSL color is defined in the animation loop:
```typescript
const light = 80 - 50 * adjustedFrac;
ctx.fillStyle = `hsl(200, 100%, ${light}%)`;
```
- Hue: 200 (blue)
- Saturation: 100%
- Lightness: varies from 80% (center) to 30% (edges)

### Changing grid dimensions
Modify these constants in `page.tsx`:
```typescript
const cols = 10;
const rows = 7;
const canvasWidth = 600;
const canvasHeight = 400;
```

## File Structure

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main application component |
| `src/app/layout.tsx` | Root layout with metadata |
| `src/app/globals.css` | Global styles and Tailwind |
| `server.js` | Custom HTTPS server |
| `public/` | Static assets |

## Constraints

- **No external UI libraries**: Use Tailwind CSS for styling
- **No state management libraries**: Keep state in React hooks
- **Single-page app**: All logic in one component file
- **HTTPS**: Required for MediaRecorder audio capture

## Error Handling

Common issues to watch for:

1. **AudioContext suspended**: Browser requires user gesture before audio playback
2. **captureStream not available**: Some browsers don't support audio element capture
3. **CORS issues**: Audio files must be same-origin or have proper CORS headers
