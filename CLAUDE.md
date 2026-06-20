# CLAUDE.md

## Testing

Use TDD (red-green-refactor) when implementing new features.
Run tests: `npm test`

### E2E pod isolation

Each serial suite that writes to a Solid pod **must use its own dedicated pod user** — never share `testuser` (or any other pod) between suites that run concurrently. Add new user constants to `playwright.config.ts` and create the account in `e2e/global-setup.ts`.

| Suite | Pod user |
|-------|----------|
| E, J, Z | `testuser` |
| F | `fuser` |
| G | `guser` |
| H | `huser` |
| K | `schemacompat` |
| L (User A) | `luser` |
| M (User A) | `muser` |
| L/M (User B) | `collabuser` |

## Pull Requests

When raising a PR that addresses a GitHub issue, always reference the issue in the PR description using `Closes #<issue-number>` or `Fixes #<issue-number>` so GitHub automatically links and closes the issue on merge.

## Data Access

Never call `db.*` (local PouchDB) and pod storage functions directly in the same place. Use the established intermediate layers:

- **Write** (local + pod together): `useSyncCoordinator.saveWithSyncPrevention(data, saveToPod)` — stamps a `lastModified` timestamp, saves locally first, then best-effort pod push with sync-loop prevention.
- **Pod path config**: use `usePodSync` to get `saveToPod` / `syncFromPod` for a given resource path.
- **Login sync** (pod → local on login): handled automatically by `DatabaseContext` via `syncAllDataFromPod` — no per-page code needed.
