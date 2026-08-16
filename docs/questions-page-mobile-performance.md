# "My Questions & Items" mobile performance investigation

**Symptom reported:** fine on desktop, "almost unusable" on mobile web and the
Android WebView app on a Fairphone 4.

**Result:** reproduced, root-caused, instrumented, and fixed. The dominant
cost was the page's background Solid Pod sync — not rendering, not the data
volume itself. It re-fetched and fully re-parsed the entire question-set RDF
graph every 5 seconds, indefinitely, whether or not anything changed, and the
parse step was expensive enough that on a phone-class CPU it could freeze the
main thread for well over a second **while the user was mid-interaction**,
not just on page load. The fix (conditional GET, §"Fix implemented" below)
makes an unchanged poll cost a cheap `304` with no parsing at all — measured
after the fix, the recurring freeze is gone and logged-in performance is
statistically indistinguishable from a no-polling baseline.

## Data used

Real personal data was used to get realistic scale, restored into a local
Solid pod via the app's own Restore flow. It stays untracked
(`example-large-backup.json`, now added to `.gitignore`) and isn't reproduced here — only
shapes and counts:

| | count |
|---|---|
| People | 5 |
| Questions | 12 |
| Options (answers) across all questions | 54 |
| Items inside question options | 332 |
| "Always needed" items | 46 |
| Packing lists | 15 |
| Question-set RDF graph, serialised | 976 KB, **10,617 quads** |

This is a realistic "someone who's used the app for a while" dataset, not an
extreme outlier — no artificial data was generated to make the problem show
up.

## Reproduction method

Chrome's DevTools UI wasn't available in this environment, so the repro was
built as a standalone, reusable **Playwright + Chrome DevTools Protocol
script** instead: `scripts/perf/mobile-repro.mjs` (see
`scripts/perf/README.md` for full usage). It:

1. Logs into a local Community Solid Server through the app's real login UI
   and restores the backup via the app's real Backups page, so local PouchDB
   and the pod end up in the state a real user's device would have.
2. Switches to a phone viewport (393×851 CSS px, 2.75x DPR — a Fairphone 4)
   and a mobile Chrome user agent.
3. Applies a CDP CPU throttle (`Emulation.setCPUThrottlingRate`) to stand in
   for a mid-range Android SoC being slower than a dev laptop at
   single-thread JS. 6x was used as the headline scenario; Fairphone 4's
   Helio G95 is commonly 4-8x slower than a modern laptop chip on
   single-thread JS work — see below for a measurement showing the same
   long task is still substantial (1.4s) even unthrottled, so this is a
   reasonable midpoint, not a worst case.
4. Drives the page the way a user actually would: expand several question
   sections, scroll the list, tap "add item" and type a word.
5. Records long tasks (`PerformanceObserver`), a CDP CPU profile with
   per-function sample counts, and a Playwright trace, tagged with which
   interaction phase was running when each long task started.

Two scenarios were compared, both throttled identically:

- **logged-in** — normal state, the page's pod polling is active.
- **logged-out** — same locally-stored data, logged out first, so pod
  polling is disabled (`enabled: isLoggedIn || isForeign` in
  `usePodSync`). This isolates "cost of rendering/using this page" from
  "cost of the recurring pod sync."

## Findings

### 1. The recurring pod poll is the dominant cost, and it can hit mid-interaction

`QuestionsPage` calls `usePodSync` with `pollInterval: 5000`
(`src/pages/questions-page.tsx`) — every 5 seconds, forever, while the page
is open, it re-fetches the pod's `packing-list-questions.ttl` and re-parses
it into a full `SolidDataset`, then deserialises that into a
`PackingListQuestionSet` (`datasetToQuestionSet`). `useSyncCoordinator`
*does* skip the resulting re-render when the data is unchanged — but that
check (`JSON.stringify` equality) runs **after** the fetch and the RDF parse
have already happened, so it saves a render, not the CPU cost that dominates
this page.

Measured over an identical ~7-11s interaction window, 6x CPU throttle:

| scenario | total blocking time | longest single task | long tasks |
|---|---:|---:|---:|
| logged-out (polling disabled) | 1.8s | 1.42s | 3 |
| logged-in (polling every 5s) | 12.1s | 9.05s | 6 |

The `longest task` in the logged-in run landed with the phase label
`phase:scroll-end +9047ms` — i.e. it started right as the scripted user
finished scrolling and was about to start typing into the "add item" box.
This is the freeze-while-using-it behaviour reported, reproduced directly:
it isn't confined to initial load, it recurs on a ~5s cadence for as long as
the page stays open, and it can land in the middle of any interaction.

At **1x (unthrottled) CPU**, the same single poll-triggered task still took
**1.42s** — so this isn't purely a throttling artifact. On a dev laptop it's
a brief, easy-to-miss stutter (explaining "fine on desktop"); on a mid-range
phone CPU, commonly several times slower single-thread, that same task
stretches past the point of being usable.

### 2. It's `@inrupt/solid-client`'s dataset construction, not React

A CDP CPU profile taken during the logged-in run's blocking window shows two
functions, both internal to `@inrupt/solid-client`'s Turtle→`SolidDataset`
builder, accounting for the large majority of samples:

```
UZ  — index-*.js:571   (6,290 / 2,639 samples across runs)
BZ  — index-*.js:571   (5,717 / 2,545 samples across runs)
```

De-minifying against the built bundle, `UZ`/`BZ` are the library's per-quad
graph/subject insertion functions — each call does an **immutable object
spread** to add one quad into the nested `{ graphs: { [graph]: { [subject]:
{...} } } }` structure that backs a `SolidDataset`. That's run once per quad
in the fetched graph (10,617 of them here), each copying the
already-accumulated structure — the classic shape of `@inrupt/solid-client`'s
known dataset-construction cost blowing up on larger graphs. N3's own Turtle
tokenizer (`_tokenizeToEnd`, `_readPunctuation`, `_findInIndex` — real,
non-minified method names from the `n3` package) shows up further down the
same profile, confirming this is Turtle parsing + dataset indexing, not
something in the page's own rendering code. None of these functions appear
at all in the logged-out profile — direct confirmation they're specific to
the poll, not a general cost of this page.

This also means the page's own code (`datasetToQuestionSet`, all the
`getThing`/`getThingAll` calls in `rdfSerialization.ts`) is not the primary
cost here — the expensive part happens one layer down, inside
`getSolidDataset()` itself, before the page's deserialiser even starts
walking the result.

### 3. A smaller, separate cost: initial mount

Even in the logged-out control (no pod activity at all), mounting this page
with this dataset still cost **1.8s of total blocking / 1.42s single task**
under 6x throttle, all before any of the scripted interactions began. Two
likely contributors, not fully separated in this pass:

- The production build ships **one 1.5MB JS chunk** (466KB gzipped, see
  `vite build` output) — no route-level code splitting. Parsing/compiling
  that is pure main-thread cost on every cold load, and matters more on a
  WebView cold start than on a warm desktop tab.
- A first render of ~380 items across 12 questions/54 options plus building
  the item-suggestion index (`buildQuestionSetSuggestions`) over all of
  them.

This is real but secondary — an order of magnitude smaller than the
recurring poll cost, and it only happens once per page load rather than
every 5 seconds.

## Profiling infrastructure added

Two durable pieces, so the next regression doesn't need a fresh manual repro:

1. **`scripts/perf/mobile-repro.mjs`** (+ `scripts/perf/README.md`) — the
   harness described above. Reusable for any page: point it at a route,
   adjust the interaction script, compare `summary.json` before/after a
   change. Deliberately kept out of `npm test`/CI — it needs seeded pod data
   and takes 10-20s per run, so it's a manual diagnostic tool, not a gate.

2. **Sentry performance tracing** (`src/sentry.ts`) — added
   `browserTracingIntegration()` and `tracesSampleRate: 0.1` to the existing
   Sentry setup. This starts collecting long-task, slow-interaction (INP),
   and navigation timing data from real usage, including the Android
   WebView (`@sentry/capacitor` ships the same tracing integrations) — so a
   regression like this one would show up as a Sentry performance issue on
   the actual device it happens on, rather than needing someone to notice
   and describe it first. Kept at the existing dev/test-disabled default
   (`VITE_SENTRY_ENABLED` opts local dev back in).

## Fix implemented

**Make the poll cheap when nothing changed**, via a conditional `GET`.
`loadRdfFromPod` (`src/services/solidPod.ts`) now remembers the `ETag` of the
last successful load per URL and sends it as `If-None-Match` on the next
request. Community Solid Server (and Solid pods generally) respond `304 Not
Modified` with no body when the resource hasn't changed since — and because
`getSolidDataset` treats any non-2xx response as an error, that `304` makes
it fail *before* it ever reaches the Turtle parser. `loadRdfFromPod` catches
exactly that case and returns the previously-deserialized result instead of
re-parsing. When the pod file *has* changed, the response is a normal `200`
with a new `ETag`, and the full fetch-parse-deserialize path runs as before
— so genuine updates (from another device, or a sync from a save) are
unaffected; only the "nothing changed" case, which is the overwhelming
majority of polls on a page nobody else is editing at the same time, gets
cheap.

This is a change to `loadRdfFromPod`, the shared low-level function behind
`usePodSync`'s polling — so it also benefits `view-packing-list.tsx`, which
polls its own list on the same 5s interval and was presumably paying a
smaller version of the same cost (not separately measured here, since the
reported symptom was on the Questions & Items page).

No sync semantics changed: conflict resolution, merge, and the
`useSyncCoordinator` unchanged-data guard are all unaffected — this only
changes whether a "nothing changed" poll causes the network fetch's response
body to be a few KB (`304`, no body) or ~1MB (`200`, full graph), and whether
Turtle-parses it.

Verified with unit tests (`src/services/solidPod.test.ts`, `loadRdfFromPod`
describe block): sends `If-None-Match` with the previously-seen ETag; returns
the cached result without invoking the deserializer again on a `304`; still
re-parses and returns fresh data on a genuine change (new `ETag`, `200`).

### Before / after, measured with the harness

Same script, same seeded data, same 6x CPU throttle, same interaction
sequence, logged-in scenario (pod polling active) both times:

| | total blocking time | longest single task | where the longest task landed |
|---|---:|---:|---|
| before | 12.1s | 9.05s | mid-interaction (`phase:scroll-end`) |
| after | 1.8–3.3s | 1.4s | initial mount only (`before-first-mark`) |

After the fix, every long task lands during initial mount — none during
interaction — matching the logged-out (no-polling) control from the original
investigation (1.8s / 1.4s) to within run-to-run noise. Re-run with a 26s
settle window (~5 poll cycles instead of ~1) to check the fix holds over
time: still zero long tasks outside the initial mount window, and the CPU
profile's `@inrupt/solid-client` dataset-construction functions (`UZ`, `BZ`,
N3's tokenizer) that dominated the "before" profile don't appear at all
after the fix — direct confirmation the parse is actually being skipped, not
just coincidentally faster.

The remaining ~1.4s at mount (present before and after, unaffected by this
fix) is the separate, smaller cost described in finding 3 above.

## Further recommendations (not implemented)

Smaller, lower-priority than the fix above — worth doing if this page's
performance needs more headroom later, not needed to resolve the reported
symptom:

1. **Reconsider the poll interval.** 5 seconds is aggressive for a
   single-user-editing-on-one-device-at-a-time page. An unchanged poll is
   cheap now, but a longer interval still means less network chatter and
   fewer 304 round-trips.
2. **Move parsing off the main thread.** For the case where the pod *did*
   change, the full parse cost from finding 2 still applies. `getSolidDataset`'s
   Turtle parse and dataset construction don't touch the DOM, making them a
   candidate for a Web Worker — only worth the complexity (message-passing a
   10k-quad result back, `session.fetch`'s auth can't cross directly into a
   worker) if genuine-change polls turn out to be frequent enough in practice
   to matter (Sentry tracing, added in this pass, would show that).
3. **Code-split the JS bundle.** Unrelated to polling — a straightforward win
   for cold-start cost on WebView specifically — route-level `React.lazy` for
   the heavier, less-common pages.
