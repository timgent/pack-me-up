---
name: solid-dev
version: 1.0.0
description: |
  Start a local Community Solid Server (CSS) for manual E2E testing.
  Launches CSS on port 4000, creates a test account and pod, then prints
  credentials and the OIDC issuer URL ready to paste into the app.
allowed-tools:
  - Bash
---

# solid-dev: Local Solid Server for E2E Testing

Starts Community Solid Server (in-memory, ephemeral) and provisions a test account.

## Instructions

Run the start script:

```bash
bash .claude/skills/solid-dev/start.sh
```

> **Note:** Data is in-memory — all pod content is lost when the server stops.
> Re-run the script to get a fresh server with a clean account.
