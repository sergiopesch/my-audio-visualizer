---
name: security-review
description: Review code for security vulnerabilities and safe browser API usage
---

# Overview

Checks for security issues specific to a client-side audio application using browser APIs.

# When to use

- Before deploying or releasing
- When adding new browser API usage
- When handling user-provided files

# Capabilities

- Review file handling for injection risks
- Check SSL/HTTPS configuration
- Verify safe use of ObjectURLs and Blob handling
- Check for XSS in dynamic content
- Review Content Security Policy compatibility

# Instructions

1. Check file input handling (drag-and-drop and file picker)
2. Verify ObjectURLs are revoked when no longer needed
3. Ensure no user input is rendered as raw HTML
4. Check that SSL certificates are not committed to the repo
5. Verify .gitignore covers sensitive files (*.pem, .env)
6. Review server.js for secure HTTPS configuration

# Constraints

- This is a client-side app; focus on browser security model
- Do not add server-side security measures unless needed
- Keep changes minimal

# Output format

- List of findings with severity (critical/warning/info)
- Recommended fixes
- Verification steps
