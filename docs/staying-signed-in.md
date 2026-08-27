# Staying signed in to a Solid Pod

Why the app used to sign people out at seemingly random intervals, and what now
stops it. Written up because the symptom ("it logged me out again") is one of the
hardest to report — by the time you notice, the page has reloaded and the console
is empty.

## The short version

The app was treating *"I couldn't reach the token endpoint just now"* and *"your
session is over"* as the same event. They are not. A refresh token stays valid for
hours or days; a Wi-Fi handover lasts two seconds. Every one of the bugs below is
a variation on that single confusion, and in every case the refresh token sitting
in IndexedDB was still perfectly good at the moment the user was signed out.

## What was actually happening

`@uvdsl/solid-oidc-client-browser` ships two session classes. `WebWorkerSession`
runs a SharedWorker that owns the refresh lifecycle; `SessionCore`, which this app
uses, deliberately ships **no** refresh lifecycle at all — its own documentation
hands that job to the surrounding app:

> The SessionCore class manages session state and core logic but does not handle
> the refresh lifecycle. […] That database can be re-used by (your!) surrounding
> implementation to handle the refresh lifecycle.

The app never built that half. What it had instead was a ten-minute
`setInterval` firing a `HEAD` at the user's WebID. Seven distinct ways to lose a
live session followed.

### 1. A failed restore on startup was swallowed

`initializeSession` ran `restore()` inside `try { … } catch {}` with an empty
handler. A cold start that beat the network — routine on a phone — left the user
signed out with a valid refresh token still on disk, and nothing ever tried
again. Reloading the page fixed it, which is exactly why this looked so random.

### 2. One failed refresh ended the session

`SessionCore.restore()` is a single unguarded attempt. On failure it checks
whether the current token has already lapsed and, if so, fires
`onSessionExpiration`. The app turned that straight into "Your session has
expired". No retry, at any level. One dropped connection at the wrong moment —
waking from sleep, a tunnel, a captive portal — was a logout.

### 3. There was no way back without a reload

Both the keepalive interval and the tab-focus check were gated on `isLoggedIn`.
Once that flipped false, every mechanism that might have recovered the session
had already unmounted.

### 4. A 401 destroyed the refresh token

This was the damaging one. On tab focus the app probed the WebID and, on a 401 or
403, called the library's `logout()` — which calls `database.clear()`, erasing
IndexedDB and the refresh token with it. A 401 from an access token that had
merely aged out is the *recoverable* case; answering it by deleting the means of
recovery converted a refreshable session into a mandatory re-login, and no reload
could undo it.

### 5. Tokens were used right up to the expiry instant

`SessionCore` renews only once `exp` has already passed — `_isTokenExpired` takes
a buffer parameter and is always called with `0`. So a request issued a second
before expiry arrives after it, and any client clock running behind the server
means the app believes a token is live that the server has already retired. Both
produce a 401, which fed straight into bug 4. The period of that loop is the
access-token lifetime — one hour on CSS. "Periodically logged out", precisely.

### 6. A rotated refresh token could be lost for good

`renewTokens` does this, in this order:

1. POST the refresh token. The provider consumes it and issues a replacement.
2. Fetch the JWKS **over the network** and verify the new access token.
3. *Only then* write the replacement to IndexedDB.

Step 2 can fail on its own: `createRemoteJWKSet` is constructed fresh per refresh,
so every refresh depends on a live JWKS fetch, and `jose` verifies with
`clockTolerance` defaulting to zero, so a phone a few seconds out of sync fails
here too. When it does, the replacement is discarded while the provider has
already retired the original. IndexedDB is left holding a spent token.

Presenting a spent refresh token is how OAuth clients signal a stolen-token
replay, so providers do not merely refuse it. From `oidc-provider`, which backs
both CSS and Inrupt's ESS:

```js
if (refreshToken.consumed) {
  await Promise.all([
    refreshToken.destroy(),
    revoke(ctx, refreshToken.grantId),   // the entire grant
  ]);
  throw new InvalidGrant('refresh token already used');
}
```

The whole grant is revoked. Nothing recovers that but a full re-login.

### 7. Two tabs could revoke each other

`restore()` de-duplicates concurrent refreshes with an in-memory promise — per
instance, so per tab. Two tabs share one IndexedDB but not that promise. Two tabs
waking together read the same refresh token and both spend it; the loser trips
the replay detection above and takes the grant down for both.

How often that bites depends on the provider's rotation policy, which is why this
was worse on Inrupt than on a local CSS. `oidc-provider`'s default rotates a
DPoP-bound token only once it is 70% through its lifetime — about 17 hours of a
CSS refresh token's 24 — but rotates a public client's token on **every** refresh
when it is not sender-constrained, and deployments tune this freely.

## The phone kept being signed out anyway

Everything above was fixed on the web *and* in the native app — and the Android
app went on losing its session. What was left was not in the refresh path at all.
It was who the app said it was.

### 8. The phone was a throwaway client

Solid-OIDC offers two ways to be a client:

- a **Client ID Document** hosted at an https URL, which the provider re-reads on
  every grant. Nothing about it can lapse.
- a **dynamic registration**, created at login, which the provider owns and may
  reclaim. Inrupt's ESS expires them; a Community Solid Server loses them
  whenever its registration storage is cleared or reset.

The app has a hosted document at `/client-id.json`, and `VITE_CLIENT_ID_URL`
points the deployed site at it. Everywhere else fell back to dynamic
registration, and "everywhere else" quietly included both native apps: Capacitor
serves the shell from `https://localhost`, and the document listed only
`https://packmeup.tim-gent.com/` as a redirect URI, so the phone could not have
used it even if the build had been configured to.

When such a registration is reclaimed, the next refresh comes back
`invalid_client`. That is terminal by definition — the app is no longer a client
the provider has heard of — so no amount of retrying helps, and the refresh token
in IndexedDB is still perfectly good when the user is signed out. It looks
exactly like every bug above, and none of the fixes above touch it. It is also
why the web app was fine while the phone was not: the web app has never been a
dynamic client in production.

`public/client-id.json` now lists `https://localhost/` too — Capacitor uses its
https scheme on both platforms, so one entry covers Android and iOS — and
`solidClientIdentity.ts` gives the native shell the hosted document. Only an
origin with no document of its own (localhost, a preview deploy) still registers
dynamically, where a lost session costs nothing.

Because the client id is stored per session, existing installs keep the dynamic
client they logged in with. The change takes effect at the next login.

### 9. A transient failure could be nobody's job

`ResilientSession` retries within one `restore()`, and `SolidPodContext` retries
on a backoff — but only for a session that is *not* active. A phone that wakes
with the radio still down is the other case: the renewal timer that came due
while the device slept fires, the refresh fails transiently, and the app is still
"logged in", so neither backoff engages. Nothing was booked. The token then
lapsed in silence, and the grant was left to age until the provider gave up on
it.

`ResilientSession` now books its own retry after a transient failure, backing off
to five minutes and re-arming the normal schedule as soon as one succeeds.

### 10. Waking up was not always noticed

Coming back to the app is the one moment a stale session must be looked at, and
`visibilitychange` was the only signal for it. An Android WebView whose activity
is paused and resumed does not reliably report a visibility change — the timers
were frozen with the process, so if nothing notices the resume, nothing renews.
`onAppResumed` (`src/services/appResume.ts`) listens for the App plugin's
`appStateChange` as well, which is the event that always arrives on a phone.

### 11. Two ways to lose the whole session anyway

`SessionCore._updateSessionDetailsFromToken` answers an access token it cannot
read — no `webid` claim, no `exp`, not a JWT — by calling its own `logout()`,
which clears IndexedDB and the refresh token with it. That is bug 4 by another
route, reachable from a provider having a bad minute rather than from a 401.
`ResilientSession` now rejects such a token as transient *before* handing it to
`setTokenDetails`, so nothing but a deliberate sign-out ever clears the database.

Finally, a session ending is not an error anything throws, so nothing reached
Sentry: on a phone, where the sign-in history cannot be read over someone's
shoulder, expiries were invisible. `reportSessionEnded` now reports the reason —
and only the reason, nothing identifying — so `invalid_grant` (a dead grant) can
be told apart from `invalid_client` (a stale registration) without the device in
hand.

## What changed

A `ResilientSession` subclass (`src/services/ResilientSession.ts`) keeps
`SessionCore`'s login, DPoP and fetch handling and replaces the refresh:

- **The rotated refresh token is banked before anything that can throw.** This is
  the fix for bug 6, and the one that turns an unrecoverable failure into a
  retryable one.
- **Refreshes are serialised across tabs** with the Web Locks API, so two tabs
  cannot spend the same token (bug 7).
- **Failures are classified.** Only `invalid_grant` / `invalid_client` from the
  provider, or a DPoP key that no longer matches, end a session. A network error,
  a 5xx, a 429, a failed JWKS fetch and a clock-skew verification failure are all
  retried (bugs 1, 2).
- **Verification tolerates 5 minutes of clock skew**, and the JWKS is cached per
  issuer instead of refetched every refresh (bug 6).
- **Renewal happens 2 minutes before expiry**, on a timer pegged to the token's
  own lifetime, and again on tab focus and on coming back online (bug 5).

`SolidPodContext` then stops throwing away what it has:

- It **never** calls the library's `logout()` on a 401 — the only thing that
  clears IndexedDB is a deliberate sign-out (bug 4).
- A restore that fails transiently is retried on a backoff out to 90 seconds, and
  immediately on `online` or tab focus (bugs 1, 3).
- Startup waits at most 4 seconds for a restore before rendering; the retry
  continues in the background and signs the user in when it lands.
- A failed OAuth callback no longer prevents restoring the session already on the
  device.
- The native app identifies itself with the hosted Client ID Document, so its
  client registration cannot be reclaimed underneath it (bug 8).
- A transient failure always books its own next attempt (bug 9), and a resume is
  noticed through the App plugin as well as `visibilitychange` (bug 10).
- An access token the library cannot read is refused before it can trigger the
  library's `logout()` (bug 11).

## If it ever happens again

**Your data → Sign-in history** keeps the last 300 auth events on the device,
across reloads and restarts: every renewal, every retry, every failure, and the
reason the provider gave. "Copy for a bug report" is the whole sequence. Nothing
in it is sent anywhere on its own.

The event to look for is `refresh.session-ended`. Its `reason` says whether the
provider rejected the grant (`invalid_grant` — the session genuinely ended), the
registration went stale (`invalid_client` — see bug 8) or something else. That
reason also goes to Sentry as `Solid session ended: <reason>`, tagged
`auth_session_ended`, which is how a phone's expiry can be read without the
phone. Repeated `refresh.failed-transiently` or `restore.will-retry`
without a matching `refresh.succeeded` means the app is trying and failing to
reach the token endpoint, which is a network or provider-availability story
rather than an auth one.

## What this does not cover

Browser storage eviction is outside the app's reach. Safari's ITP clears
script-writable storage — IndexedDB included — after 7 days without a visit to
the site, and any browser may evict under storage pressure. When that happens the
refresh token is gone before the app runs, and re-authenticating is the only
option. A user signed out roughly weekly on Safari, having not opened the app in
between, is seeing this rather than anything above.
