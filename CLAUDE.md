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
| E, J (read-only tests), Z | `testuser` |
| J5 (writes a list) | `juser` |
| F | `fuser` |
| G | `guser` |
| H | `huser` |
| K | `schemacompat` |
| L (User A) | `luser` |
| M (User A) | `muser` |
| L/M (User B) | `collabuser` |
| N (inviter) | `nuser` |
| N (invitee) | `ninvitee` |

## Pull Requests

When raising a PR that addresses a GitHub issue, always reference the issue in the PR description using `Closes #<issue-number>` or `Fixes #<issue-number>` so GitHub automatically links and closes the issue on merge.

## Solid session

Never end a session because a request failed. `@uvdsl/solid-oidc-client-browser`'s
`SessionCore` ships no refresh lifecycle — that is this app's job, and it lives in
`ResilientSession` (`src/services/ResilientSession.ts`). Three rules it exists to keep:

- **Only the provider may end a session.** `invalid_grant`/`invalid_client`, or a DPoP
  key that no longer matches, are terminal. Network errors, 5xx, 429, JWKS fetch
  failures and clock skew are retried. Never call the library's `logout()` in response
  to a 401 — it calls `database.clear()`, which deletes the refresh token and makes a
  recoverable session unrecoverable.
- **Bank a rotated refresh token before doing anything that can throw.** Providers
  treat a re-presented refresh token as a replay and revoke the whole grant, so a
  replacement that is received but not stored is a dead session.
- **Never let the app be a dynamic client in production.** The native shell is
  served from `https://localhost`, so it fell through to dynamic client
  registration — and a registration the provider reclaims answers the next refresh
  with `invalid_client`, which is terminal. `solidClientIdentity.ts` decides this,
  and `public/client-id.json` must keep listing the native redirect URI or the
  mobile app cannot log in at all.

A fourth rule follows from the first: **a session that cannot be reached is not a
session that has ended.** `isReconnecting` (`SolidPodContext`) is that state, and
while it holds, the app keeps the account on screen and opens the identity's own
PouchDB namespace from `rememberedSession.ts` rather than the empty local one —
otherwise being offline looks exactly like being logged out (#342).

`docs/staying-signed-in.md` has the full trace of the logout bugs these rules came
from, and `docs/offline.md` covers what the app does with no network.
`SolidPodContext.resilience.test.tsx`, `SolidPodContext.offline.test.tsx`,
`ResilientSession.test.ts` and e2e suite J pin the behaviour; suite J in particular
asserts that a 401 does *not* sign the user out, and that a pod it cannot reach
leaves the user signed in with their lists on screen.

## Sharing

Every share — one list or the whole setup — is gated on a WebID that only the
*other* person can produce, and that exchange is where sharing actually failed
(#354 follow-up). Three rules keep it working:

- **Never take a typed address on trust.** `normaliseWebIdInput`
  (`src/services/webIdInput.ts`) turns what people actually type — a Pod root, a
  profile card missing its `#me`, a bare host — into a WebID or into `null`, and
  `useWebIdLookup` then reads the profile card so the field can name who is
  there before anything is granted. A raw string handed to `grantCollaboratorAccess`
  is recorded by WAC without complaint, reported as a success, and reaches
  nobody. Every field that asks for a WebID goes through `WebIdField` — both
  share fields, and `PersonIdentityPicker`, which asks for one to put a
  person's own photo on their avatar and normalises it on blur, because what
  it stores is what `useKnownPeople` later matches on.
- **An unreadable profile never blocks a share.** A card can be unreachable
  because the address is wrong, or because the server is down, the card is
  private, or none was ever published. `WebIdLookupStatus` keeps those apart:
  `invalid` has nothing to grant to, `unknown` warns and lets it through.
- **The receiving end always has a next step.** A shared link that will not open
  renders `SharedAccessHelp`, never a bare sentence: signed out it offers the way
  in, signed in it names the account they are signed in as and hands them that
  address to send back — because a mismatched address, not a revoked grant, is
  the usual cause. It covers both entry points, `ForeignPodLayout` (a whole
  setup) and `view-packing-list` with a `?pod=` (one list).
- **Never ask for an address the device already holds.** `useKnownPeople` reads
  the three places one is already stored — the question set's people,
  `shared-with-me`, `shared-lists-with-me` — normalises them so one person is
  one entry, and drops the signed-in user, who is not somebody you can share
  with. `PeopleSuggestions` offers what is left as chips, minus anyone who
  already has access. It is a local read behind an `enabled` flag, so a packing
  list page does not pay for three documents until a share dialog opens.

- **A link that leaves the device never carries `window.location.origin`.** In
  the Capacitor shell that origin is `https://localhost`, so every link the
  native app produced was copyable, shareable and useless, and sharing read as
  local-only when the WAC grants behind it had worked all along (#357). The
  origin comes from `shareOrigin()` (`src/services/publicAppOrigin.ts`), derived
  from `HOSTED_CLIENT_ID_URL` so the deployment host is written down once and
  overridable with `VITE_PUBLIC_ORIGIN`. A web origin is kept as it is, so a
  preview deploy links to itself, and `window.location.origin` stays right for
  in-app navigation. The mistake is one line and each new sharing surface is a
  fresh chance to make it — the setup link repeated it after the list link, and
  `CreateInviteLink` repeated it again — so a new builder goes in the
  `linkBuilders` list in `services/shareLinks.test.ts`, and a builder that takes
  its origin as an argument (`buildInviteLink`) also needs a test at its call
  site that what gets passed is `shareOrigin()`.

### Invite links

`CreateInviteLink` is the path that needs nothing from the other person, and it
sits above the address field on both share surfaces because having nothing is
where everybody starts. Four rules:

- **The URL is the secret.** One resource per invite at
  `pack-me-up/invites/{token}`, granted public Append and nothing else
  (`services/invites.ts`). That one choice is why accepting needs no prior
  permission, why an invite link is not a peephole (nobody holding it can
  *read*, so two invitees never learn of each other), and why revoking is a
  DELETE. `inviteUrlFor` is where a token becomes a path segment, so it refuses
  anything not shaped like one. **This does not currently work when the inviter
  is on an ACP Pod** (Inrupt ESS): accepting fails with 401/403, and
  `createInvite`'s grant check cannot catch it, because on ACP
  `setPublicAccess` verifies by re-parsing the ACR the client itself just wrote
  rather than asking the server. E2E suite N only covers WAC, so it stays green.
  `docs/invite-links-on-acp-pods.md` has the evidence and the one experiment
  still needed.
- **What arrives is never trusted; what was sent is.** The appended WebID was
  written by a stranger. What gets granted is decided by the *invite* — the
  inviter's own record of what she offered — so a WebID on a list invite can
  only ever reach that list. `datasetToInvite` reads an unknown kind as the
  narrower one for the same reason.
- **Nothing happens until the inviter's app runs.** There is no server, so an
  acceptance waits on the Pod for `useInviteRedemption`. Both ends say so in
  words. A grant that fails keeps its invite so the next run retries; deleting
  there would lose the acceptance with no way for either side to tell.
- **Redemption is app-wide, and pages re-read when it fires.** It is mounted in
  `App.tsx`, not on the Sharing page — the sender is waiting to hear it worked,
  not planning a visit to settings. `InviteRedemptionContext` is the signal that
  access changed underneath a page that has already loaded.

Two known properties, both deliberate: a full-setup collaborator can read the
invites container, because "your full setup" includes it — no escalation, since
they already have everything an invite could grant, but they can see who is
being invited; and `verifyForeignPodAccess` reads the packing-lists container,
so somebody who shares a setup containing no lists at all is told they have no
access. E2E suite N covers the round trip on two Pods.

Both halves of a share get the same three ways out — clipboard, system share
sheet, QR — through `ShareActions`: `YourSharingAddress` for the address that
starts it, `ShareableLink` for the link that has to travel afterwards. Before
them, the user's own WebID appeared only as unselectable text in the account
menu, and a freshly granted link got a read-only input and a Copy button.
E2E suites L and M cover both paths end to end.

## Application Capability description

The app publishes a machine-readable description of itself at `/` — what it can
do, how another app invokes it, what it needs from its environment — per
[dokieli's Application Capability spec](https://dokieli.github.io/application-capability/).
It lives in `src/capability/`, is served by `middleware.ts` (Vercel only — it
does nothing under `npm run dev` or `vite preview`), and is restated as RDFa in
the footer.

Three rules it exists to keep:

- **Never advertise a capability the app can't honour.** Every invocation
  template must resolve to a real route. `document.test.ts` pins the template
  list; `#open={open}` is handled by `openInvocation.ts` and `/open`
  (`src/pages/open-resource.tsx`).
- **The JSON-LD and the Turtle are two syntaxes for one description.** They are
  hand-maintained separately, so `document.test.ts` parses both and compares
  canonical N-Quads. Change one, change the other, and let that test tell you.
- **Nothing hardcodes the deployment origin.** `capabilityDescription(origin)`
  builds every IRI from the origin the request arrived on, so a preview
  deployment describes itself.

`middleware.ts` sits outside `src/`, where neither `tsconfig.app.json` nor
`tsconfig.node.json` looks, so `tsconfig.middleware.json` exists purely to bring
it into `tsc -b`. Keep it referenced from `tsconfig.json` or the one file gating
the production homepage stops being type-checked.

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

The same fixture guards **duplication** (`src/utils/duplicatePackingList.ts`, #325): a
duplicate is built with an omit-list too, and `duplicatePackingList.test.ts` fails until a
new field is listed as carried, regenerated or deliberately dropped.

So when the type check sends you to the fixtures, add the field with a distinctive value
and run the tests — don't reach for `as` or a partial fixture. A field that genuinely must
not leave the device belongs in `packingListLocalOnlyFields` with a comment saying why.
