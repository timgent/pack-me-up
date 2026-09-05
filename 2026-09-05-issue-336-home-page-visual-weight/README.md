# Manual test report — issue #336

| | |
|---|---|
| **Date** | 2026-09-05 |
| **Issue** | [#336 — Reduce the visual weight of the home page: three competing colour stories above the fold](https://github.com/timgent/pack-me-up/issues/336) |
| **PR** | [#347 — Quieten the home page so the CTA is the loudest thing on it](https://github.com/timgent/pack-me-up/pull/347) |
| **Branch** | `claude/issue-pickup-32kgk4` |
| **Commit under test** | `5efb841` |
| **Result** | ✅ Pass — every acceptance criterion met, no bugs found |

---

## How it was tested

- `npm run build` (Vite production build) served by `vite preview` on
  `http://localhost:4173` — the built app, not the dev server.
- Driven with Playwright and the pre-installed Chromium, via a throwaway spec
  deleted afterwards (never committed to `e2e/tests/`).
- **Viewports:** desktop 1280×900 and mobile 390×844.
- **Themes:** light *and* dark on every screen. The whole issue is about colour,
  and the old cards had hand-written `dark:` variants per colour family — a
  light-only pass would have proved nothing.
- **Accounts:** signed out for the main pass; one signed-in pass against a local
  Community Solid Server (`testuser`), because the signed-in greeting banner is
  the one other coloured thing above the fold and it had to be checked against
  the CTA.
- Screenshots are of the real page after its `animate-slide-up` entrance
  settles, so the copy is at full opacity rather than mid-animation.
- Computed styles were read out of the browser alongside the screenshots, so the
  claims below about gradients, borders and hover are measured, not eyeballed.

---

## Acceptance criterion 1 — The primary CTA is the most visually prominent element above the fold

**Desktop, light.** The button is the only saturated thing on screen. Everything
else — headline, sub-headline, three step cards, the trust strip — is neutral
grey on the page's own pale gradient.

![Home page above the fold, desktop light](images/01-desktop-light-above-fold.png)

**Desktop, dark.** This is the case that needed the extra change described under
"Beyond the letter of the issue" below.

![Home page above the fold, desktop dark](images/03-desktop-dark-above-fold.png)

Measured: the CTA's `background-image` is
`linear-gradient(135deg, rgb(15,118,110), rgb(17,94,89))`. Every step card's is
`none`. It is the only gradient element above the fold, in both themes.

**Mobile, light and dark.** At 390×844 the CTA and the first step card are both
above the fold; the button still wins.

![Home page, mobile light](images/05-mobile-light-above-fold.png)
![Home page, mobile dark](images/07-mobile-dark-above-fold.png)

---

## Acceptance criterion 2 — The three step cards share one surface treatment

The three cards previously carried a colour family each (primary / secondary /
success), with their own gradient, `border-2` and hover glow. They now render
from one `STEPS` array through one `CARD_CLASSES` constant, so they are
identical by construction.

Measured in the browser, all three cards, desktop light:

| | Card 1 | Card 2 | Card 3 |
|---|---|---|---|
| `background-image` | `none` | `none` | `none` |
| `background-color` | `oklab(…/0.7)` white | *same* | *same* |
| `border-color` | `oklch(0.928 0.006 264.531)` | *same* | *same* |
| `box-shadow` | `shadow-soft` | *same* | *same* |

And dark: `background-color` `oklab(0.278 -0.0075 -0.0321 / 0.6)`,
`border-color` `oklch(0.373 0.034 259.733)` — again identical across all three.

The step number is the only accent the section keeps: a small circular badge in
a single primary tint, the same one on all three cards.

![Full home page, desktop light](images/02-desktop-light-full.png)
![Full home page, desktop dark](images/04-desktop-dark-full.png)

Stacked on mobile, the shared surface is what makes them read as one sequence
rather than three unrelated features:

![Steps, mobile light](images/06-mobile-light-steps.png)
![Steps, mobile dark](images/08-mobile-dark-steps.png)

---

## Acceptance criterion 3 — No hover-scale on non-interactive elements

Hovering the first card and holding for 600 ms (longer than the old
`duration-300` transition):

| | `transform` | `box-shadow` |
|---|---|---|
| Before hover | `none` | `shadow-soft` |
| After hover | `none` | `shadow-soft` |

Nothing changes. The screenshot below is the page with the cursor resting on
card 1 — visually indistinguishable from the un-hovered shot above, which is
the point.

![Card 1 under the cursor](images/09-desktop-light-card-hovered.png)

Worth recording: the old cards used a bare `hover:scale-105`, not the
`motion-safe:hover:scale-105` that `Button.tsx` and the CTA use — so they
animated even for a user who has asked their OS for reduced motion. Removing
them fixes that as a side effect.

---

## Acceptance criterion 4 — Light and dark both checked

Every screenshot above exists in both themes, driven by `prefers-color-scheme`
on a fresh browser context (no stored preference), which is the path a first-time
visitor takes. The shared card surface defines both `bg-white/70` and
`dark:bg-gray-800/60`, and both were read back from the browser (table under
criterion 2) rather than assumed.

---

## Beyond the letter of the issue — the hero headline

The first dark-mode screenshot of the reworked page showed the headline in
`dark:text-primary-200` (`#99f6e4`) as the *brightest* thing above the fold —
brighter than the CTA it exists to lead into. The cards were fixed and the
headline had quietly inherited the problem.

The issue's direction is explicit — *"Reserve saturated colour for the primary
CTA only — it should be the single most colourful thing above the fold"* — so
the headline went neutral (`text-gray-900 dark:text-gray-100`) in the same pass.
Compare the dark shot under criterion 1 against the mid-work capture: the
headline is now white-on-near-black and the button is the only colour.

It is a one-class change and easy to revert on its own if the tint was
deliberate branding.

---

## Unhappy paths and adjacent states

**The "Checking your questions…" placeholder (#333).** The CTA slot holds a
same-size placeholder while the question check resolves. Unchanged by this work,
but it shares the space the change is about, so it was checked: the cards below
it sit exactly where they do in the settled state, no reflow.

![Checking-questions placeholder](images/10-desktop-light-checking-placeholder.png)

(It resolves in well under a frame on this machine — this capture needed 20×
CPU throttling and a raw CDP screenshot to catch it.)

**Signed in.** The greeting banner is the one other coloured element above the
fold. It is a light outlined strip, and the CTA still clearly wins against it —
on desktop and on mobile.

![Signed in, desktop](images/11-desktop-light-signed-in.png)
![Signed in, mobile](images/12-mobile-light-signed-in.png)

**Reload and back.** The page is static marketing content with no local state;
reloading returns to the same rendering, and browser-back from `/wizard` lands
on it unchanged.

---

## Success criteria

| Criterion | Result |
|---|---|
| The primary CTA is the most visually prominent element above the fold | ✅ Pass — the only gradient above the fold, in both themes |
| The three step cards share one surface treatment | ✅ Pass — identical computed background, border and shadow |
| No hover-scale on non-interactive elements | ✅ Pass — `transform` stays `none` on hover |
| Light and dark both checked, `dark:` variants reworked not left behind | ✅ Pass |
| `src/pages/landing-page.test.tsx` still passes / updated | ✅ Pass — 29 tests, 8 of them new |

---

## Automated checks

| Check | Result |
|---|---|
| `npm test` (typecheck + vitest) | ✅ 2245 tests, 123 files, all passing |
| `src/pages/landing-page.test.tsx` alone | ✅ 29 passing (8 new, written red-first) |
| `npm run lint` | ✅ 0 errors (11 pre-existing warnings, none in the touched files) |
| `npm run build` | ✅ clean |

The e2e suites were not run in full for this change: nothing under `e2e/tests/`
references the home page's "How it works" copy or its cards
(`grep` for "How it works" / "Set up in a minute" hits only `landing-page.tsx`
and its unit test), and no pod data is involved. The throwaway walkthrough spec
used the standard `authedPage` fixture and the shared `testuser` pod read-only —
it wrote nothing.

---

## Bugs found

**None** in the change itself.

One pre-existing observation, not filed and not fixed here: on desktop the three
cards are equal-height grid cells, so "2. Fine-tune your questions" wrapping to
two lines pushes its body copy a line lower than its neighbours'. It was true of
the old cards too, and it is cosmetic. Worth a look if the copy is ever revised.
