---
name: testing
description: Validate that the application builds, lints, and functions correctly
---

# Overview

Runs automated checks and guides manual testing for the audio visualizer.

# When to use

- After any code change
- Before committing or creating a PR
- When asked to verify the application works

# Capabilities

- Run lint and build checks
- Guide manual browser testing
- Verify export functionality requirements

# Instructions

1. Run `npm run lint` - fix any errors
2. Run `npm run build` - fix any build failures
3. Guide the user through the manual checklist:
   - Audio drag-and-drop
   - File input selection
   - Play/Pause/Stop controls
   - Timeline scrubbing
   - Visualization renders during playback
   - Export to WebM completes
   - Cancel export works

# Constraints

- No automated browser tests exist currently; rely on build + lint + manual verification
- Do not introduce a test framework unless explicitly requested

# Output format

- Pass/fail status for each automated check
- Manual checklist with items to verify
