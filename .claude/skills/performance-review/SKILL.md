---
name: performance-review
description: Analyze and optimize rendering and audio processing performance
---

# Overview

Identifies and resolves performance bottlenecks in the animation loop, audio processing, and Canvas rendering.

# When to use

- When visualization is janky or dropping frames
- When asked to optimize performance
- When reviewing animation or rendering code

# Capabilities

- Analyze requestAnimationFrame loop efficiency
- Identify unnecessary Canvas redraws
- Optimize FFT data processing
- Review React re-render triggers
- Check for memory leaks (ObjectURLs, streams, contexts)

# Instructions

1. Read the animation loop and rendering code
2. Check for:
   - Unnecessary object creation inside animation loop
   - Canvas context calls that could be batched
   - useMemo/useCallback missing where beneficial
   - State updates that trigger unnecessary re-renders
   - Memory leaks from unreleased resources
3. Profile against 60fps target
4. Suggest targeted optimizations

# Constraints

- Do not premature-optimize; only address measurable issues
- Keep the single-file architecture
- Maintain visual quality while optimizing

# Output format

- List of identified bottlenecks with impact assessment
- Recommended fixes with code examples
- Expected improvement
