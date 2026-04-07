# Implementation Plan: Issue #133 — Refactor task: Data layer

## Issue summary

The current data layer is bespoke at every call site. Components that need to save or load data must independently call both `PackingAppDatabase` (PouchDB) **and** the raw pod functions (`saveFileToPod`, `loadFileFromPod`, etc.) whenever the user is logged in. This logic is duplicated in at least 7 places: `create-packing-list.tsx`, `view-packing-list.tsx`, `packing-lists.tsx`, `edit-questions-form.tsx`, `solidPodBackup.ts`, `useHasQuestions.ts`, and `usePodSync.ts`. The goal is a single, unified data layer that transparently handles "write to PouchDB and write to Pod if logged in" so consumers only call one API.

---

## Options analysis

### Option A — `DataRepository` service class ⭐ RECOMMENDED

**What it is:** A new `DataRepository` class (in `src/services/dataRepository.ts`) that wraps both `PackingAppDatabase` and pod operations. It is constructed with the current session and exposes a simple, entity-level API. The `DatabaseContext` is extended to construct and provide it.

**API surface:**
```ts
interface DataRepository {
  savePackingList(list: PackingList): Promise<void>
  loadPackingList(id: string): Promise<PackingList>
  listPackingLists(): Promise<PackingList[]>
  deletePackingList(id: string): Promise<void>
  saveQuestionSet(qs: PackingListQuestionSet): Promise<void>
  loadQuestionSet(): Promise<PackingListQuestionSet>
}
```

**Behaviour:** Every `save*` / `delete*` call writes to PouchDB always, then writes to Pod only when logged in (transparent dual-write). `load*` always reads from PouchDB (which usePodSync keeps warm).

**Pros:**
- Single interface — call sites drop from "do A then maybe do B" to "call one method"
- Not React-coupled — easy to unit-test without rendering any component
- Easy to introduce: provide via an extended `DatabaseContext`, so existing `useDatabase()` usage migrates smoothly
- Keeps real-time sync (polling) clearly separate in `usePodSync` — that concern does not change
- All 7 bespoke call sites become uniform

**Cons:**
- Needs session/login state injected at construction time; the context must pass these in
- Does not remove `usePodSync`/`useSyncCoordinator` (those handle the separate problem of remote changes made on other devices)
- Moderate refactor scope — all 7 call sites need updating

---

### Option B — Extend `DatabaseContext` to expose unified methods

**What it is:** Rather than a standalone class, add `savePackingList`, `loadPackingList`, etc. directly to the context value returned by `useDatabase()`.

**Pros:** Minimal new file count; context already holds login state.

**Cons:** Mixes React infrastructure concerns with data operation logic; the context grows unwieldy; harder to test without rendering providers; harder to reuse outside React (e.g. in `solidPodBackup.ts`).

---

### Option C — Per-entity custom hooks (`usePackingListData`, `useQuestionSetData`)

**What it is:** A hook per entity type that handles all loading, saving, listing, and deleting for that entity, transparently bridging PouchDB and Pod.

**Pros:** Fine-grained; each component takes only what it needs.

**Cons:** Login-state handling duplicated across hooks; harder to share logic with non-React code such as `solidPodBackup.ts`.

---

## Recommendation

**Option A** — `DataRepository` service class provided via context.

It cleanly separates data-operation logic from React infrastructure, is straightforward to unit-test, works for both React components and non-React code (backups), and most directly addresses the issue description: "an overall data layer which delegates to PouchDB and to Pod storage if logged in."

---

## Files to create / modify

| File | Change |
|------|--------|
| `src/services/dataRepository.ts` | **Create** — `DataRepository` class |
| `src/services/dataRepository.test.ts` | **Create** — unit tests (red → green) |
| `src/components/DatabaseContext.tsx` | **Extend** — construct and expose `DataRepository` in context |
| `src/components/DatabaseContext.test.tsx` | **Update** — test that context provides a `DataRepository` |
| `src/pages/create-packing-list.tsx` | **Refactor** — use `repo.*` instead of `db.*` + `saveFileToPod()` |
| `src/pages/packing-lists.tsx` | **Refactor** — same |
| `src/pages/view-packing-list.tsx` | **Refactor** — same |
| `src/edit-questions/edit-questions-form.tsx` | **Refactor** — same |
| `src/services/solidPodBackup.ts` | **Refactor** — accept/use `DataRepository` instead of raw calls |
| `src/hooks/useHasQuestions.ts` | **Refactor** — use `repo.loadQuestionSet()` |

---

## TDD steps

### Red — failing tests

Write `src/services/dataRepository.test.ts` with these cases (all should fail before any implementation):

1. `savePackingList` persists to PouchDB regardless of login state
2. `savePackingList` also calls `saveFileToPod` when a session is present
3. `savePackingList` does **not** call `saveFileToPod` when session is null
4. `loadPackingList` returns the list from PouchDB
5. `listPackingLists` returns all lists from PouchDB
6. `deletePackingList` removes from PouchDB and calls pod delete when logged in
7. `saveQuestionSet` persists to PouchDB and to Pod when logged in
8. `loadQuestionSet` returns the question set from PouchDB

### Green — minimal implementation

Implement `DataRepository` in `src/services/dataRepository.ts`:

```ts
export class DataRepository {
  constructor(
    private db: PackingAppDatabase,
    private session: Session | null,    // from @inrupt/solid-client-authn-browser
    private podUrl: string | null
  ) {}

  async savePackingList(list: PackingList): Promise<void> {
    await this.db.savePackingList(list)
    if (this.session && this.podUrl) {
      await saveFileToPod(this.session, ...)
    }
  }
  // ... remaining methods
}
```

Extend `DatabaseContext` to construct `DataRepository` and add it to the context value:

```ts
interface DatabaseContextValue {
  db: PackingAppDatabase     // keep for backwards compat during migration
  repo: DataRepository       // new unified data layer
}
```

### Refactor — migrate call sites

Working through each call site (one file at a time), replace bespoke `db.*` + `saveFileToPod()` pairs with the equivalent `repo.*` call. After each file, run `npm test` and confirm green before moving to the next.

---

## Verification

```bash
npm test
```

All existing tests must stay green. The new `dataRepository.test.ts` tests must pass after implementation. No bespoke dual-write patterns should remain outside `DataRepository`.
