# CLAUDE.md

## Testing

Use TDD (red-green-refactor) when implementing new features.
Run tests: `npm test`

## Data Access

Never call `db.*` (local PouchDB) and pod storage functions directly in the same place. Use the established intermediate layers:

- **Write** (local + pod together): `useSyncCoordinator.saveWithSyncPrevention(data, saveToPod)` — stamps a `lastModified` timestamp, saves locally first, then best-effort pod push with sync-loop prevention.
- **Pod path config**: use `usePodSync` to get `saveToPod` / `syncFromPod` for a given resource path.
- **Login sync** (pod → local on login): handled automatically by `DatabaseContext` via `syncAllDataFromPod` — no per-page code needed.
