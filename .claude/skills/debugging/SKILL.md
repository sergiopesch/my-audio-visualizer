---
name: debugging
description: Diagnose and fix runtime issues in the audio visualizer
---

# Overview

Systematically diagnoses issues related to audio playback, visualization rendering, and video export.

# When to use

- When a feature is not working as expected
- When the user reports a bug
- When build or lint errors occur

# Capabilities

- Trace audio pipeline issues (AudioContext state, source connections)
- Debug Canvas rendering problems
- Diagnose MediaRecorder/export failures
- Fix React lifecycle issues (stale closures, missing cleanup)

# Instructions

1. Reproduce or understand the issue from the user's description
2. Read the relevant code sections
3. Check common failure points:
   - AudioContext suspended (needs user gesture)
   - captureStream not available (browser support)
   - CORS issues with audio files
   - Missing useEffect cleanup causing memory leaks
   - Stale closure in animation loops
4. Identify root cause
5. Implement minimal fix
6. Verify with `npm run build` and `npm run lint`

# Constraints

- Fix the root cause, not symptoms
- Do not refactor unrelated code while debugging
- Keep fixes minimal and focused

# Output format

- Root cause explanation
- Fix applied with file path and description
- Verification steps
