---
name: visualization-dev
description: Develop and modify audio visualization effects and rendering logic
---

# Overview

Handles creation and modification of audio-reactive visualization effects using Canvas API and Web Audio API frequency data.

# When to use

- When adding a new visualization mode
- When modifying colors, grid, or animation behavior
- When changing how audio data maps to visual output

# Capabilities

- Design new Canvas-based visualization effects
- Modify the audio-to-visual mapping pipeline
- Adjust FFT parameters (fftSize, smoothingTimeConstant)
- Create new color schemes and animation patterns
- Add visualization mode switching

# Instructions

1. Understand the current audio pipeline:
   - Audio -> AnalyserNode (fftSize=1024, smoothing=0.3)
   - getByteFrequencyData -> max amplitude -> threshold
   - Cells within threshold illuminate with HSL gradient
2. For new visualization modes:
   - Create a new rendering function
   - Add state to toggle between modes
   - Integrate into the `animate()` function
3. For color changes:
   - Modify the HSL calculation in the cell rendering loop
   - Current: `hsl(200, 100%, ${80 - 50 * fraction}%)`
4. For grid changes:
   - Modify `cols`, `rows`, `canvasWidth`, `canvasHeight`
   - The cells array will recompute via useMemo
5. Test with various audio genres (bass-heavy, vocal, electronic)

# Constraints

- Keep rendering inside requestAnimationFrame
- Target 60fps; avoid heavy computation in the animation loop
- Pre-compute what you can outside the loop (use useMemo)
- Maintain the existing animation cleanup pattern

# Output format

- Description of the visual effect
- Code changes with explanations
- Testing notes for different audio types
