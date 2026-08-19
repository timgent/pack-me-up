# Deleting an item from a packing list: performance investigation

**Symptom reported:** deleting items from a packing list is slow to respond,
and the UI locks up for a moment. Suspected cause: the pod sync — either the
UI waiting on the write, or the sync burning CPU.

**Result:** reproduced, root-caused, instrumented, fixed and re-measured. Both
suspicions were right, in that order of size. The dominant cost was the UI
waiting on the pod write, and that write was three sequential network round
trips where one would do; the freeze on top of it is main-thread work (the
local database write and the RDF serialisation) running before the browser got
to paint the deletion. Measured on a 150-item list with a mobile-class CPU
throttle and 150 ms of pod latency, the row now leaves the screen in **79 ms
instead of 984 ms**.

## Reproduction method

`scripts/perf/delete-item-repro.mjs` (see `scripts/perf/README.md`), built in
the same shape as the existing `mobile-repro.mjs`: a standalone Playwright +
CDP script, deliberately outside `npm test` and `npm run test:e2e`. It seeds a
150-item list into a local Community Solid Server as a backup file, restores it
through the app's own Backups page, then deletes items from the list and
records, per delete:

- **perceived latency** — from the app's own `delete.click` mark, recorded
  inside the delete handler, to the animation frame in which the row actually
  left the DOM. This is the wait the user sits through.
- **longest frozen frame** — the largest gap between animation frames over that
  window: how long the UI was frozen, as opposed to merely slow.
- a **phase breakdown** from the profiling marks described below.
- long tasks and a CPU profile, as `mobile-repro.mjs` does.

Two knobs drive the attribution:

- `--podLatency` injects a round-trip delay on every request to the pod. A
  local CSS answers in ~2 ms, which no real user ever sees; a phone on mobile
  data sees 100–300 ms.
- `--cpu` applies a CDP CPU throttle.

Runs below use a 150-item list, `--cpu=4`, `--podLatency=150` unless stated.

## Profiling instrumentation added

`src/utils/profiling.ts` — opt-in timing marks, off unless
`localStorage['packMeUp.profiling'] === '1'`, so the cost in normal use is one
boolean check per call. Completed measurements go to
`window.__packMeUpProfile__` and the console, so a run can be read by eye or by
a script. Marks were added around the pod write's phases
(`pod.getPrimaryPodUrl`, `pod.save.ensureContainer`, `pod.save.serialize`,
`pod.save.turtle`, `pod.save.put`), the poll's read path, the local database
write, and the delete handler itself.

## What the profile showed

One delete, before the fix — offsets are milliseconds from the click:

```
     0ms  delete.click
     2ms  delete.setFormValues            6.9
    11ms  save.localDb                   99.2
   112ms  pod.getPrimaryPodUrl          188.2   ← network
   303ms  pod.save.ensureContainer      190.7   ← network
   495ms  pod.save.serialize             82.6   ← CPU
   579ms  pod.save.turtle                52.6   ← CPU
   639ms  pod.save.put                  186.7   ← network
   833ms  delete.done
```

The row was still on screen for all of it. `persistPackingList` awaited
`saveWithSyncPrevention`, which awaited the pod write, and only then updated
React state — so the item the user had just confirmed deleting sat there for
the whole of a local database write plus three sequential network round trips.

Two of those round trips were avoidable. Every single save resolved the user's
pod URL by fetching their WebID profile (`getPrimaryPodUrl`), and then asked
the server whether the container existed (`ensureContainerExists`) — for two
answers that cannot change while the app is open. Of 705 ms spent in the pod
write, 379 ms was these two questions and only 187 ms was the write itself.

Attribution, median perceived latency over three deletes:

| | `--podLatency=0` | `--podLatency=150` |
|---|---:|---:|
| `--cpu=1` | — | 593 ms |
| `--cpu=4` | 334 ms | 884 ms |

Removing the pod latency takes 550 ms off; removing the CPU throttle takes
291 ms off and drops the longest frozen frame from 161 ms to 42 ms. So: the
network round trips are the bulk of the wait, and the main-thread work is what
makes the wait feel like a freeze rather than a lag.

## Fix implemented

Four changes, each measured.

**1. The pod write no longer blocks the UI** (`useSyncCoordinator.ts`).
`saveWithSyncPrevention` now resolves as soon as the local database — the
guaranteed store — has the data, and pushes to the pod in the background. Pod
failures were already surfaced independently of this await, via `usePodSync`'s
`onSaveError`, so nothing is lost by not waiting for it. The save stays counted
as in-flight until the push settles, so a poll landing in the meantime still
can't apply its now-stale copy over the edit; the in-flight counter replaced a
boolean so two quick edits can't clear the guard out from under each other.

**2. Resolve the pod URL and the container once per session, not per save**
(`solidPod.ts`). `getPrimaryPodUrl` memoises the resolved pod URL per WebID,
sharing the in-flight request between simultaneous callers, and caching only an
answer actually read from the profile — a fallback or a failure is retried.
`ensureContainerExists` remembers containers already established. Both caches
are cleared by `resetPodSessionCaches()` on logout and after a pod-data
deletion. This takes two round trips out of every pod write and every poll.

**3. Push after the paint, not before** (`useSyncCoordinator.ts`). Even in the
background, serialising the list to RDF is ~100 ms of main-thread work, and
running it in the same task as the state update held up the paint of the
deletion — the freeze. The push now waits for an animation frame plus a task,
with a 100 ms timer as a floor so a hidden tab (which gets no animation frames)
still gets its data to the pod. This one change took perceived latency from
299 ms to 148 ms and the frozen frame from 151 ms to 78 ms.

**4. Render the edit before persisting it** (`view-packing-list.tsx`).
`persistPackingList` updates React state first and then writes; the saves
correct the state when they land and report their own failures. This takes the
local database write off the critical path too.

### Two correctness fixes the above required

Making the pod write best-effort exposed a hole it had been hiding: the app
could now reach a state where the local copy of a list was ahead of the pod's,
which previously only happened while a save was visibly in progress.

- **The login sync overwrote local lists with pod copies unconditionally**
  (`syncAllDataFromPod`) — "pod wins for conflicting IDs", with no timestamp
  comparison, unlike the question set beside it. An edit whose pod write hadn't
  landed before a reload was silently lost. It now merges the two copies with
  `mergePackingLists`, the same function the live sync uses, and pushes the
  result back up when the local copy came out ahead.
- **A pod poll could land before the page had read its local copy**
  (`view-packing-list.tsx`). With no local state to compare against,
  `shouldApplyPodData`'s fresh-load fallback let the pod copy win, which then
  overwrote the newer local copy in the database. Pod syncing on that page now
  waits until the local database has been consulted. This was reachable before
  these changes too — an edit made offline, then the list reopened — it just
  needed the pod to be behind, which the old blocking write made rare.

Both were caught by the e2e suite (F5, then C8's strict-mode match once the
list started updating before the modal closed — the preview now closes before
the save rather than after it). Both have unit tests.

### Before / after, measured with the harness

Same script, same seeded 150-item list, `--cpu=4 --podLatency=150`, four
deletes, medians:

| | perceived latency | longest frozen frame |
|---|---:|---:|
| before | 984 ms | 153 ms |
| after | **79 ms** | **107 ms** |

The shape of a delete afterwards, same format as above:

```
     0ms  delete.click
     3ms  delete.setFormValues            9.2
    14ms  save.localDb                  145.2
   (row gone at 79ms — before the database write has even finished)
   206ms  pod.save.ensureContainer        0     ← cached
   206ms  pod.save.serialize             69.9
```

Everything expensive now happens after the user has seen their edit.

## Further recommendations (not implemented)

1. **The remaining freeze is the local database write** (~145 ms at 4x
   throttle) plus the RDF serialisation (~70 ms). Both now run after the paint,
   so they no longer delay the deletion, but they still block the main thread
   immediately afterwards — a second delete inside that window waits. Both
   re-serialise the entire list for a one-item change.
2. **Coalesce rapid pod pushes.** Deleting five items in a row currently
   serialises and uploads the whole list five times. A short trailing debounce
   on the pod push (the local write must stay immediate) would collapse those
   into one.
3. **Reconsider the 5s poll interval**, as the questions-page investigation
   also suggested. Each poll is now a cheap conditional GET with one fewer round
   trip in front of it, but it is still a poll.
