# Manual test report — PR #281

**Branch tested:** PR #281 head, commit `8d15ee3` ("Restate the Application Capability description as RDFa in the footer")
**Tested:** in a real Chromium browser via Playwright, against `npm run dev` (Vite, port 5173) and a local Community Solid Server (port 4000, dedicated pod `pr281user` plus a second linked WebID for profile-photo testing).
**Date of test run:** 2026-08-16 (this matters — "past trip" behaviour is relative to today's date).

---

## What this PR actually changes

**The PR description undersells it badly.** This is not a focused change; it is at least eight independent features plus an app-wide restyle, landing in one branch: **77 files, +3423 / −931 lines.** If you are reviewing it, budget accordingly.

Here is what is actually in it, in plain English:

### 1. App-wide dark mode (undocumented, and by far the largest slice)
A new `ThemeContext` resolves a theme from `localStorage` first and the OS `prefers-color-scheme` second, keeps following the OS until the user picks a theme explicitly, and then stops. A small inline script in `index.html` applies the `dark` class before first paint so there is no flash of the wrong theme. `index.css` switches Tailwind v4's `dark:` variant from the media query to a class selector. Then **roughly 40 components and pages get `dark:` classes added**, which is where most of the +3400 lines live. There is a moon/sun toggle in both the desktop and mobile nav.

### 2. Person profile photos on avatars (undocumented)
A person on the questions page can now carry a **Solid WebID**. A new hook (`usePersonProfilePhotos.ts`) follows those WebIDs to their profile cards and reads `vcard:hasPhoto` / `foaf:img` / `foaf:depiction`. `PersonAvatar` renders the photo instead of the coloured initial, falling back to the initial if there is no photo or the image fails to load. `solidPod.ts` grew a `getPodOwnerProfile()` that returns name + photo + birthday together.

### 3. Past trips fold away (undocumented)
`tripIsPast()` in `tripDetails.ts` decides whether a trip's last date is before today. The packing-lists page splits lists into current and past, and hides the past ones behind a collapsed "Past trips (n)" accordion. A list with no dates is never "past".

### 4. Packing-list card rework (undocumented)
Each card is now click-to-open (clicking anywhere navigates), and the per-card actions moved into a Radix dropdown menu (kebab button) offering **Duplicate** and **Delete**. Delete goes through a confirmation dialog. The kebab stops click propagation so opening the menu does not also open the list.

### 5. Navigation rewritten (undocumented) — 220 lines changed
The nav now fetches the signed-in user's profile and shows **their photo and name** instead of a raw WebID string; the WebID moves into an account dropdown ("Signed in as …"). Mobile menu reorganised, with the profile block and a theme toggle.

### 6. Solid provider picker turned into a search box (undocumented)
The three-provider list became a live-filtering search field that also accepts a pasted Pod URL. A URL without a scheme is defaulted to `https://`. The "What is a Solid Pod?" explanatory block was **removed**. `Modal.tsx` changed `sm:w-full` → `w-full` (the width-jitter fix — the dialog no longer resizes as search results change). A spinner and "Connecting to …" message now hold the modal open during the login redirect instead of it vanishing.

### 7. Update-from-questions reworked (undocumented) — ~360 lines across logic + modal
`updateFromQuestions.ts` now computes a richer diff between a list and what its questions would generate today: `add`, `remove`, `update` (renamed / moved section / changed quantity, keeping id and packed state) and `sharing` (item crossed the communal boundary). The modal groups these into "New items" / "Changed items" / "No longer in your questions", with a checkbox per change and a button label that counts the selection.

### 8. Questions-page wizard hint (undocumented)
A dismissible one-line hint on the questions page: "Want to start from scratch? Redo the setup wizard…". Dismissal is remembered in `localStorage` (`wizardHintDismissed`).

### 9. Mobile Reorder row (undocumented)
The section-name chips next to the "Reorder" button are now hidden below the `sm` breakpoint (they are still read out to screen readers), and the button is pushed to the right of the row.

### 10. Application Capability description (**the only thing the PR description covers**)
A new `src/capability/document.ts` (415 lines) holds a hand-maintained Application Capability description in **two representations, JSON-LD and Turtle**, that must be kept in sync by hand. A Vercel edge `middleware.ts` serves it at `/` under content negotiation. `ApplicationCapabilityRdfa.tsx` restates the same description as invisible RDFa attributes in the footer.

**Undocumented, in short:** items 1–9. Only item 10 is described.

---

## Feature-by-feature results

### 1. Dark mode — **Works with caveats** (several real contrast failures, see Bugs 1–3)

**What I did:** launched Chromium with `prefers-color-scheme: dark` and no stored preference; toggled manually in both directions; reloaded to check persistence; sampled `document.documentElement.className` at document-commit time (before React mounts) to check for a flash; then walked every major page in both themes.

**What I saw:**
- With OS = dark and no stored preference, the page loads dark. ✅
- Toggling to light stores `theme-preference=light` and wins over the OS setting. ✅
- The `dark` class is already on `<html>` **at document commit, before React has painted** — measured, not eyeballed. No flash of the wrong theme. ✅
- Landing page, wizard, questions page, view-packing-list and the nav are all properly themed. ✅
- **The packing-lists page, the view-list progress strip, and the privacy-policy / your-data pages are not.** See Bugs 1–3.

| | Light | Dark |
|---|---|---|
| Landing | ![](manual-test-screenshots/01-landing-light.png) | ![](manual-test-screenshots/02-landing-dark-system-pref.png) |
| Questions | ![](manual-test-screenshots/23-questions-page-light.png) | ![](manual-test-screenshots/25-questions-page-dark.png) |
| Packing lists | ![](manual-test-screenshots/33-lists-past-expanded-light.png) | ![](manual-test-screenshots/35-lists-dark-expanded.png) |
| View list | ![](manual-test-screenshots/41-view-list-light.png) | ![](manual-test-screenshots/48-view-list-dark-expanded.png) |
| Wizard | ![](manual-test-screenshots/18-wizard-step1-light.png) | ![](manual-test-screenshots/19-wizard-dark.png) |

Manual override beating the OS setting: ![](manual-test-screenshots/03-landing-manual-light-over-dark-os.png)

**Verdict: Works with caveats.** The mechanism is sound; the coverage is incomplete.

---

### 2. Person profile photos on avatars — **Works with caveats** (the colour ring is missing — Bug 4)

**What I did:** published a public WebID document on the local pod (`/alice-profile.ttl#me`) carrying `vcard:fn` and `vcard:hasPhoto` pointing at a real PNG, and a second one (`/bob-profile.ttl#me`) whose `vcard:hasPhoto` points at a URL that 404s. Set Alice's WebID in the questions page people editor, then Bob's.

**What I saw:**
- Before a WebID: both avatars are coloured initials — `SPAN:A`, `SPAN:B`. ![](manual-test-screenshots/26-avatars-initial-fallback.png)
- The people editor exposes a per-person WebID field. ![](manual-test-screenshots/27-people-editor-webid-field.png)
- After setting Alice's WebID the avatar becomes `IMG:http://localhost:4000/alice-photo.png`. ✅ The photo also propagates to the packing-list page ("Alice's Items"), so it is genuinely reading the pod, not caching a page-local value.
- Bob's broken photo URL falls back correctly to `SPAN:B` with his violet colour. ✅
- **But the photo avatar has no colour ring.** ![](manual-test-screenshots/29-avatars-zoom.png) — Bob keeps his violet identity, Alice is now just a magenta photo with no link to her assigned colour.

**Verdict: Works with caveats** — Bug 4.

---

### 3. Past trips folding — **Works**

**What I did:** created five lists — three future (Sep 2026, Dec 2026), one past-this-year (Apr 2026), one past-last-year (Oct 2025), and one with no dates at all.

**What I saw:** the three future lists and the undated list render normally; the two past trips fold behind a collapsed "Past trips (2)" row with `aria-expanded="false"`, which flips to `true` and reveals them on click. A list with no dates correctly stays in the current section rather than being treated as past.

Collapsed: ![](manual-test-screenshots/32-lists-past-collapsed-light.png)
Expanded: ![](manual-test-screenshots/33-lists-past-expanded-light.png)

**Verdict: Works.**

---

### 4. Packing-list card rework — **Works**

**What I did:** clicked the kebab, then Duplicate, then Delete on the duplicate, then the card body.

**What I saw:**
- Clicking the kebab opens the menu and the URL stays on `#/view-lists` — it does **not** open the list. ✅ ![](manual-test-screenshots/37-card-dropdown-menu-open.png)
- Duplicate produces "Copy of Alps Ski Week" at the top of the list. ✅ ![](manual-test-screenshots/38-after-duplicate.png)
- Delete raises a confirmation naming the list ("Are you sure you want to delete "Copy of Alps Ski Week"? This cannot be undone.") ![](manual-test-screenshots/39-delete-confirmation.png) and removes it on confirm. ✅ ![](manual-test-screenshots/40-after-delete.png)
- Clicking the card body navigates to `#/view-lists/<id>`. ✅

**Verdict: Works.** (In dark mode the kebab button itself is close to invisible — that is Bug 1, not a behaviour problem.)

---

### 5. Navigation changes — **Works**

**What I did:** tested logged-out and logged-in at 1280×900 and 390×844. To test the logged-in case properly I linked an external WebID carrying a name and photo to a CSS account, so the app would sign in as a user who actually has a profile photo.

**What I saw:**
- Logged out, desktop and mobile: nav renders, hamburger opens, theme toggle reads "Light mode" / "Dark mode". ![](manual-test-screenshots/05-mobile-nav-open-dark.png) ![](manual-test-screenshots/06-mobile-nav-open-light-loggedout.png)
- Logged in, desktop: photo + "Alice Traveller", with the WebID demoted to the account dropdown. ![](manual-test-screenshots/56-desktop-account-menu.png)
- Logged in, mobile: the menu shows the photo and "Alice Traveller" — **no raw WebID anywhere**, which is the stated goal. ![](manual-test-screenshots/58-mobile-nav-open-loggedin-photo.png)
- When the profile has no photo or name (my `pr281user` pod), it degrades to a generic icon plus the pod username. ![](manual-test-screenshots/17-after-login.png)

**Verdict: Works.**

---

### 6. Solid provider picker — **Works**

**What I did:** exercised the search, a no-match query, a scheme-less custom URL, the modal width across query states, and a full login round trip against the local CSS.

**What I saw:**
- Empty query lists all three providers, last-used highlighted. ![](manual-test-screenshots/07-provider-picker-initial-light.png)
- `inr` → Inrupt only; `solidcommunity` → solidcommunity.net only. ![](manual-test-screenshots/08-provider-picker-search-inrupt.png)
- `zzzznope` → "No matching providers." plus a "Connect to custom provider" fallback. ![](manual-test-screenshots/10-provider-picker-no-match-custom.png)
- `localhost:4000` → the preview shows `https://localhost:4000`, confirming the `https://` default. An explicit `http://…` is preserved. ![](manual-test-screenshots/11-provider-custom-url-https-default.png)
- **Width jitter fix confirmed by measurement**, not by eye: the dialog stays exactly **512 px** wide at every query state (initial / 1 result / 1 result / 0 results), only its height changes.
- **The "What is a Solid Pod?" explanation is gone**, as expected. Worth a product decision: a first-time visitor now gets a provider search box with no explanation of what a Pod is. The landing page still carries an "Own Your Data" paragraph, so it is not lost entirely.
- Connecting spinner: verified by holding the OIDC discovery request open. ![](manual-test-screenshots/14-connecting-spinner.png) For a custom provider it shows the raw URL ("Connecting to http://localhost:4000…") rather than a friendly name — acceptable, since there is no name to show.
- **Full login round trip works**: custom URL → CSS login → consent → back to the app at `#/view-lists`, signed in. ![](manual-test-screenshots/15-css-login-page.png) ![](manual-test-screenshots/16-css-consent.png)

**Verdict: Works.** (Dark-mode nit: Bug 6.)

---

### 7. Update-from-questions flow — **Works** (for the `add` path)

**What I did:** added a new item ("Hand warmers") to the "Cold" weather option on the questions page, then opened an existing list whose answers include "Cold".

**What I saw:**
- The "Update from questions" button appears on the list, ringed to draw attention. The modal opens with a "New items" group listing the change once per affected person ("Hand warmers — Alice", "Hand warmers — Bob"), each with its own checkbox. ![](manual-test-screenshots/50-update-from-questions-modal.png)
- The action button label tracks the selection: "Add 2 items" → unchecking one → "Add 1 item". ![](manual-test-screenshots/53-update-modal-partial-selection.png)
- Applying both took the list from **114 → 116 items**, and the item appears in each person's section. ![](manual-test-screenshots/54-list-after-update-applied.png)
- After applying, the "Update from questions" button disappears — nothing left pending. ✅

**Verdict: Works** for what I could exercise. I only drove the `add` path; `remove`, `update` and `sharing` are untested by hand (see "Not tested").

---

### 8. Questions-page wizard hint — **Works**

**Trigger:** it is not conditional on anything interesting — it shows on the questions page for any non-foreign pod whenever `localStorage.wizardHintDismissed` is not `"true"`, i.e. always until dismissed.

![](manual-test-screenshots/24-questions-wizard-hint.png)

The × dismisses it and the dismissal survives reload. **Verdict: Works.**

---

### 9. Mobile Reorder button — **Works**

At 390 px the section-name chips (`Day Bag`, `Documents & Money`, …) and the "+4 more" counter are hidden, "List order" is `sr-only`, and the Reorder button is pushed to the right of the row by `ml-auto`.

![](manual-test-screenshots/46-mobile-questions-reorder-row.png)
Full mobile questions page: ![](manual-test-screenshots/47-questions-mobile.png)

Cosmetic observation, not a bug: because everything else in the row is now hidden, the Reorder button sits alone on a row of otherwise empty space.

**Verdict: Works.**

---

### 10. Application Capability description — **Partly not testable locally**

**The Vercel edge middleware does NOT run under `npm run dev`.** I want to be explicit about this rather than imply it works: `middleware.ts` is Vercel-platform code, and Vite serves the SPA directly. I confirmed the practical consequence — `curl -H 'Accept: application/ld+json' http://localhost:5173/` returns **HTTP 404 with an empty body**, not the capability document. Whether it behaves correctly on Vercel is **unverified**; it needs a preview deployment to confirm.

**What I could verify:**

**(a) The RDFa footer renders.** ✅ The DOM contains one `[typeof="ac:Application"]` subtree, 3030 characters of RDFa attributes, entirely invisible (every element is empty). Spot-checked triples look right:

```html
<span property="as:name" content="Pack Me Up"></span>
<div property="ac:capability" typeof="ac:Capability" resource="https://packmeup.tim-gent.com/#capability-view-packing-list">
  <span property="ac:action" resource="odrl:use"></span>
  <span property="ac:output" content="text/html"></span>
  <link property="ac:resourceType" resource="pmu:PackingList">
  …
```

**(b) The middleware's negotiation logic is correct.** I imported `middleware.ts` directly in a throwaway vitest file with fake `Request` objects (stubbing `@vercel/functions`' `next()` with a marker response). All eleven cases behaved as intended:

| `Accept` | Result |
|---|---|
| `application/ld+json` | JSON-LD, 6627 bytes, `content-type: application/ld+json; charset=utf-8`, `content-location`, `vary: accept` ✅ |
| `text/turtle` | Turtle, 5421 bytes, correct headers ✅ |
| `text/html` | passthrough to SPA ✅ |
| *(no Accept header)* | passthrough ✅ |
| `*/*` | passthrough ✅ |
| Real Chrome's `text/html,…,*/*;q=0.8` | passthrough ✅ |
| `application/ld+json;q=0.9,text/html;q=0.8` | JSON-LD ✅ |
| `text/html;q=0.9,application/ld+json;q=0.8` | passthrough ✅ |
| `text/turtle,application/ld+json;q=0.5` | Turtle (honours the client's weighting) ✅ |
| `application/ld+json,text/turtle` | JSON-LD (tie → preferred format) ✅ |
| `application/json` | passthrough ✅ |

That probe file was deleted afterwards — **nothing in the repo tests this**, see Bug 8.

**Verdict: RDFa footer — Works. Middleware — logic verified by direct import; end-to-end behaviour Not testable locally (Vercel-only).**

---

## Automated test suite

`npm test` (type check + vitest): **PASS**. 83 test files, **1493 tests, 1493 passed, 0 failed**, exit code 0. No failures to quote. One noisy but non-failing React `act(...)` warning from `Toast.test.tsx`, which pre-dates this PR.

---

## Bugs and issues found

### Bug 1 — Dark mode: packing-list cards are largely unreadable. **Severity: high**

The card badges use `bg-white/60` and `bg-white/40` with **no dark variant**, while the text sitting on them *did* get a `dark:` variant. The result in dark mode is light-grey text on a near-white pill.

![](manual-test-screenshots/36-dark-card-badges-unreadable.png)

- **The trip dates are completely invisible.** Computed style: `color: oklch(0.707 0.022 261.325)` (gray-400) on `background: rgba(255,255,255,0.6)`.
- The kebab "more actions" button is invisible for the same reason — the primary discovery point for Duplicate/Delete.
- The `n / n (%)` badge is washed out.
- The progress track (`bg-white/40`) renders as a solid light bar, so a 0%-packed list **looks fully packed**.

Same on mobile: ![](manual-test-screenshots/68-lists-mobile-dark.png)

**Reproduce:** switch to dark mode → go to `#/view-lists` with at least one list → the date badge and kebab are unreadable.
**Where:** `src/pages/packing-lists.tsx` lines ~202, 208, 211, 223, 230, 242, 272, 279. The same pattern is duplicated in `src/pages/foreign-packing-lists.tsx` lines ~89, 94, 101, 107, so shared lists will have it too.

---

### Bug 2 — Dark mode: the view-list sticky progress strip is a white card. **Severity: medium**

`src/pages/view-packing-list.tsx:1410` and `:1448` use `backdrop-blur-md bg-white/90` with no dark variant, while the count text inside is `dark:text-gray-400`. In dark mode the strip is a bright white band across an otherwise dark page, with low-contrast grey text on it.

![](manual-test-screenshots/42-view-list-dark.png)

**Reproduce:** dark mode → open any packing list → look at the sticky strip at the top.

---

### Bug 3 — Dark mode: privacy-policy and your-data pages have light cards with light text. **Severity: medium**

Both wrap their content in `bg-white/60` with no dark variant (`src/pages/privacy-policy.tsx:7`, `src/pages/your-data.tsx:86`). Body copy that got `dark:text-gray-300/400` is now light-on-light. On **Your data** the small explanatory text beneath each delete button is effectively **invisible** — and this is the page that explains what "Delete everything" will destroy.

![](manual-test-screenshots/61-your-data-dark.png)
![](manual-test-screenshots/60-privacy-policy-dark.png)

**Reproduce:** dark mode → `#/your-data` → read the small print under "Delete all data on this device".

---

### Bug 4 — A person with a profile photo loses their colour. **Severity: medium**

`PersonAvatar`'s own doc comment says the photo is *"still ringed in their colour"*, and the whole point of the coloured avatar is stated right above it: *"find your colour, that's your pile."* The `<img>` branch applies neither:

```jsx
className={`rounded-full object-cover select-none shrink-0 ${dimensions}`}
```

No ring, no border, and `color` is accepted as a prop but never used on this path — even though `PersonColor` already carries a `ring` class (`ring-blue-400`, `ring-violet-400`, …) for exactly this. So the moment someone adds a WebID with a photo, their colour-coding disappears from every list.

![](manual-test-screenshots/29-avatars-zoom.png) — Bob (initial) keeps violet; Alice (photo) has no colour at all.

`PersonAvatar.test.tsx` asserts the tag, `src` and `title` of the photo path but nothing about the ring, so no test catches it.

**Reproduce:** give a person a WebID whose profile has `vcard:hasPhoto` → their avatar renders as a bare circular photo.
**Where:** `src/components/PersonAvatar.tsx`.

---

### Bug 5 — 15 dark-mode "hover" styles are permanent instead of hover-only. **Severity: low**

Fifteen places write the dark variant of a hover style **without the `hover:` prefix**, so in dark mode the hover background/border is applied at rest:

- `hover:bg-primary-50 dark:bg-primary-950/40` × 8
- `hover:border-primary-300 dark:border-primary-700` × 4
- `hover:bg-danger-50 dark:bg-danger-950/40` × 3

Measured, with no pointer over the element:
- "Add Question" (dashed button) → `background: oklab(0.277 -0.044 -0.010 / 0.4)` (a permanent teal wash) ![](manual-test-screenshots/64-dark-add-question-button.png)
- The "🗑️ Delete" dropdown item → `background: oklab(0.258 0.080 0.039 / 0.4)` (a permanent red wash) ![](manual-test-screenshots/63-dark-dropdown-menu.png)

The `dark:border-primary-700` cases are worse in kind: they override the resting `border-gray-200 dark:border-gray-700` rather than only applying on hover.

**Where:** `src/components/SectionOrderEditor.tsx`, `src/pages/wizard.tsx`, `src/pages/backups.tsx`, `src/pages/packing-lists.tsx`, `src/pages/questions-page.tsx`.

---

### Bug 6 — Provider descriptions are low-contrast in the dark login modal. **Severity: low**

`text-green-700` on the provider rows has no dark variant, so on the dark modal ("Free · community-run, backed by the Open Data Institute") it is dark green on dark grey.

![](manual-test-screenshots/12-provider-picker-dark.png)

Also worth a look: the last-used provider row is styled `border-2 border-blue-400 bg-blue-50 hover:bg-blue-100` with no dark variants, so it will be a bright blue block in the dark modal.

**Where:** `src/components/SolidProviderSelector.tsx`.

---

### Bug 7 — `Input`'s label is not associated with its input. **Severity: low (pre-existing, but this PR touched the file)**

`src/components/Input.tsx` renders `<label>{label}</label>` with no `htmlFor` and no `id` on the input. "Packing List Name" therefore cannot be found by its accessible name — I had to select it by placeholder. Screen-reader users get an unlabelled field. Pre-existing, but the PR edits this component, so it is cheap to fix here.

---

### Bug 8 — 500 lines of new capability code ship with no tests. **Severity: low (process)**

`middleware.ts` (85 lines) and `src/capability/document.ts` (415 lines) have **no test file**. Only `ApplicationCapabilityRdfa.test.tsx` was added. My throwaway probe showed the negotiation logic is correct today, but nothing protects it in CI — and `document.ts` maintains **two hand-synced representations** (JSON-LD and Turtle) whose own comment says "If you change one, change the other", with nothing asserting they describe the same triples. That is exactly the kind of hand-maintained duplication the repo's own CLAUDE.md warns about elsewhere. The file's header also carries an honest caveat worth surfacing in review: several vocabulary terms are marked **"unverified:"** because the author could not reach the specs while writing it.

Related nit: `APP_ORIGIN` is hard-coded to `https://packmeup.tim-gent.com`, so the RDFa emitted on localhost (and any other deployment) advertises the production origin.

---

## Not tested, and why

- **The middleware in a real deployment.** Vercel edge middleware does not run under Vite. I verified the logic by direct import and confirmed the dev server 404s such requests, but a preview deployment is needed to confirm real behaviour, headers and caching.
- **`remove`, `update` and `sharing` change kinds in update-from-questions.** I exercised only `add` (adding a new item to an answered option). Renaming an item, moving it to another section, changing its per-night quantity, deleting an option, and flipping an item to communal all take different code paths in the ~200 changed lines of `updateFromQuestions.ts`. These are covered by unit tests, but not by me in a browser.
- **Drag-and-drop reordering itself.** I verified the mobile *layout* of the Reorder row; I did not drag anything. `SectionedItemReorder.tsx` and `SectionOrderEditor.tsx` both changed.
- **Sharing / collaboration / foreign pods.** `SharePackingListModal.tsx`, `sharing-settings.tsx`, `foreign-packing-lists.tsx` and `ForeignPodLayout.tsx` all changed (mostly for dark mode). Testing these needs two pods and a share round trip. Note that `foreign-packing-lists.tsx` carries the same `bg-white/60` dark-mode bug as Bug 1, so shared-list cards are very likely unreadable in dark mode too — inferred from the code, not observed.
- **Backups / restore.** `backups.tsx` changed; I only loaded the page (empty state) in dark mode.
- **Native (Capacitor iOS/Android) dark mode.** The `color-scheme: dark` and `html.dark body` rules may behave differently inside a WebView with a native status bar. Browser only here.
- **Real OS-level dark-mode switching while the app is open.** `ThemeContext` adds a `matchMedia` change listener that only applies while no preference is stored; I verified the initial resolution and the stored-preference override, but did not flip the OS setting mid-session.
- **Accessibility beyond spot checks.** No screen-reader or full contrast audit; the contrast problems reported above were obvious enough to catch by eye and confirm with computed styles.

---

## Appendix — remaining screenshots

Supporting evidence not inlined above, in `manual-test-screenshots/`:

| File | What it shows |
|---|---|
| `04-mobile-nav-closed-dark.png` | Mobile nav bar, closed, dark, logged out |
| `09-provider-picker-search-solidcommunity.png` | Provider search filtered to solidcommunity.net |
| `13-provider-custom-localhost.png` | Custom `http://localhost:4000` preserved (no `https://` rewrite) |
| `20-wizard-filled-light.png` | Wizard filled in with two people |
| `21-wizard-generating.png` | Wizard generation reveal animation mid-run |
| `22-after-wizard.png` | Wizard success modal — "6 questions and 239 items across 2 people" |
| `28-avatars-with-pod-photo.png` | Avatar cluster after Alice's WebID photo loads |
| `30-avatar-broken-photo-fallback.png` | Bob's 404 photo falling back to his violet initial |
| `31-create-list-light.png` | Create-packing-list form, light |
| `34-lists-dark-collapsed.png` | Packing lists, dark, past trips collapsed |
| `43-view-list-dark-full.png` | Full-page view-packing-list in dark |
| `44-view-list-mobile.png` | View-packing-list at 390 px |
| `49-questions-item-added.png` | "Hand warmers" added under the Cold option |
| `55-desktop-nav-profile-photo.png` | Desktop nav bar strip with profile photo + name |
| `57-mobile-nav-closed-loggedin.png` | Mobile nav closed while signed in |
| `59-mobile-nav-open-loggedin-dark.png` | Mobile nav open, signed in, dark |
| `62-backups-dark.png` | Backups page in dark (empty state) |
| `66-mobile-progress-strip.png` | Mobile progress strip rendering correctly (no overlap) |
| `67-lists-mobile-light.png` | Packing lists at 390 px, light — compare with the dark version in Bug 1 |
