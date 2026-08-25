# The app freezes for a few seconds after logging in

## The report

> when you first login the app freezes for a bit, presumably while data syncs

"Presumably while data syncs" was half right. The sync was the trigger, but the
cost was not the network and it was not the amount of data being downloaded —
it was one function inside `@inrupt/solid-client` turning the downloaded Turtle
into the shape the app reads.

## Measuring it

`scripts/perf/login-repro.mjs` (see `scripts/perf/README.md`) logs in through
the app's real OIDC flow with a fresh browser profile — an empty local database
and a full pod, i.e. a *first* login on a device — and records:

- when anything is first painted, and when the lists actually appear;
- long tasks and the longest gap between animation frames, which is how long
  the UI was frozen rather than merely slow;
- the app's own profiling marks (`src/utils/profiling.ts`), broken down per
  phase;
- a CPU profile, so the hot function can be named.

Two flags separate the two candidate explanations. `--podLatency` adds a delay
to every pod request; `--cpu` throttles the main thread. If a number tracks the
first, the app is waiting on the network. If it tracks the second, it is
main-thread work.

Against a pod holding 25 lists (40 items each) and one question set:

| | 1× CPU | 4× CPU |
|---|---|---|
| longest frozen frame | 1,080ms | 4,506ms |

Scaling with the CPU throttle and not with pod latency: **main-thread work**.
Not a sync waiting on the pod — a blocked thread. The whole of it was a single
long task of 4.5s, starting right after the app first painted, with the nav bar
on screen and unresponsive.

## What was in the task

The CPU profile put almost all of it in one minified function alongside
`_addToIndex` / `_findInIndex` / `_tokenizeToEnd` — RDF parsing. The app's own
marks narrowed it to one file: `packing-list-questions.ttl`, 421KB, 5,182 quads
over 1,085 subjects.

`getSolidDataset` does two things: parse the Turtle, then convert the parsed
quads into solid-client's own `SolidDataset` shape via `fromRdfJsDataset`.
Timing them separately, on a laptop with no throttling:

```
n3 parse:           25ms  (5,182 quads)
fromRdfJsDataset: 1,095ms
```

`fromRdfJsDataset` accumulates immutably — for every quad it spreads the entire
graph object to add one subject:

```js
// @inrupt/solid-client, rdfjs.internal.mjs
return freeze({ ...graph, [subjectIri]: addRdfJsQuadToSubject(subject, quad) });
```

That is O(quads × subjects). The question set is the one document that grows on
both axes at once — every person, question, option and item lives in it — so it
is the document that hurts. The packing lists, each a fraction of the size, cost
~17ms apiece.

## The fix

Two changes in the pod read path, both in `src/services/`:

1. **`rdfDataset.ts` — build the dataset in one linear pass.** Same structure,
   same output (`rdfDataset.test.ts` asserts it equals `fromRdfJsDataset`'s own
   output for the app's real documents), without copying the accumulated graph
   per quad. 1,095ms → 9ms for the question set.

2. **`loadMultipleRdfFromPod` — split the fetch from the parse.** Fetching a
   container's files stays fully parallel; the parses are now walked one at a
   time with a yield to the event loop between them
   (`src/utils/yieldToEventLoop.ts`). Before, `getSolidDataset` did both halves
   together, so responses that arrived together parsed back to back in one task.
   This matters more the more lists you have.

### Result

Same pod, same machine, same throttle (4× CPU, 150ms pod latency), built from
the commit before and after:

| | before | after |
|---|---|---|
| longest frozen frame | 6,492ms | 281ms |
| total blocking time | 6,799ms | 518ms |
| lists on screen | 11,665ms | 5,461ms |

The multi-second freeze is gone: the worst single task is now 276ms, and the
lists arrive in half the time.

## A bug this turned up on the way

`loadRdfFromPod` sends a conditional GET (`If-None-Match`) so a poll that finds
nothing changed can skip the parse, and catches the 304 by reading `statusCode`
off the thrown error. That never fired against a real pod. solid-client cannot
construct its `FetchError` for a 304 at all — the `ClientHttpError` inside it
rejects any status below 400 — so what actually came back was an
`InruptClientError` with no `statusCode`, the branch fell through, and the load
failed instead of returning the cached result.

The test covering it passed because it mocked the error solid-client *would*
have thrown (`throw { statusCode: 304 }`) rather than the one it does.

Now that the app owns the parse, `responseToDataset` raises its own
`PodResponseError` carrying `statusCode` for every non-2xx status, 304 included,
and the test drives a real `Response` with status 304 through the real code
path.

## Still outstanding

The app renders nothing at all for about 2 seconds after the OIDC redirect lands
(`firstContentMs` above). Almost none of that is CPU — 242ms of long tasks in a
2,118ms stretch — it is `DatabaseProvider` returning `null` while it waits on the
token exchange and the WebID profile fetch that resolves the pod URL. That is a
blank page rather than a frozen one, and it is a separate fix: either render the
app's `LoadingState` during the wait, or resolve the namespace from the cached
pod URL (`pod-url:<webId>` in localStorage) so the first paint doesn't wait on
the network at all.
