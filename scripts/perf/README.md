# Performance repro harnesses

Three standalone diagnostic scripts, none part of `npm test` or
`npm run test:e2e`. All need a local Community Solid Server and the app's
production build being served.

- `mobile-repro.mjs` — main-thread blocking on the "My Questions & Items"
  page (below).
- `delete-item-repro.mjs` — how long deleting an item from a packing list
  takes to show on screen ("Deleting an item from a packing list", further
  down).
- `login-repro.mjs` — the wait and the freeze after logging in ("Logging in",
  last section).

## `mobile-repro.mjs`

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

## Deleting an item from a packing list

`delete-item-repro.mjs` measures the wait between confirming a deletion and
the row leaving the screen, and how long the UI is frozen while it happens.
Background and findings: `docs/packing-list-delete-performance.md`.

Unlike `mobile-repro.mjs` it needs no manual data setup — it seeds its own
backup file into the pod over the CSS account API and restores it through the
app's Backups page:

```
node scripts/perf/delete-item-repro.mjs --label=before --items=150 --deletes=4 --cpu=4 --podLatency=150
```

| flag | default | meaning |
|---|---|---|
| `--items` | `150` | size of the seeded list |
| `--deletes` | `4` | how many items to delete and time |
| `--cpu` | `4` | CDP CPU throttle multiplier |
| `--podLatency` | `150` | delay (ms) injected on every request to the pod |
| `--settleMs` | `4000` | how long to keep recording after each delete |
| `--label` | `delete-item` | output filename prefix |

`--podLatency` and `--cpu` are the attribution levers: if a number tracks the
first, the UI is waiting on the network; if it tracks the second, it is
main-thread work. A local pod answers in ~2ms, which is not a latency any real
user has, so measuring against it alone will hide a round-trip problem.

The script turns on the app's own profiling marks
(`localStorage['packMeUp.profiling']`, see `src/utils/profiling.ts`), so
`<label>.summary.json` carries a per-delete phase breakdown — local database
write, pod URL lookup, container check, RDF serialisation, PUT — alongside
`medianPerceivedMs` and `medianMaxFrameGapMs`. Against a build without those
marks it falls back to timing from the click, so before/after comparisons
across a revert still work.

## Logging in

`login-repro.mjs` measures what a user sits through after the OIDC redirect
drops them back on the app: how long the page is blank, when the lists show up,
and — the part that mattered — how long the UI is frozen once it is on screen.
Background and findings: `docs/login-performance.md`.

Like `delete-item-repro.mjs` it seeds its own data: it writes a backup into the
pod over the CSS account API and restores it through the app's Backups page, so
the pod ends up holding real RDF written by the app itself. The measured login
then runs in a **fresh browser context** — empty local database, full pod — which
is a first login on a new device.

```
node scripts/perf/login-repro.mjs --label=before --lists=25 --cpu=4 --podLatency=150
```

| flag | default | meaning |
|---|---|---|
| `--lists` | `25` | packing lists to seed into the pod |
| `--items` | `40` | items per seeded list |
| `--cpu` | `4` | CDP CPU throttle multiplier |
| `--podLatency` | `150` | delay (ms) injected on every request to the pod |
| `--settleMs` | `6000` | how long to keep recording after the lists appear |
| `--skipSeed` | off | reuse the pod contents from a previous run (much faster) |
| `--label` | `login` | output filename prefix |

`--cpu` and `--podLatency` are the attribution levers, same as above: a number
that tracks the throttle is main-thread work, one that tracks the latency is
the network.

The headline numbers in `<label>.summary.json`:

- `firstContentMs` — how long the page is blank.
- `blankScreenLongTaskMs` — how much of that blank stretch was CPU rather than
  waiting.
- `firstListMs` — when the lists are actually on screen.
- `maxFrameGapMs` / `longestTaskMs` — the freeze: the longest the main thread
  went without giving a frame back, once there was something on screen to
  freeze.
- `phases` — the app's own profiling marks grouped by label, so a slow login can
  be pinned to the pod URL lookup, a fetch, a parse or a deserialize.
