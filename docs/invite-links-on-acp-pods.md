# Invite links do not work when the inviter is on an ACP Pod

**Status: open investigation, no fix written yet.** This is a handover note. It
records what has been established, what has been ruled out, and the single
experiment that still needs running — so that whoever picks this up does not
repeat three hours of it.

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

The Pod currently holds five orphaned invite resources under
`pack-me-up/invites/` from the failed attempts, plus one or two more created by
this investigation. So the PUT and the ACR write both succeed; it is purely the
accept that fails.

## The one open question

**Does ESS honour a public `acl:Append` grant for an insert-only N3 PATCH?**

Two possibilities, two different fixes:

- **(A) The ACR never records an effective public-Append policy.** Then
  `setPublicAccess` is the wrong tool on ACP and the fix is to write the policy
  with the `acp_ess_2` APIs directly — much as `addAcpMemberAccess` in
  `services/solidPod.ts` already does for member policies — plus a guard that
  genuinely verifies.
- **(B) The ACR is correct but ESS will not act on it for this operation**
  (either refusing anonymous requests outright, or not accepting Append alone
  for a PATCH). Then the per-resource public-Append drop box does not work on
  ACP at all, and invites need a different shape there. Inrupt's own docs say
  "Either `Append` or `Write` access on an RDF resource allows agents to add
  content (statements) to the resource", so (B) would contradict the
  documentation — worth confirming carefully before designing around it.

Distinguishing them needs one look at the ACR ESS actually stored.

## How to run the experiment locally

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

## Loose end: diagnosability

`InviteAcceptError` carries a `status`, but `errorReporting.ts` does
`Sentry.captureException(toReportableError(error))` and nothing else, so the
status never leaves the device. That is why the Sentry issue could not say
whether this was a 401 or a 403, and why this investigation needed live Pod
access at all. Worth attaching the status (and, more generally, a numeric
`status` on any reported error) regardless of how the rest is fixed.

## Cleanup owed on the test Pod

`pack-me-up/invites/` on the Inrupt test Pod holds several orphaned invite
resources — five from the original failed attempts, plus one or two created
while investigating. Each is a live secret: anyone holding one of those URLs can
append a WebID and be granted the full setup on redemption. They should be
deleted (the Sharing page can revoke them, or `deleteInvite`). The tokens are
deliberately not recorded here — this repository is public.

## Suggested regression coverage once fixed

Suite N runs entirely on CSS, so it cannot catch this class of bug. Whatever the
fix, the thing worth pinning is that **the inviter is refused a link when the
Pod will not honour the grant** — that is the property `createInvite` was
supposed to have and provably does not on ACP. A unit test that mocks
`setPublicAccess` returning a value parsed from an ACR the server would ignore
is the cheap version; an ACP-backed e2e is the real one, if a test ACP server
can be stood up.
