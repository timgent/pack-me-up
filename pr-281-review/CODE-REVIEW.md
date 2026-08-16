# Code review — PR #281

**Title:** Person profile photos, past-trip folding, navigation & wizard improvements
**Author:** @m5x5 (external contributor, fork `m5x5/pack-me-up`, head branch `main`)
**Base:** `timgent/pack-me-up@7b748a3` · **Head:** `8d15ee3`
**Size:** 77 files, +3,423 / −931, 15 commits · **State:** open, draft, `mergeable_state: blocked`
**Reviewed at:** 2026-08-16

---

## Verdict

**Do not merge as one unit.** The work is careful and mostly good — the comments are
thoughtful, the persistence guard in `CLAUDE.md` was followed correctly, and the test
coverage is real. But this is not the PR its description says it is.

The description covers roughly a third of what's in the branch. The other two thirds
include an app-wide dark mode, a rewrite of the Solid provider picker, a rewrite of the
core `updateFromQuestions` diff algorithm, a restructure of the main navigation (with
nav links removed), and an entire RDF "Application Capability" subsystem with a new
Vercel edge middleware intercepting the production homepage. Any one of those is a PR.

My recommendation is to ask the contributor to split it, and to take the parts in
roughly this order:

| Tranche | Contents | Recommendation |
|---|---|---|
| 1 | `tripIsPast` + past-trip folding, packing list card / Radix menu | Merge after fixing B4, B5 |
| 2 | Person `webId` + profile photos (`PersonAvatar`, `usePersonProfilePhotos`, `solidPod`) | Merge after fixing B2, B3 |
| 3 | Dark mode (`ThemeContext`, `index.html`, ~40 files of `dark:` classes) | Merge after fixing B1 and a contrast pass |
| 4 | Navigation restructure + Solid provider picker rewrite | **Product decisions needed from you first** — see §3 |
| 5 | `updateFromQuestions` rewrite | Needs its own review; highest regression risk in the PR |
| 6 | Application Capability document + middleware | **Separate PR, own discussion** — see §5 |

Nothing here is malicious. I read `src/capability/document.ts` and `middleware.ts` in
full specifically because a 415-line machine-readable "capability description" served
to non-browser clients from an external contributor deserves that scrutiny. It is what
it claims to be: an implementation of the dokieli Application Capability spec. It is
still scope creep of an unusual kind and shouldn't ride in on a UI PR.

---

## 1. What's actually in the branch

Commits, oldest first:

```
3056329  Local working changes: person avatars, profile photos, wizard hint
f044946  Show profile photo and name in mobile navbar instead of raw WebID
8531f40  Match packing list title style to My Questions & Items
b84f7cd  Turn Solid provider picker into a search box with live results
811567c  Drop the What is a Solid Pod explanation from the provider picker
d9c4455  Fix modal width jitter and default custom Pod URLs to https://
5b58e1d  Show a connecting spinner during the Solid login redirect
d2f5bdf  Add app-wide dark mode with system preference + manual toggle
bc1e355  Hide section names next to the mobile Reorder button
ec9a027  Serve an Application Capability description at / via content negotiation
56327b8  Merge pull request #1 from m5x5/claude/mobile-navbar-profile-mtlwkh
c841617  Merge branch 'main' of https://github.com/timgent/pack-me-up
b24d248  Improve update-from-questions flow
9ca5c5d  Merge remote-tracking branch 'fork/main'
8d15ee3  Restate the Application Capability description as RDFa in the footer
```

**Undocumented in the PR description** (i.e. you would only find these by reading the diff):

- App-wide dark mode, touching ~40 files with `dark:` Tailwind variants, plus a new
  `ThemeContext`, a pre-paint inline script in `index.html`, and a nav toggle.
- The Solid provider picker rewritten from a "primary provider + expandable list +
  custom URL form" into a single search box with live filtering. **The "What is a
  Solid Pod?" explainer is deleted.**
- Two new runtime dependencies: `lucide-react` (icons) and `@vercel/functions`.
- A new root-level `middleware.ts` (Vercel edge middleware) that intercepts `GET /` on
  production and content-negotiates away from the SPA.
- `src/capability/document.ts` — 415 lines of hand-maintained JSON-LD **and** Turtle
  that must be kept in sync by hand, plus `ApplicationCapabilityRdfa.tsx` restating the
  same triples a third time in the footer.
- A substantial rewrite of `computeQuestionSetAdditions` into a four-pass diff engine
  (`computeQuestionSetChanges`) that now detects renames, section moves, quantity
  changes and shared/personal transitions.
- Navigation restructure: **"Create List" removed from the nav entirely**, "View Lists"
  renamed to "Lists", and "Backups"/"Sharing" moved into a new account dropdown.
- `.gitignore` now ignores `.env*`.

---

## 2. Bugs

Ranked by how much they'd hurt in production.

### B1 — Dark mode: a user's explicit theme choice is overridden by the OS
`src/components/ThemeContext.tsx:31-38`

```ts
useEffect(() => {
    if (localStorage.getItem(THEME_KEY)) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setThemeState(getSystemTheme())
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
}, [])                                    // ← never re-runs
```

The comment directly above it says "once they do, their choice sticks regardless of OS
changes." It doesn't. The dependency array is empty, so the guard is evaluated **once
at mount**. A user who arrives with no stored preference gets the listener attached;
when they then click the toggle, the listener is still attached (the effect never
re-runs to tear it down). The next OS theme change calls `setThemeState(getSystemTheme())`
and silently overrides them.

Worse, it overrides them *only in memory* — `setThemeState` doesn't write localStorage —
so the app is now showing light while storage says dark, and the next reload flips it
back. That inconsistency will read as "the dark mode toggle is broken."

Fix: make the effect depend on the stored preference, or read localStorage inside
`onChange` rather than outside the listener.

### B2 — Profile photos are keyed by person *name* and never evicted
`src/hooks/usePersonProfilePhotos.ts:31-42`

```ts
setPhotoByName(prev => ({ ...prev, [name]: photo }))
```

Three problems compounding:

1. **Name is not a stable identity.** `Person` has an `id`; the map is keyed on `name`.
   Two people called "Sam" share one photo — whichever WebID resolves last wins.
2. **The map only ever grows.** Nothing clears entries. Remove a person, rename them,
   or change their WebID to one without a photo, and the old photo keeps rendering
   against the new state until a full reload.
3. **Renaming a person orphans their photo** and simultaneously creates a stale entry
   under the old name.

Key it by `person.id` and reset the map when `rosterKey` changes.

### B3 — N+1 unauthenticated-cache-free pod fetches on every mount
`src/hooks/usePersonProfilePhotos.ts:33-40`, `src/components/Navigation.tsx:52-63`

Every person with a WebID triggers its own `getSolidDataset` on every mount of every
component using the hook. No cache, no dedupe, no batching, no abort. Two people
sharing a pod fetch the same profile card twice. Navigate between pages and it all
happens again. On a list with a family of five this is five cross-origin round trips
per page view, each of which can hang.

The `cancelled` flag guards `setState` but doesn't cancel the request, so a fast
navigation still pays the network cost.

There's an existing pattern to follow — `useOwnerDisplayName` — worth reusing or
generalising rather than adding a second uncached profile-fetching path.

### B4 — Dark-mode Delete menu item has a permanent red background (typo)
`src/pages/packing-lists.tsx` (Radix `DropdownMenu.Item` for Delete)

```tsx
className="... hover:bg-danger-50 dark:bg-danger-950/40 cursor-default outline-none"
```

The Duplicate item above it correctly uses `dark:hover:bg-gray-800`. This one says
`dark:bg-…`, not `dark:hover:bg-…`. In dark mode the Delete row is permanently
red-tinted and has no hover feedback at all.

### B5 — Dark-mode contrast: `bg-white/60` pills with `dark:text-gray-*` text
`src/pages/packing-lists.tsx`, several places

The card badges kept `bg-white/60` while gaining `dark:text-gray-400` / `dark:text-gray-300`:

```tsx
<span className="text-sm font-medium text-gray-600 dark:text-gray-400 bg-white/60 px-3 py-1 rounded-lg">
```

In dark mode the pill is still a light translucent white, so the text goes from
readable dark-grey-on-light to mid-grey-on-light. Same pattern on the date pill, the
packed-count pill and the Rename button. These need `dark:bg-white/10` (or similar)
alongside the text change. This is the kind of thing a manual dark-mode pass catches —
see the companion manual test report.

### B6 — A failed provider connection is still saved as "last used"
`src/components/SolidProviderSelector.tsx:handleProviderSelect`

```ts
setConnectingIssuer(issuer)
localStorage.setItem(LAST_PROVIDER_KEY, issuer)   // ← before the attempt
try { await onSelect(issuer) } catch { … show error … }
```

Type a typo'd Pod URL, fail to connect, and that broken URL is now your remembered
provider — it becomes the highlighted primary entry at the top of the list next time
you open the modal. Move the `setItem` into the success path.

### B7 — Enter always picks the first search result, never your typed URL
`src/components/SolidProviderSelector.tsx` (input `onKeyDown`)

```ts
if (matchingProviders.length > 0) handleProviderSelect(matchingProviders[0].issuer)
else handleCustomSubmit()
```

The same box does double duty as "search" and "paste a Pod URL". If what you paste
substring-matches any known provider's name or issuer, Enter connects you to *that
provider* instead of your pod. `handleCustomSubmit` (and therefore `normalizeIssuerUrl`,
the `https://` defaulting this PR added) is only reachable when the query matches
nothing at all.

There's also no visible "use this URL" affordance in the list, so with a self-hosted
pod URL typed in, the UI shows "No matching providers." and the only way to proceed is
to guess that Enter works.

### B8 — `middleware.ts` is type-checked by nothing
`middleware.ts`, `tsconfig.app.json` (`include: ["src"]`), `tsconfig.node.json`
(`include: ["vite.config.ts"]`)

`npm run typecheck` is `tsc -b`, which builds only those two project references.
`middleware.ts` is at the repo root and in neither. So the one file that gates the
production homepage is never type-checked by `npm test`, `npm run build`, or CI.
ESLint does lint it, but without type information.

Add it to a tsconfig include (or give it its own project reference).

### B9 — Diff recomputed on every packing-list mutation
`src/pages/view-packing-list.tsx:340-358`

The effect that decides whether to show "Update from questions" depends on
`packingList`, so **ticking a single checkbox** re-reads the question set from PouchDB
and re-runs the full four-pass `computeQuestionSetChanges`. That's on the hottest path
in the app — the thing users do dozens of times in a row while actually packing.

It also passes `questionSet` straight into `computeQuestionSetChanges` without a null
check; when there's no question set, `questionSet.people.map` throws and is swallowed
by the `.catch`. Works, but by accident.

### B10 — Smaller things

- **`PersonAvatar` never retries.** `photoFailed` state isn't reset when `photoUrl`
  changes, so once one URL 404s the component stays on the initial fallback even if a
  valid URL arrives later. `src/components/PersonAvatar.tsx:21`
- **Gradient rotation restarts per section.** `currentLists.map(renderListCard)` and
  `pastLists.map(renderListCard)` each pass an index starting at 0, so the first past
  trip repeats the first current trip's colour. Cosmetic.
- **`readBirthday` can shift the date a day.** `getDatetime(...).toISOString().slice(0,10)`
  converts through UTC. `src/services/solidPod.ts`. Note also that `birthday` is
  plumbed through `PodOwnerProfile` but nothing in the PR consumes it — dead field.
- **`computeQuestionSetAdditions` is now dead production code.** `view-packing-list.tsx`
  calls `computeQuestionSetChanges` directly; the old function survives only to keep
  the old tests green. Either delete it and port the tests, or keep it and say why.
- **Unguarded `localStorage` in the pre-paint script.** `index.html`'s inline script has
  no `try`/`catch`; in a cookie-blocked or sandboxed context it throws and the theme
  isn't applied. Non-fatal (separate script tag) but trivially guarded.
- **`.gitignore` now has `.env*`**, which shadows the tracked `.env.example`. Already-tracked
  files are unaffected, but it's a trap for anyone re-adding it. Prefer `.env` + `.env.local`.
- **`App.tsx` indentation** wasn't re-flowed when `ThemeProvider` was wrapped around the
  tree, leaving the whole subtree under-indented by one level.

---

## 3. Product decisions you need to make (not bugs)

These are deliberate, defensible changes that alter your product. They're the reason I
wouldn't merge tranche 4 without you weighing in.

1. **"Create List" is gone from the navigation.** `createListPath` was deleted outright.
   Creating a list now requires going to Lists first and using the "New List" button.
   The e2e test was updated to match (`d-navigation.spec.ts`). In foreign-pod context
   there's now no create-list entry point in the nav at all.
2. **"Backups" and "Sharing" moved into an account dropdown**, one click deeper.
3. **"View Lists" renamed to "Lists."**
4. **The "What is a Solid Pod?" explainer is deleted** from the login modal. For a
   Solid-first app whose main adoption hurdle is that nobody knows what a pod is,
   deleting the only in-context explanation is a significant call. If the goal was a
   less cluttered modal, a disclosure triangle would keep both.
5. **"Update from questions" now hides itself when there's nothing to do**, replacing
   the old "This list already matches your questions" message. Better, but it means the
   affordance is invisible rather than reassuring.

---

## 4. The `updateFromQuestions` rewrite

This is the highest-regression-risk change in the PR and it's worth its own review pass
with fresh eyes.

The old function was ~25 lines: regenerate, drop anything already present or previously
deleted, return the rest as additions. The new one is a four-pass matcher —
exact-identity → sharing transitions → rename pairing → leftovers — returning a tagged
union of `add`/`remove`/`update`/`sharing`.

What I like: the guards are thoughtful. Custom items (`questionId === ''`) are excluded
from removal; items from unanswered questions are excluded so a list with missing
generation inputs doesn't show everything as removed (a direct nod to the #260 class of
bug); deleted items are never resurrected.

What concerns me:

- **Pass 3 will revert manual renames.** `groupKey` is `questionId|optionId|personId`.
  If a user renames a generated item by hand, regeneration produces exactly one item in
  that group and the list has exactly one — so it's paired as a "rename" and the update
  flow offers to change it *back*. Previously this was a harmless add. Whether that's
  right depends on whether you consider a hand-edited generated item to be the user's
  or the questions'. It needs a deliberate answer and a test either way.
- **`computeQuestionSetAdditions` semantics changed silently.** It's now
  `computeQuestionSetChanges(...).filter(type === 'add')`. Items that the new passes
  reclassify as `sharing` or `update` no longer appear as additions. The old tests still
  pass because none of them exercise those paths — the function's contract moved
  underneath its test suite.
- **`crypto.randomUUID()` is called directly** in three places here, while the codebase
  has `generateUUID()` in `src/utils/uuid.ts` (used by `packing-lists.tsx`). That
  wrapper presumably exists for a reason — likely the Capacitor/older-WebView case.
  Worth checking this doesn't break the mobile builds.

---

## 5. The Application Capability subsystem

`middleware.ts`, `src/capability/document.ts`, `src/components/ApplicationCapabilityRdfa.tsx`,
`ApplicationCapabilityRdfa.test.tsx`, plus the `@vercel/functions` dependency.

I read this in full. It is a genuine implementation of
[dokieli's Application Capability spec](https://dokieli.github.io/application-capability/):
it describes the app's capabilities, invocation URI templates, CSP/permission
requirements and SHACL shapes, in JSON-LD and Turtle, served from `/` when a client
explicitly asks for `application/ld+json` or `text/turtle`.

It's well-built. The Accept parsing correctly refuses to let a bare `*/*` or a missing
header trigger the RDF path, which is the mistake that would have broken every plain
`curl` of the homepage. The RDFa component's comment explaining why it uses
`<span content=…>` instead of `<meta>` (React 19 hoists `<meta>` into `<head>`, which
would detach it from its `typeof` ancestor) is genuinely good reasoning.

That said, it does not belong in this PR:

- **It intercepts your production homepage.** `matcher: '/'`. If the middleware throws,
  `/` is down. And per B8, it's the one file CI never type-checks.
- **Tie-breaking favours RDF over the app.** `jsonldQ >= htmlQ` means a client sending
  `Accept: application/ld+json, text/html` (both q=1) gets the capability document, not
  the app. No mainstream browser does this, but link-preview bots, feed readers and
  SDK-driven fetches are less predictable. Consider requiring a *strictly* higher q.
- **Three hand-maintained copies of the same triples** (JSON-LD, Turtle, RDFa), with a
  doc comment that says "If you change one, change the other." There's no test asserting
  the JSON-LD and Turtle agree — that's the one test this design most needs.
- **`APP_ORIGIN` is hardcoded** to `https://packmeup.tim-gent.com`, so every Vercel
  preview deployment emits a `content-location` and subject IRIs pointing at production.
- **The file admits it's unverified.** Its own header says network access to w3.org and
  the ODRL/DPV vocabularies was blocked while it was written, and several terms are
  flagged `unverified:` inline. Publishing machine-readable claims about your app that
  the author couldn't check against the specs is a "later, deliberately" thing.
- **It's a strategic choice, not a UI tweak.** Deciding that Pack Me Up publishes a
  formal capability description is a product/architecture decision about the app's place
  in the Solid ecosystem. It should be its own PR with its own conversation.

Also worth noting: the middleware only runs on Vercel. It does nothing under
`npm run dev`, `vite preview`, or the Capacitor mobile builds — so the feature is
unexercised by every test path in the repo.

---

## 6. What the PR gets right

Worth saying plainly, because there's a lot of it:

- **The persistence guard in `CLAUDE.md` was followed exactly.** The new `Person.webId`
  field was added to `fullyPopulatedFixtures.ts`, to the Zod schema, and to both
  directions of the RDF serialisation. This is precisely the discipline the #260
  post-mortem asked for, from a contributor who had to learn it from the docs.
- **`tripIsPast` is correct**, including the `endDate ?? startDate` fallback and the
  "no dates means never past" case, and it's tested.
- **The Radix dropdown is the right call.** Replacing three buttons each carrying their
  own `stopPropagation` with a portalled menu removes a whole class of click-target bug.
- **The comments are unusually good** — they explain *why*, not *what*, and they match
  the house style well.
- **Real test coverage was added**, not just adjusted: `PersonAvatar.test.tsx`,
  `questions-page.wizard-hint.test.tsx`, `ApplicationCapabilityRdfa.test.tsx`, new
  `solidPod.test.ts` cases, expanded `packing-lists.test.tsx` and
  `view-packing-list.test.tsx`.
- **The e2e updates are honest adaptations**, not weakened assertions. Switching from
  `'Logout'` to `'Account menu'` and from `'+ Add item'` to `{ name: 'Add item', exact: true }`
  tracks the real UI changes.

---

## 7. Suggested reply to the contributor

Something along these lines:

> Thanks for this — there's a lot of good work here, and I appreciate that you picked up
> the persistence conventions in CLAUDE.md without being told.
>
> The problem is size: at 77 files and 3.4k lines this is about six PRs, and the
> description only covers the first two. I can't review the `updateFromQuestions`
> rewrite properly while it's sitting underneath a dark mode change, and I'd want a
> separate conversation about the Application Capability document before it goes near
> the production homepage.
>
> Could you split it? I'd happily take, in order: (1) past-trip folding + the card
> rework, (2) profile photos, (3) dark mode. The navigation restructure and the provider
> picker changes I'd like to talk through first — removing "Create List" from the nav
> and dropping the "What is a Solid Pod?" explainer are product calls I want to think
> about. The capability document should be its own PR.
>
> I've left specific bugs in a review — the dark mode toggle being overridden by the OS
> and the profile photo map being keyed by name are the two I'd fix first.

---

## Appendix — files by risk

| Risk | Files |
|---|---|
| **High** | `middleware.ts`, `src/create-packing-list/updateFromQuestions.ts`, `src/components/ThemeContext.tsx`, `src/components/SolidProviderSelector.tsx` |
| **Medium** | `src/hooks/usePersonProfilePhotos.ts`, `src/components/Navigation.tsx`, `src/pages/view-packing-list.tsx`, `src/pages/packing-lists.tsx`, `src/services/solidPod.ts` |
| **Low** | `src/capability/document.ts`, `ApplicationCapabilityRdfa.tsx`, `PersonAvatar.tsx`, `tripDetails.ts`, the ~40 `dark:`-class-only files, e2e adjustments |
