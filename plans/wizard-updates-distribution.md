# Plan: Distributing wizard template updates to existing users

## Problem

The setup wizard takes a one-time snapshot of the built-in template
(`createExampleData` in `src/edit-questions/example-data.ts`) and saves it as
the user's own editable question set. Improvements shipped to the template
never reach existing users — their only path today is re-running the wizard,
which **replaces** their whole question set and destroys their customisations.

## Goal

A simple, obvious, non-destructive way for users to pull in new template
content ("we've added new suggested items/questions since you set up"), while
their own edits remain untouched and authoritative.

## Approach (agreed)

Reuse the age-promotion pattern (`src/edit-questions/age-promotion.ts` +
`src/components/AgePromotionCard.tsx`): regenerate the template with the
user's current people, diff it against their saved set, and surface purely
**additive** suggestions in a review card at the top of *My Questions & Items*
with per-item checkboxes, **Add selected** and **Dismiss**. A template version
stamp on the question set makes detection cheap and makes the card disappear
once handled.

Non-goals:

- No automatic/silent application of updates — everything is opt-in.
- No propagation of template deletions or renames — the user owns their copy.
- No change to the wizard's existing destructive "start from scratch" re-run.

## Design

### 1. Template version stamp

- New constant `WIZARD_TEMPLATE_VERSION` (start at `1`) exported from
  `src/edit-questions/example-data.ts`, with a header comment: *bump this
  whenever the template content changes in a way users should be offered*.
- `PackingListQuestionSetSchema` (`src/edit-questions/types.ts`) gains
  `templateVersion: z.number().optional()`. Absent ⇒ treated as `0`
  (pre-versioning sets), so all existing users are offered the first update.
- The wizard (`useWizardGeneration.ts`) stamps freshly generated sets with the
  current version.
- Applying **or dismissing** suggestions stamps the set to the current version
  via the normal save path, so the decision syncs across devices through the
  pod (unlike age-promotion's per-device localStorage dismissal — a deliberate
  difference: template updates are about the shared data, not this device).

### 2. Stable template IDs (matching aid, forward-looking)

`ACTIVITY_OPTION_IDS` already gives activity options stable IDs. Extend the
same idea to template questions: a `TEMPLATE_QUESTION_IDS` map
(`template-question-overnight`, `template-question-abroad`, …) used by
`createExampleData` instead of `generateUUID()` for the five built-in
questions. Newly generated sets then match template questions exactly by ID;
legacy sets fall back to normalized-text matching (below).

### 3. Diff engine — new module `src/edit-questions/template-updates.ts`

```ts
buildTemplateUpdateSuggestions(qs: PackingListQuestionSet): TemplateUpdateSuggestion[]
applyTemplateUpdates(qs, accepted: TemplateUpdateSuggestion[]): PackingListQuestionSet
```

- Regenerate the reference template with `createExampleData(qs.people, [])`
  (all activities included) so item `personSelections` and age filtering are
  already aligned to the user's current group.
- Matching, additive-only:
  - **Questions**: by stable ID first, then normalized text (trim/lowercase —
    reuse/extract `normalize` from `age-promotion.ts`). Questions the user
    deleted (`deletedAt`) are treated as matched so they are never resurrected.
  - **Options**: within a matched question, by stable ID
    (`activity-option-*`) then normalized text.
  - **Items**: within a matched option (or `alwaysNeededItems`), by
    normalized text. Extract the `collectLocations` helper from
    `age-promotion.ts` into a shared module rather than duplicating it.
- Suggestion kinds (each carries a `contextLabel` for display, mirroring
  `PromotionSuggestion`):
  - `addItem` — template item missing from a matched location. Skip items
    whose `personSelections` select nobody in the user's group (the `items()`
    filter in the template already does this).
  - `addOption` — whole new option under a matched question (e.g. a new
    activity), inserted with its items.
  - `addQuestion` — whole new template question, inserted with fresh UUIDs
    for question/option IDs (except stable template IDs) and `order` appended
    after the user's existing questions.
- `applyTemplateUpdates` returns a new set containing only the accepted
  additions plus `templateVersion: WIZARD_TEMPLATE_VERSION`. Saving goes
  through the page's existing `saveData` → `saveWithSyncPrevention`, per the
  data-access rules in CLAUDE.md.

### 4. UI — new `src/components/TemplateUpdatesCard.tsx`

Modeled closely on `AgePromotionCard`:

- Rendered on `questions-page.tsx` next to `AgePromotionCard`, only when
  `!isForeign`, `(data.templateVersion ?? 0) < WIZARD_TEMPLATE_VERSION`, and
  there is at least one suggestion. (If the version is behind but the diff is
  empty — user already has everything — render nothing; the diff is cheap and
  the card simply never appears. The stamp catches up on their next
  apply/dismiss or wizard run.)
- Collapsed: one-line banner, e.g. *"✨ We've improved the starter suggestions
  since you set up — N new suggestions available"* with **Review** and a
  dismiss ×.
- Expanded: checklist grouped by location (`contextLabel`), everything
  checked by default; **Add selected** applies and stamps; **Not now**
  collapses; **×** dismisses (stamps the version without adding anything,
  saved through the same path).

### 5. RDF serialization (`src/services/rdfSerialization.ts` + `rdfVocab.ts`)

- New vocab term `PMU.templateVersion`; serialize as an integer on the
  question-set root thing when present; deserialize to `templateVersion`,
  omitted when absent.
- Backward compatibility: old datasets without the term must round-trip
  unchanged (covered by the existing schema-compat approach, suite K).

## Edge cases & accepted trade-offs

- **User deleted a template item, then a version bump re-suggests it**: it
  appears once as a pre-checked box; unticking it or dismissing stamps the
  version so it won't recur for that release. Accepted — no per-item
  tombstone list in v1.
- **User renamed a legacy template question** (no stable ID): text matching
  fails and the whole question could be re-suggested. Mitigation: before
  offering an `addQuestion`, require that the majority of its items are absent
  from the user's entire set; otherwise treat the question as matched and
  offer nothing. This keeps a renamed "Will you be staying overnight?" from
  coming back while still allowing genuinely new questions through.
- **Multi-device**: because the stamp lives in the synced data, a decision on
  one device clears the card everywhere after sync.

## Implementation steps (TDD, red-green-refactor)

1. **Schema + constant**: failing unit tests for `templateVersion` on
   `PackingListQuestionSetSchema` and for the wizard stamping it
   (`useWizardGeneration.test.ts`); then implement. Add
   `TEMPLATE_QUESTION_IDS` and switch `createExampleData` to use them
   (update `example-data.test.ts` expectations).
2. **RDF round-trip**: failing tests in `rdfSerialization.test.ts` for
   serialize/deserialize of `templateVersion` and for absence on legacy data;
   implement vocab term + mapping.
3. **Shared helpers**: extract `normalize` / `collectLocations` from
   `age-promotion.ts` into a shared module; keep age-promotion tests green.
4. **Diff engine**: `template-updates.test.ts` first — cases: item added to
   existing option; item user already has (no suggestion); item user deleted
   (re-suggested once); new activity option; new question; renamed legacy
   question (majority-items rule suppresses re-suggestion); `deletedAt`
   question not resurrected; pet/age filtering respected; apply stamps
   version and inserts with aligned `personSelections`. Then implement.
5. **Card component**: `TemplateUpdatesCard.test.tsx` — hidden when
   up-to-date or no suggestions; shows count; untick excludes; apply calls
   `onApply` with additions + stamp; dismiss calls `onApply` with stamp only.
   Then implement, wire into `questions-page.tsx`.
6. **E2E**: extend `e2e/tests/b-questions.spec.ts` (local-only, no pod user
   needed) with one happy path: seed a set with `templateVersion: 0` via the
   app's own storage, see the card, add selected items, card disappears,
   items present. If pod-sync coverage of the stamp is wanted later, that
   needs a new serial suite with its own dedicated pod user per CLAUDE.md.
7. **Docs**: header comment in `example-data.ts` describing the bump policy;
   bump `WIZARD_TEMPLATE_VERSION` for the first time only when the next real
   template change ships.
