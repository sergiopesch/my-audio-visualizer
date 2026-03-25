---
name: code-review
description: Review code changes for bugs, performance issues, and adherence to project standards
---

# Overview

Reviews code for correctness, performance, and consistency with the project's single-component architecture and browser API usage patterns.

# When to use

- When reviewing a PR or set of changes
- When asked to check code quality
- Before finalizing any significant change

# Capabilities

- Identify bugs in audio pipeline logic (AudioContext, AnalyserNode, MediaRecorder)
- Check Canvas rendering performance
- Verify React hook usage (dependency arrays, cleanup functions)
- Ensure Tailwind CSS consistency
- Detect browser compatibility issues

# Instructions

1. Read the changed files completely
2. Check for correct React hook dependency arrays
3. Verify event listener cleanup in useEffect returns
4. Check AudioContext lifecycle (creation, suspension, resumption)
5. Ensure Canvas operations are efficient (no unnecessary redraws)
6. Verify TypeScript types are correct
7. Check for memory leaks (ObjectURLs, MediaStreams, AudioContexts)
8. Run `npm run lint` and `npm run build`

# Constraints

- Do not suggest architectural rewrites unless explicitly asked
- Do not add unnecessary type annotations or comments
- Focus on correctness and performance, not style preferences

# Output format

- List issues found with file path, line number, and severity (critical/warning/info)
- Provide fix suggestions inline
- Summarize overall assessment
