# Mobile performance repro harness

`mobile-repro.mjs` is a standalone Playwright + CDP script for measuring
main-thread blocking on a mobile-class device profile. It is **not** part of
`npm test` or `npm run test:e2e` — it's a diagnostic tool you run on demand
when investigating a perf regression, not a CI gate (it needs real seeded pod
data and takes 10-20s per run).

Background and findings from the investigation this was built for:
`docs/questions-page-mobile-performance.md`.

## What it does

1. Logs into a local Community Solid Server account through the app's real
   OIDC login UI (reuses the same flow as `e2e/helpers/login.ts`).
2. Restores a backup already sitting in that account's pod (see setup below)
   via the app's actual Backups page — so the local PouchDB and the pod both
   end up in the same state a real user's device would.
3. Resizes to a phone viewport, applies a CDP CPU throttle (`--cpu`, default
   6x — roughly a mid-range Android SoC vs. a dev laptop), and drives the
   Questions & Items page: expands question sections, scrolls, types into an
   "add item" composer.
4. Records:
   - Long tasks (`PerformanceObserver({type:'longtask'})`) with a "which
     phase of the interaction was running" label, so a multi-second block can
     be pinned to a specific action (or to background activity, if it lands
     between actions).
   - A CPU profile (`Profiler.start`/`stop` over CDP) with a self-time
     ranking by function name, to name the hot code path without opening
     DevTools by hand.
   - A Playwright trace (`.trace.zip`, viewable at `trace.playwright.dev` or
     `npx playwright show-trace`).

Two scenarios:
- `--scenario=logged-in` — normal logged-in state, pod polling active
  (`usePodSync`'s `pollInterval`).
- `--scenario=logged-out` — same local data, but logged out first, so pod
  polling is disabled. This is the control: it isolates "cost of rendering
  this page" from "cost of the recurring pod sync".

## One-time setup

1. Start a local CSS instance and create an account + pod (the `solid-dev`
   skill's `start.sh` does this, or do it by hand — see that skill).
2. Seed a backup file into the account's pod at
   `pack-me-up/backups/<name>.json` — the app's Restore flow reads it from
   there. `pod-seed.ts`-style client-credentials auth works for this; there's
   no UI for uploading a backup file directly. Any `BackupFile`-shaped JSON
   works (`{ createdAt, version: 1, questionSet, packingLists }`) — a real
   export from the app's own "Create Backup" button is the easiest source.
3. Build and serve the production bundle (measurements on `npm run dev` are
   skewed by HMR/dev-mode overhead):
   ```
   npm run build
   npm run preview -- --port 4173
   ```

## Running

```
PERF_CSS_ORIGIN=http://localhost:4000 \
PERF_CSS_EMAIL=test@example.com \
PERF_CSS_PASSWORD=test1234 \
node scripts/perf/mobile-repro.mjs --scenario=logged-in --cpu=6 --label=logged-in
```

Output lands in `scripts/perf/results/<label>.{summary.json,trace.zip,cpuprofile}`.
Env vars default to the values above, which match what `solid-dev`'s
`start.sh` provisions.

`--settleMs` (default `6000`) controls how long the script idles after the
scripted interaction, to let pod poll cycles land — bump it (e.g. `26000` for
~5 cycles at the default 5s poll interval) to check a fix holds over
multiple polls, not just the first one.

## Reading the output

`<label>.summary.json` has the headline numbers (`totalBlockingTimeMs`,
`longestTaskMs`, which phase each long task landed in, top functions by
sample hit count). For anything deeper, load `<label>.trace.zip` into
`npx playwright show-trace scripts/perf/results/<label>.trace.zip`, or open
`<label>.cpuprofile` in Chrome DevTools' Performance panel ("Load profile").
