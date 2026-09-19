# Invite links did not work when the inviter is on an ACP Pod

**Status: fixed and verified end-to-end.** `acceptInvite` now sends a SPARQL
Update PATCH (`application/sparql-update`) instead of an N3-Patch
(`text/n3`). That is the entire fix — no permission model changes, no ACP
detection, no lower-level `acp_ess_2` work. See "The fix" at the bottom of
this doc for the change and the reasoning; the rest of this document is the
investigation that found it, kept for the reasoning trail and because the
diagnostic recipes in it are reusable for the next Solid interop surprise.

Sentry: `JAVASCRIPT-REACT-1A` (`InviteAcceptError`, 2 events, production).

## The symptom

Inviter on an Inrupt Pod creates an invite link. The invitee — on a Community
Solid Server Pod — opens it, signs in, taps **Accept**, and gets:

> This invite link is not accepting replies. Ask them to send you a new one.

The inviter's end reports success throughout, so nothing on that side suggests
anything is wrong.

## The short version

Every invite is one resource granted **public Append and nothing else**, and
accepting is an insert-only N3 PATCH against it (`services/invites.ts`). That
design rests entirely on the Pod honouring a public `acl:Append` grant.

E2E suite N proves the round trip works — **on Community Solid Server, which
uses WAC**. Inrupt's ESS uses **ACP**, and no test, manual or automated, has
ever exercised an invite on an ACP Pod. That is the untested axis, and it is the
one that fails.

Worse, the guard that was supposed to catch exactly this cannot fire on ACP. See
below.

## What is established

### 1. The failure is the accept-side PATCH, and the status is 401 or 403

From the Sentry stack trace, the throw is `services/invites.ts` in the
`response.status === 401 || response.status === 403` branch. Which of the two it
is, is **not recorded** — see "Loose end: diagnosability" below.

### 2. The inviter's Pod is ACP

WebID `https://id.inrupt.com/timgent` resolves to `solid:oidcIssuer
<https://login.inrupt.com>` and `pim:storage <https://storage.inrupt.com/…/>`.
Storage under `storage.inrupt.com` is ESS, so access control is ACP, not WAC.

### 3. `createInvite`'s grant check is vacuous on ACP — confirmed by reading solid-client

This is the important finding. `services/invites.ts` does:

```ts
granted = await universalAccess.setPublicAccess(url, { read: false, append: true, write: false }, …)
if (granted === null || granted.append !== true) { /* delete the resource, throw InviteAccessError */ }
```

The intent is "refuse to hand out a link the Pod will not honour". On ACP it
cannot do that. In `@inrupt/solid-client@2.1.2`:

- `dist/universal/setPublicAccess.mjs` — when the resource has an ACR (i.e. ACP),
  it writes the ACR and returns `dist/universal/getPublicAccess.mjs`.
- `dist/universal/getPublicAccess.mjs` — with an ACR present, returns
  `getPublicAccess$2(acr)`, which is `acp/util/getPublicAccess.mjs` →
  `acp/util/getAgentAccess.mjs`.
- That function is a **pure client-side parse** of the ACR document
  (`isAgentMatched` / `reduceModes` walking `acp:anyOf` / `acp:allow` triples).

So on ACP the check confirms only *"the triples I just wrote came back"*. It
never asks the server whether the grant is enforceable. On WAC the same call
goes through `access/wac.mjs` and reads back the ACL resource, which is a much
closer proxy for enforcement — which is why suite N is green and a real Inrupt
Pod is not.

**Consequence:** on an ACP Pod the inviter *always* gets a link that reports
success, whether or not the grant means anything. Any fix must include a
verification that reflects what the server will actually enforce, not a re-parse
of our own document.

### 4. ESS answers every unauthenticated request with 401

Verified directly against the Pod, unauthenticated, with `curl`:

| Request | Status |
|---|---|
| `GET /` | 401 |
| `GET /pack-me-up/` | 401 |
| `GET /pack-me-up/invites/` | 401 |
| `GET /pack-me-up/invites/<a real token>` | 401 |
| `GET /pack-me-up/invites/definitely-not-a-token` | 401 |
| `GET /profile` | 401 |
| insert-only N3 `PATCH` on three real invite resources | 401 |

Note it does **not** distinguish a resource that exists from one that does not.
This matters twice over: it means 401 tells us nothing about whether the grant
took, and it means **a "retry unauthenticated" fallback is not automatically a
fix** — which was the first idea, and it is not obviously right.

The PATCH probe used a deliberately no-op body (inserting
`<…#invite> a pmu:Invite`, a triple `inviteToDataset` always writes, so RDF set
semantics make re-inserting it a no-op). Reuse that trick — it tests the
permission without altering anyone's invite.

### 5. Invite *creation* works on ESS

At the time this was written the Pod held five orphaned invite resources
under `pack-me-up/invites/` from the failed attempts, plus one or two more
created by this investigation (all since cleaned up — see "Cleanup owed on
the test Pod" below). So the PUT and the ACR write both succeed; it is purely
the accept that fails.

## Confirmed: possibility (B)

Both halves of the question below have now been tested live against the real
Inrupt Pod, and the answer is **(B): the ACR is correct, but ESS will not act
on it for this operation.**

### The ACR is correctly formed — (A) is ruled out

Reading a freshly-created invite's ACR back (`acp_ess_2.getSolidDatasetWithAcr`
+ `solidDatasetAsTurtle`) shows exactly the shape the documentation describes:

```turtle
<#defaultAccessControlAgentMatcherAppendPolicy> a acp:Policy;
    acp:allow acl:Append;
    acp:anyOf <#defaultAccessControlAgentMatcherAppendPolicyMatcher>.
<#defaultAccessControlAgentMatcherAppendPolicyMatcher> a acp:Matcher;
    acp:agent acp:PublicAgent.
<#defaultAccessControl> a acp:AccessControl;
    acp:apply <#defaultAccessControlAgentMatcherAppendPolicy>.
<> a acp:AccessControlResource;
    acp:accessControl <#defaultAccessControl>, <#defaultMemberAccessControl>, <#3faf1ee3-…>.
```

The Append policy is reachable via the plain `acp:accessControl` (not
`acp:memberAccessControl` — this is a file, not a container, so the member
branch is irrelevant here and was confirmed empty), its matcher names
`acp:PublicAgent` directly, and the policy `acp:allow`s `acl:Append`. There is
no way to read this as anything other than "anyone may append." `(A)` — a
policy landing in the wrong branch, or `setPublicAccess` silently failing to
record one — is ruled out.

*(The ACR also lists two other access controls,
`da80dc90…#defaultMemberAccessControl` and `da9273af…#3faf1ee3-…`, which live
in separate authorization documents and were not fetched or inspected. They
are presumed to be ESS's standard owner/member defaults, not something that
denies Append, but this is an assumption, not a checked fact.)*

### A genuine authenticated foreign PATCH gets 403 — (B) is confirmed

The critical experiment the previous version of this doc could not finish:
have a *different person, on a different Pod, on a different provider* actually
try to accept a real invite link, and watch the real HTTP status.

Result, reproduced twice: **403 Forbidden**, from `https://storage.inrupt.com`,
on the exact insert-only N3 PATCH `acceptInvite` sends, from a WebID at
`https://pack-me-up-test.solidcommunity.net/` (Community Solid Server, a
different provider entirely, publicly reachable) that had never been granted
anything on the inviter's Pod before.

403, not 401, matters: it means ESS successfully authenticated the requester
(resolved their WebID, fetched their provider's JWKS, validated the DPoP-bound
token) and *then* refused the operation. This was a clean read — no ambiguity
about whether the token could even be checked.

**A pitfall worth recording so it isn't repeated:** the first attempt at this
used a same-machine local Community Solid Server (`http://localhost:4000`) as
the "different person," reasoning that the app can't tell one Solid provider
from another. That reasoning is wrong for this specific test. ESS has to
dereference the invitee's WebID and fetch their issuer's OIDC config/JWKS to
validate the token — none of `http://localhost:4000/…` is reachable from
Inrupt's infrastructure. That attempt got **401 with an empty body**, which is
indistinguishable from "ESS ignored the public grant": a resource server that
cannot validate a token typically treats the request as unauthenticated, and
finding 4 already established that ESS 401s *every* unauthenticated request
regardless of the target resource's ACL. Any repeat of this experiment must use
a publicly-resolvable second identity — the original suggestion of
solidcommunity.net was correct; a throwaway local Pod is not a substitute.

(A second, more minor discrepancy from that same confounded run: the
`read_network_requests` browser-extension tool reported the PATCH as a 503,
while the app's own `response.status` — read directly, in-code — said 401. On
the clean solidcommunity.net run both agreed on 403. The 401-vs-503 mismatch
was not chased down; it may be nothing more than the extension's network
inspector misattributing a request, but note it as an open discrepancy rather
than a resolved one.)

## The remaining open question — resolved, see "The fix" below

*(Left as originally written, since the reasoning here is what led to the
experiment that found the answer. Skip to "The fix" for the resolution.)*

(B) was itself an either/or in the previous version of this doc, and only the
top level is confirmed. The two sub-cases still need distinguishing, because
they imply different fixes:

- **(B1) ESS refuses anonymous requests outright, and separately does not
  extend `acp:PublicAgent` to authenticated-but-otherwise-unrelated agents
  either** — i.e. `acp:PublicAgent` on this ESS deployment is effectively
  unusable for literally anyone. If so, the per-resource public-Append drop
  box this design rests on does not work on ACP at all, for any requester, and
  invites need a different shape there (or ACP needs to be detected and
  invite links disabled in favour of share-by-address, which already works —
  see `jojanna`'s full-setup access in the Sharing page, granted to a *named*
  WebID rather than PublicAgent).
- **(B2) ESS does not accept `acl:Append` alone as sufficient for an N3
  PATCH**, regardless of who is asking, and would accept the identical request
  if the grant also included `acl:Write`. Inrupt's own docs say "Either
  `Append` or `Write` access on an RDF resource allows agents to add content
  (statements) to the resource," so this would contradict Inrupt's own
  documentation — but it is the cheaper thing to rule out and hasn't been
  tested.

**This experiment has now been run**, directly on the real invite from the
403 result above: `universalAccess.setPublicAccess(url, { read: false, append:
true, write: true })` on the same resource, then the identical accept retried
from the same already-authenticated solidcommunity.net session.

**Result: 415 Unsupported Media Type** — not 2xx, and not 403 either. This is
more informative than either clean outcome would have been on its own:

- **The 403 → 415 transition is itself evidence for (B2).** If ESS's
  authorization check for this resource were unaffected by adding `write`,
  the request should still have failed with 403 before ever reaching content
  parsing — the same as it did every time with append-only. Instead the
  *first* thing that changed was the failure mode entirely, which is
  consistent with authorization now passing and the request going on to fail
  for an unrelated reason further down the pipeline. That is exactly (B2):
  **`acl:Append` alone is not being treated as sufficient for this insert-only
  N3 PATCH; `acl:Write` is required**, contradicting Inrupt's own
  documentation quoted above. This is inferred from the change in failure
  mode, not proven by inspecting ESS's authorization code — worth stating
  plainly as inference, not certainty.
- **But a second, independent bug sits behind it.** 415 means ESS rejected the
  request body's `Content-Type: text/n3` outright — the N3-Patch format
  `acceptInvite` sends (`services/invites.ts`, `inviteAcceptancePatch` in
  `rdfSerialization.ts`) appears to not be a format ESS's PATCH handler
  accepts, independent of permissions entirely. Solid servers have
  historically diverged here: some accept only `application/sparql-update`
  PATCH bodies, others (including Community Solid Server, which is why suite N
  is green) accept N3-Patch. **This was not tested in isolation** — the 415
  was only ever observed with `write: true` already granted, because that is
  the only state where the request got past authorization far enough to reach
  content-type handling. It has not been confirmed whether an
  `application/sparql-update` PATCH would succeed with append-only (`write:
  false`), which would be the cleaner test of (B2) in isolation, decoupled
  from the content-type question. **That is the next experiment**, not yet
  run: revert the grant to append-only, and retry acceptance with a
  SPARQL-Update body/content-type instead of N3-Patch. Two outcomes:
  - Succeeds with append-only → the real bug was content-type all along, (B2)
    was a red herring, and the fix is switching `acceptInvite` to send
    SPARQL-Update on ACP Pods (or always, if CSS accepts both).
  - Still fails (403 again) → (B2) holds independently of content-type, and
    Append genuinely does not suffice on ESS for either patch format.

**Either way, granting public `write: true` is not a usable fix as it stands**
— it was a diagnostic probe, not a proposal. It breaks the property the
design rests on: a public-Write grant lets any holder of the link overwrite or
delete the invite outright (not just insert their own WebID), which breaks
revocation and the "one link, one use" shape. Nothing below `write` currently
appears able to get an insert-only PATCH accepted on this ESS Pod at all —
which, if true after the SPARQL-Update test above, would mean the per-resource
public-Append drop box this design rests on does not work on ACP at all, and
invites need a different shape there (or ACP needs to be detected and invite
links disabled in favour of share-by-address, which already works — see
`jojanna`'s full-setup access in the Sharing page, granted to a *named* WebID
rather than PublicAgent, not through this mechanism).

The `acp:AuthenticatedAgent` idea from the previous version of this
investigation (`acp_ess_2.setAuthenticated`) is deprioritised for now: the
403→415 transition already points at an Append-vs-Write and/or content-type
explanation that doesn't need it, and it's a much bigger implementation lift
(low-level `acp_ess_2` policy APIs) than either remaining test. Revisit only
if the SPARQL-Update experiment above rules out both (B2) and the content-type
explanation.

## How to run the experiment locally

**Update: this has now been run successfully**, end to end — the ACR dump,
the anonymous probe, and the authenticated foreign-Pod accept — the results
are in "Confirmed: possibility (B)" above. The sandbox that blocked the
original attempt was Claude's own (an egress proxy dropping a large fraction
of requests, `net::ERR_TOO_MANY_RETRIES`); running from the user's own
machine via browser automation avoided it entirely. This section is kept as a
recipe for whoever runs the next experiment (the SPARQL-Update test above),
plus two things learned the hard way:

- Vite serves TypeScript source transpiled at the same URL, so line numbers in
  browser stack traces will not match the `.ts` file's line numbers — expect
  this, don't chase it as a caching bug.
- Changing only the URL hash (`#/…`) does not reload the page in a
  `HashRouter` app, so editing a file and expecting the running tab to pick it
  up requires an actual full navigation or `location.reload()` — a hash-only
  `navigate()` will keep running the old in-memory module indefinitely, which
  looks exactly like a stale build.

The rest of this section is the original (pre-run) plan, left intact as
reference:

This environment could not finish it: the sandbox egress proxy drops a large
fraction of requests (`net::ERR_TOO_MANY_RETRIES`), and the Inrupt login is a
multi-hop redirect chain through AWS Cognito, so it rarely survives end to end.
Locally there is no proxy and this should be quick.

Two things that were learned the hard way and are worth keeping:

- Launching Chromium with `--disable-http2 --disable-quic` removed nearly all
  the proxy failures. Irrelevant without a proxy, but noted.
- Playwright's `proxy` option bypasses `NO_PROXY`, so `bypass:
  'localhost,127.0.0.1,::1'` is needed or the app itself becomes unreachable.

### The diagnostic page

Drop this in as `src/pages/debug-acp.tsx`, add
`<Route path="/debug-acp" element={<DebugAcpPage />} />` to `App.tsx`, sign in as
the Inrupt account and open `#/debug-acp`. **Local only — do not commit it.**

```tsx
import { useEffect, useRef, useState } from 'react'
import { acp_ess_2, solidDatasetAsTurtle, universalAccess } from '@inrupt/solid-client'
import { useSolidPod } from '../components/SolidPodContext'
import { createInvite } from '../services/invites'
import { getPrimaryPodUrl } from '../services/solidPod'

export function DebugAcpPage() {
    const { session } = useSolidPod()
    const [out, setOut] = useState('')
    const log = (s: string) => setOut(prev => prev + s + '\n')

    const run = async () => {
        try {
            const podUrl = await getPrimaryPodUrl(session!)
            const fresh = await createInvite(session!, podUrl!, { kind: 'full-setup' })
            log('CREATED: ' + fresh.url)

            log('getPublicAccess: ' + JSON.stringify(
                await universalAccess.getPublicAccess(fresh.url, { fetch: session!.fetch })))

            const withAcr = await acp_ess_2.getSolidDatasetWithAcr(fresh.url, { fetch: session!.fetch })
            log('hasAccessibleAcr: ' + acp_ess_2.hasAccessibleAcr(withAcr))
            if (acp_ess_2.hasAccessibleAcr(withAcr)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                log('--- ACR ---\n' + await solidDatasetAsTurtle((withAcr as any).internal_acp.acr))
            }

            // A no-op insert: this triple is always already present, so RDF set
            // semantics mean it changes nothing. It tests only the permission.
            const body = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n`
                + `<#p> a solid:InsertDeletePatch; solid:inserts { <${fresh.url}#invite> `
                + `<http://www.w3.org/1999/02/22-rdf-syntax-ns#type> `
                + `<https://pack-me-up.app/vocab#Invite>. }.`
            const anon = await fetch(fresh.url, {
                method: 'PATCH', headers: { 'Content-Type': 'text/n3' }, body })
            log('ANON PATCH: ' + anon.status + ' ' + (await anon.text()).slice(0, 150))
            log('ANON GET: ' + (await fetch(fresh.url)).status)
        } catch (e) {
            log('ERROR: ' + (e instanceof Error ? `${e.name}: ${e.message}` : String(e)))
        }
    }

    const started = useRef(false)
    useEffect(() => {
        if (started.current || !session?.info.webId) return
        started.current = true
        void run()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.info.webId])

    return <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{out}</pre>
}
```

### Reading the result

- `ANON PATCH` is **2xx** → the grant works anonymously; the bug is in the
  *authenticated* accept request, and the fix is to stop sending the invitee's
  token (or fall back to an unauthenticated retry on 401/403). Note this would
  contradict finding 4, so double-check it.
- `ANON PATCH` is **401/403** and the ACR **does** carry a public-Append policy →
  possibility (B).
- `ANON PATCH` is **401/403** and the ACR **does not** → possibility (A).

### Then confirm the real scenario

Whatever the probe says, finish by signing in as a CSS account
(solidcommunity.net now runs "Pivot"; the login form is at
`/.account/login/password/` with `#email` / `#password` and a **Log in** button)
and accepting a real invite link, watching the PATCH in devtools. That is the
user's actual path and the only thing that proves the fix.

## Loose end: diagnosability — fixed

`InviteAcceptError` carries a `status`, but `errorReporting.ts` used to do
`Sentry.captureException(toReportableError(error))` and nothing else, so the
status never left the device — which is why the original Sentry issue could
not say whether it was a 401 or a 403. Fixed: `reportError` now attaches a
`status` found on the error (or on `error.cause`, for a wrapped non-Error) as
Sentry `extra` context. See `src/errorReporting.ts` and its tests. The next
ACP-invite Sentry event will carry the real status.

## Cleanup owed on the test Pod — done

All invite links on the Inrupt test Pod (the original orphans, plus every one
created during this investigation, including the one temporarily widened to
public `write: true`) were revoked via the Sharing page's Revoke buttons
before this investigation ended. `jojanna`'s legitimate full-setup access and
the public list share were left untouched. `pack-me-up/invites/` should be
empty; if a future run leaves orphans behind, the same Revoke path (or
`deleteInvite`) clears them — don't record live tokens in this doc, since the
repository is public.

## The fix

The SPARQL-Update experiment above (append-only grant, `application/
sparql-update` body instead of N3-Patch) got **204 No Content** — success,
under the original append-only grant, no permission changes needed. Confirmed
a second time end-to-end through the real UI (not a hand-rolled probe): a
fresh invite created as the ACP-Pod inviter, accepted by a genuinely
independent, publicly-resolvable identity (`pack-me-up-test` on
solidcommunity.net, a different provider entirely), landed on the app's
"Accepted" screen exactly as intended.

**The full picture, now that it's resolved:** ESS's N3-Patch handler appears
to require `acl:Write` for *any* N3 Patch against an ACP-controlled resource,
even an insert-only one — contradicting Inrupt's own docs, which is why
append-only + N3-Patch got 403, and write + N3-Patch got past authorization
only to hit 415 (ESS's PATCH-body handling for N3-Patch on this resource type
appears to not be fully wired up, or requires something this investigation
didn't isolate further, now moot). ESS's SPARQL-Update handler, by contrast,
correctly recognises an `INSERT DATA`-only patch as sufficient for `acl:Append`
alone. Community Solid Server accepts both formats and was already passing
suite N on N3-Patch, so switching to SPARQL-Update changes nothing there.

**The change**, both non-N3, both minimal:

- `src/services/rdfSerialization.ts` — `inviteAcceptancePatch` now returns
  a bare `INSERT DATA { <subject> <predicate> <object>. }` instead of an
  N3-Patch document. No `@prefix`, no `solid:InsertDeletePatch` wrapper.
- `src/services/invites.ts` — `acceptInvite` sends it with `Content-Type:
  application/sparql-update` instead of `text/n3`.

Nothing about the ACP-vacuous-guard problem (`createInvite`'s
`setPublicAccess` check — see finding 3) is fixed by this; that guard still
cannot verify a grant will be enforced on ACP. It happened not to matter here
because the actual answer was "the grant is fine, the *request format* was
wrong" — but a future ACP quirk that really does deny the grant would still
sail past that guard undetected. Worth its own fix, separately, if it recurs.

## Suggested regression coverage now this is fixed

Suite N runs entirely on CSS, so it never exercised the N3-Patch vs
SPARQL-Update distinction and would have stayed green even with the bug
present (CSS accepts N3-Patch fine). Worth adding:

- A unit test on `acceptInvite` asserting `Content-Type: application/
  sparql-update` and the SPARQL `INSERT DATA` shape — this exists now (see
  `invites.test.ts`, `rdfSerialization.test.ts`), and is the guard against a
  regression back to N3-Patch.
- An ACP-backed e2e remains the one thing no unit test can stand in for —
  worth doing if a test ACP server becomes available — but is no longer
  blocking, since this fix has been proven against the real Inrupt Pod by
  hand.
