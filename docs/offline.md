# Working offline

What the app does when it cannot reach the network, why being offline used to
look like being signed out (#342), and where an honestly offline-first version
of this app goes next.

## The short version

Everything the app shows is already on the device. Lists, questions, people and
tick-boxes live in PouchDB; the pod is a copy that other devices can read.
Losing the network therefore costs nothing but syncing — and the app's job while
it is gone is to say so, and to keep working.

What it used to do instead was show its signed-out face: "Sync & Share" in the
nav, the marketing landing page instead of the lists, a nudge to sign in for
cross-device sync, and — worst of all — an empty list of lists. Nothing was
lost, but there is no way to tell that from the outside, which is why the bug
report reads "when offline it looks like you're logged out".

## Why offline looked like signed out

A Solid session is only *live* once the provider has answered a refresh, and
that answer needs the network. So on a cold start with no connection there is no
live session — only a refresh token in IndexedDB that nothing can be done with
yet. `isLoggedIn` was the app's single answer to "who is this?", and offline it
said *nobody*:

1. **The nav offered to sign them in.** The loudest possible "you are logged
   out", shown to someone who never left.
2. **`/` redirected to the landing page** rather than to their lists.
3. **The database was the wrong one.** PouchDB is namespaced per identity, and
   the namespace is derived from the pod URL — which is read from the WebID
   profile, over the network. With no network there was no namespace, so the app
   fell back to the anonymous `local` database and the user's lists were simply
   not on screen. Alarming, and the part that makes someone re-authenticate or
   assume their data is gone.
4. **The sync nudge and the sign-in prompts** told them to do the one thing that
   cannot work without a connection.

None of these is a session bug. `ResilientSession` was already doing the right
thing underneath — retrying, never discarding the refresh token (see
[staying-signed-in.md](./staying-signed-in.md)) — the app just had no way to
render "signed in, but out of reach".

## What it does now

`SolidPodContext` distinguishes three states rather than two:

| | `isLoggedIn` | `isReconnecting` | `sessionExpired` |
|---|---|---|---|
| Live session | `true` | `false` | `false` |
| Signed in, offline | `false` | `true` | `false` |
| Provider ended the grant | `false` | `false` | `true` |
| Signed out | `false` | `false` | `false` |

`isReconnecting` means: a session is stored on this device and nothing has told
us it is over. The app keeps retrying on its backoff, and in the meantime:

- **The nav shows the account**, with an "Offline" badge, and no sign-in button.
- **`OfflineBanner`** says why the pod is quiet and that changes will sync
  later. It is deliberately not an error and not dismissible — it clears itself
  when the session comes back, which on a passing signal drop is seconds. The
  alarming banner, `SessionExpiredBanner`, stays reserved for a session the
  provider has actually ended.
- **`/` still opens on the lists**, and the lists are the user's own: the pod
  namespace resolved during the last live session is remembered
  (`src/services/rememberedSession.ts`), so the right database opens with no
  network at all.
- **Sign-in nudges stay quiet**, and Share says it needs a connection rather
  than offering to sign them in again.

Two rules hold this together:

- **Only the provider may make someone signed out.** `invalid_grant`,
  `invalid_client`, a DPoP key that no longer matches — or a deliberate logout.
  Everything else is `isReconnecting`, however long it lasts.
- **Nothing about the identity outlives a real sign-out.** `forgetSignedIn()`
  runs on logout, on expiry, and when a start finds no stored session at all, so
  a signed-out device never claims to be reconnecting.

The remembered WebID and namespace are in localStorage. Neither is a credential
— the refresh token stays in IndexedDB, owned by the auth library — and both are
facts the device already displays.

### One caveat

The pod namespace can only be remembered once a live session has resolved it. A
device that has *never* had one since this feature shipped, and then starts
offline, falls back to a namespace derived from the WebID — the same fallback
the online path uses when no pod URL resolves. If the pod URL would have differed,
that device opens an empty database until it gets a connection. One start, one
time, and it corrects itself the moment a session goes live.

## Where this goes next

The app is local-first in its storage and online-first in its behaviour. Closing
that gap, roughly in the order the value arrives:

1. **An outbound queue.** Pod writes are best-effort today: `saveWithSyncPrevention`
   saves locally, then pushes, and a push that fails is simply not retried — the
   next full sync merges by `lastModified` and catches it. That works, but it is
   luck rather than design. A durable queue of pending writes, drained when a
   session goes live, makes "changes will sync when you're back" a promise the
   code keeps rather than a description of what usually happens.
2. **Per-resource sync state, shown.** "Saved on this device" and "saved to your
   pod" are different facts and the UI mostly conflates them. A list that has
   local edits nobody else can see yet should say so.
3. **An app shell that survives a cold start.** Everything above assumes the app
   loaded. On the web, opening it with no connection still gets a browser error
   page — a service worker (or the native shell, which already ships its assets)
   is what makes the whole app openable offline, not just usable once open.
4. **Offline-aware affordances everywhere.** Sharing, backups and pod deletion
   genuinely need the network. They should say that in place, once, rather than
   each page finding its own way to fail.
5. **Conflict handling with a face.** Merging by `lastModified` silently picks a
   winner per field. Two devices editing the same list offline is exactly the
   case where a person, not a timestamp, should decide.

## Where the behaviour is pinned

- `SolidPodContext.offline.test.tsx` — the three states, and what moves between
  them.
- `DatabaseContext.test.tsx` → "signed in but offline" — the right database
  opens with no network, and nothing is asked of the pod.
- `Navigation.test.tsx` → "signed in but offline", `OfflineBanner.test.tsx`,
  `SyncAcrossDevicesPrompt.test.tsx` — what the user sees.
- e2e suite J (`J4`, `J5`) — with every request to the pod refused, the app
  still shows the account, the banner, and the lists that were made online.
