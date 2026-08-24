# CLAUDE.md

## Testing

Use TDD (red-green-refactor) when implementing new features.
Run tests: `npm test` — type checks first (`npm run typecheck`), then runs vitest, so the
persistence guard below fails the same command locally and in CI. `npm run test:watch`
skips the type check.

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

## Solid session

Never end a session because a request failed. `@uvdsl/solid-oidc-client-browser`'s
`SessionCore` ships no refresh lifecycle — that is this app's job, and it lives in
`ResilientSession` (`src/services/ResilientSession.ts`). Two rules it exists to keep:

- **Only the provider may end a session.** `invalid_grant`/`invalid_client`, or a DPoP
  key that no longer matches, are terminal. Network errors, 5xx, 429, JWKS fetch
  failures and clock skew are retried. Never call the library's `logout()` in response
  to a 401 — it calls `database.clear()`, which deletes the refresh token and makes a
  recoverable session unrecoverable.
- **Bank a rotated refresh token before doing anything that can throw.** Providers
  treat a re-presented refresh token as a replay and revoke the whole grant, so a
  replacement that is received but not stored is a dead session.

`docs/staying-signed-in.md` has the full trace of the logout bugs these rules came
from. `SolidPodContext.resilience.test.tsx`, `ResilientSession.test.ts` and e2e suite J
pin the behaviour; suite J in particular asserts that a 401 does *not* sign the user out.

## Data Access

Never call `db.*` (local PouchDB) and pod storage functions directly in the same place. Use the established intermediate layers:

- **Write** (local + pod together): `useSyncCoordinator.saveWithSyncPrevention(data, saveToPod)` — stamps a `lastModified` timestamp, saves locally first, then best-effort pod push with sync-loop prevention.
- **Pod path config**: use `usePodSync` to get `saveToPod` / `syncFromPod` for a given resource path.
- **Login sync** (pod → local on login): handled automatically by `DatabaseContext` via `syncAllDataFromPod` — no per-page code needed.

### Persistence: adding a field to `PackingList` or `PackingListQuestionSet`

Never persist a type by listing the fields to keep. `database.ts` builds each PouchDB
document with `toDocumentData(entity, [...keys the document owns])` — an omit-list, so a
new field is stored by default. Reads spread the whole stored payload for the same reason.
An allowlist is how `nights`, `questionAnswers` and `selectedPeopleIds` were silently
dropped for every locally stored list (#260) with no type error and no failing test.

Two guards catch a repeat, and `npm test` runs both (CI included):

1. `src/test-utils/fullyPopulatedFixtures.ts` holds `Required<...>` fixtures with **every**
   field of these types populated. Adding an optional field to the type breaks the type
   check until the fixture covers it. (The fixtures live in `src`, not in a `.test.ts`,
   because `tsconfig.app.json` excludes test files from type checking.)
2. Round-trip tests assert those fixtures survive intact — through PouchDB
   (`database.test.ts` → "Field fidelity") and through the pod's RDF serialisation
   (`rdfSerialization.test.ts` → "Field fidelity").

So when the type check sends you to the fixtures, add the field with a distinctive value
and run the tests — don't reach for `as` or a partial fixture. A field that genuinely must
not leave the device belongs in `packingListLocalOnlyFields` with a comment saying why.
