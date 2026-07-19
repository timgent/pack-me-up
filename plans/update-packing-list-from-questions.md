# Plan: Update an existing packing list from question-set changes

## Problem

A packing list is a one-off snapshot: `generateQuestionBasedItems` /
`generateAlwaysNeededItems` fan the question set out into `PackingListItem`s at
creation time and the two are disconnected afterwards. When the user later adds
items to their question set, existing lists never see them.

Auto-syncing by default would be jarring (items appearing/disappearing under
the user) and drags in conflict UI. Instead:

**A manual, one-shot "Update from questions" action on the view-packing-list
page, with a preview of what would be added, additions only.** No setting, no
per-list toggle, no background behaviour.

### Scope for v1

- **In:** adding items that the current question set would generate for this
  trip's answers/travellers but that aren't on the list.
- **Out (v2+):** propagating renames/edits/removals; `sourceItemId` stamping
  and question-set `Item.id` backfill (needed for rename tracking, not for
  additions); foreign/shared lists (`sharedFromPodUrl` set or foreign-pod
  context — the local question set isn't theirs); any automatic behaviour.

Follow TDD (red-green-refactor) throughout, per CLAUDE.md.

---

## Phase 1 — Persist generation inputs on `PackingList`

The list must remember *how* it was generated so the update is a deterministic
re-run of the existing generator, not a heuristic.

1. **Types** (`src/create-packing-list/types.ts`) — additive optional fields on
   `PackingList`:

   ```ts
   questionAnswers?: Array<{ questionId: string; selectedOptionIds: string[] }>
   selectedPeopleIds?: string[]
   ```

   (`nights` is already persisted.)

2. **Creation** (`src/pages/create-packing-list.tsx` `onSubmit`) — store the
   submitted `data.questionAnswers` (normalised: drop entries with no selected
   options, drop empty-string option ids — mirroring what the generator
   ignores) and `selectedPeopleIds` on the new `PackingList`.

3. **RDF round-trip** (`src/services/rdfVocab.ts`,
   `src/services/rdfSerialization.ts`):
   - New vocab terms: `PMU.hasAnswer`, `PMU.selectedOptionId`,
     `PMU.selectedPersonId` (reuse existing `PMU.questionId` on the answer
     Thing).
   - `packingListToDataset`: one Thing per answer at
     `#answer-<questionId>` with `questionId` + repeated `selectedOptionId`
     strings; `selectedPersonId` as repeated strings on the root Thing.
   - `datasetToPackingList`: read them back; omit the fields when absent so
     legacy `.ttl` files parse unchanged.
   - Unit tests: round-trip with and without the new fields
     (`rdfSerialization.test.ts`). Fields are additive, matching the
     schema-compat approach exercised by suite K.

4. **Merge** (`src/utils/mergePackingLists.ts`) — the `...newer` spread already
   carries top-level fields from the newer side; add a unit test pinning that
   `questionAnswers`/`selectedPeopleIds` survive a merge.

Legacy lists (created before this change) have no stored answers — see the
fallback in Phase 2.

## Phase 2 — Pure diff function (the core logic)

New module `src/create-packing-list/updateFromQuestions.ts`, fully unit-tested
before any UI work:

```ts
export function computeQuestionSetAdditions(
  list: PackingList,
  questionSet: PackingListQuestionSet,
): PackingListItem[]
```

Behaviour:

1. Resolve generation inputs: stored `questionAnswers` + `selectedPeopleIds`,
   with `selectedPeopleIds` **intersected with current `questionSet.people`
   ids** (a person deleted from the question set must not be regenerated —
   also guards the non-null `people.find(...)!` in `generateItemInstances`).
   Answers pointing at deleted questions/options already yield nothing in the
   generator.
2. Re-run the existing `generateQuestionBasedItems` +
   `generateAlwaysNeededItems` with those inputs and `list.nights` (so new
   items get `suggestedQuantity` and a category exactly as at creation).
3. Filter the regenerated items down to true additions, keyed the same way as
   the existing `deduplicateItems` (`${personId}::${itemText.trim().toLowerCase()}`),
   dropping anything whose key matches:
   - a current `list.items` entry (covers custom items the user already added
     by hand), or
   - a `list.deletedItems` entry (never resurrect a deliberate deletion).

   For communal items use the same key shape (`personId` is `''`), which also
   prevents re-adding a communal item the user deleted.
4. Stamp each addition with a fresh `id`, `lastModified` (item-level merge in
   `mergePackingLists` relies on it), `packed: false`.

**Legacy-list fallback** — `reconstructGenerationInputs(list)`: when
`questionAnswers` is absent, rebuild answers from the distinct
`(questionId, optionId)` pairs across `items` **and** `deletedItems`
(skipping the `always-needed` sentinel and custom items with `questionId === ''`),
and `selectedPeopleIds` from the distinct non-empty `personId`s. This is lossy
(an option whose items were all deleted-and-purged, or that generated zero
instances, is invisible) but safe for additions-only: worst case it *misses*
additions, it never invents wrong ones. Unit-test it separately.

Test cases to cover (in `updateFromQuestions.test.ts`):
- new item in a selected option → added for each selected traveller
- new item in an *unselected* option → not added
- item already on the list (incl. user-added custom item with same text) → skipped
- item in `deletedItems` → skipped
- communal item: trigger semantics respected; deleted communal item skipped
- person removed from the question set → no items generated for them
- question/option deleted → answers for it silently ignored
- `nights` set → additions carry `suggestedQuantity`
- legacy list without stored answers → reconstruction path

## Phase 3 — UI on the view-packing-list page

All in `src/pages/view-packing-list.tsx` plus one small new component:

1. **Entry point:** an "Update from questions" button alongside the existing
   header actions. Hidden when the list is foreign (`foreignPodUrl` or
   `packingList.sharedFromPodUrl`) or when `db.getQuestionSet()` throws
   `not_found`.
2. **On click:** load the question set (read via `db` is fine; CLAUDE.md's
   layering rule applies to writes), run `computeQuestionSetAdditions`.
   - No additions → toast "This list already matches your questions", no dialog.
   - Otherwise open a preview modal (new component
     `src/components/UpdateFromQuestionsModal.tsx`, styled after
     `SharePackingListModal`): additions grouped by traveller (shared items
     first), each with a checkbox defaulting to checked, plus
     Cancel / "Add N items".
3. **On confirm:** append the selected additions to `packingList.items` and
   save through the existing `persistPackingList` →
   `saveWithSyncPrevention(updatedList, saveToPod)` path, which handles the
   local-first write, `lastModified` stamping, and best-effort pod push per
   the data-access rules. Success toast with the count.

No settings, no badges, no auto-run. The whole surface is one button and one
modal.

## Phase 4 — Tests & verification

- **Unit** (Phases 1–2 above, plus): component test for the modal flow in
  `view-packing-list.test.tsx` — button hidden for foreign lists, preview
  shows expected items, unchecking excludes an item, confirm persists and
  closes.
- **E2E:** extend `e2e/tests/c-packing-lists.spec.ts` (local-only flow, so no
  new pod user is needed and the pod-isolation table in CLAUDE.md is
  untouched): create a list → add an item to an answered option in
  manage-questions → open the list → Update from questions → preview shows the
  item → confirm → item appears in the right section; delete it, update again
  → not re-suggested.
- Run `npm test` and the c-suite Playwright spec; manual check via the
  solid-dev flow that a pod-synced list round-trips the new fields.

## Suggested implementation order / PRs

Either one PR with commits per phase, or two PRs:

1. **PR 1 (invisible plumbing):** Phase 1 — persist + serialize + merge
   generation inputs. Ships safely on its own; new lists start recording
   inputs immediately, which matters because lists created before Phase 3
   ships will otherwise all be on the lossy reconstruction path.
2. **PR 2 (feature):** Phases 2–4.
