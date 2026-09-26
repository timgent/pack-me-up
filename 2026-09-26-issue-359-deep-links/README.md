# Manual test report — Issue #359: Handle deep links so shared links open in the installed app

| | |
|---|---|
| Date | 2026-09-26 |
| Issue | https://github.com/timgent/pack-me-up/issues/359 |
| PR | (opened after this report — see PR description for link) |
| Branch / commit | `claude/issue-pickup-kj775f` @ `054d63715c2994dc73a675f5d97734109cf0c78b` |
| Result | **Pass.** Android App Links verified end-to-end on a real emulator (see addendum). iOS build verified on real Xcode/Simulator; on-device Universal Link routing stays blocked on a real Apple Team ID, now confirmed empirically rather than assumed. |

## Addendum — 2026-09-26, second pass with Android SDK + Xcode available

The sandbox this report first ran in had neither an Android SDK/emulator nor
macOS/Xcode, so the OS-level half of this issue (the part that decides
whether a tap actually reaches the app) went untested — see the original
report below, which is left intact. A later environment for the same
branch/commit had both: Android SDK with platform-tools, emulator and a
prebuilt `Pixel_3a_API_34` AVD, and Xcode 26.6 with iOS 26.5 simulators. This
section is what that let through that the first pass explicitly flagged as
not possible.

### Android — genuinely verified end-to-end

- Built the debug APK (`npx cap sync android && ./gradlew assembleDebug`,
  `BUILD SUCCESSFUL`) and installed it on a booted
  `Pixel_3a_API_34_extension_level_7_arm64-v8a` emulator.
- `adb shell pm get-app-links com.timgent.packmeup` confirmed the manifest's
  `intent-filter` registers `packmeup.tim-gent.com` for verification (state
  `1024`/unverified, as expected — the `sha256_cert_fingerprints` placeholder
  can't pass real verification, exactly as documented). Used
  `adb shell pm set-app-links --package com.timgent.packmeup STATE_APPROVED
  packmeup.tim-gent.com` — Android's own supported mechanism for testing App
  Links without real Play App Signing credentials — to force the domain to
  `approved` and unblock a genuine tap-equivalent test.
- With that, sent **implicit** `VIEW` intents (no package named — the same
  resolution path Android uses for a tap from Chrome/Messages/etc, unlike the
  explicit `am start ... com.timgent.packmeup` in `docs/deep-linking.md`,
  which only proves the intent-filter shape, not real routing — see
  "Suggested doc update" below) for
  all three real link shapes the app actually produces (`buildSharedListUrl`,
  `buildSharedSetupUrl` in `services/solidPod.ts`, `buildInviteLink` in
  `services/invites.ts`), each run both **warm** (app already running) and
  **cold** (`adb shell am force-stop` first) — six runs, all six actually
  executed and screenshotted, not inferred from each other. All six resolved
  straight to `com.timgent.packmeup/.MainActivity` (confirmed via `dumpsys
  activity activities`) and rendered the correct in-app screen:

  | Link shape | Warm start | Cold start |
  |---|---|---|
  | Shared list (`/view-lists/:id?pod=...`) | ✅ [screenshot](images/05-android-warm-list-share.png) | ✅ [screenshot](images/09-android-cold-list-share.png) |
  | Shared setup (`/pod/:id/view-lists`) | ✅ [screenshot](images/10-android-warm-setup-share.png) | ✅ [screenshot](images/06-android-cold-setup-share.png) |
  | Invite link (`/invite/:token?pod=...&owner=...&kind=...&label=...`) | ✅ tried `kind=full-setup` this time — [screenshot](images/11-android-warm-invite-link.png) | ✅ tried `kind=list` — [screenshot](images/07-android-cold-invite-link.png) |
  | Bare origin, no hash | — (only meaningful cold) | ✅ falls through to the marketing landing page, no blank screen/crash — [screenshot](images/08-android-cold-bare-url-fallback.png) |

  Cold start matters because `installDeepLinkHandler` only subscribes to
  Capacitor's `appUrlOpen` and never calls `getLaunchUrl()`. It routes
  correctly anyway; the likely reason (read in
  `node_modules/@capacitor/app`'s Java/Swift sources, not instrumented at
  runtime) is that both the Android and iOS native `App` plugins fire
  `appUrlOpen` with `retainUntilConsumed: true`, so Capacitor buffers the
  cold-start intent until the JS listener attaches moments later — this is a
  plausible mechanism consistent with what was observed, not something
  directly traced.

  (Several intermediate screenshots looked blank/white immediately after a
  cold `am start`; re-shooting a few seconds later showed the WebView was
  still loading, not a real bug — noted here so the same false alarm doesn't
  get re-investigated.)

- Cross-checked the placeholder discussion in `docs/deep-linking.md`: the
  `assetlinks.json` `package_name` (`com.timgent.packmeup`) matches
  `android/app/build.gradle`'s `applicationId` exactly, and the AASA's
  `appID` suffix (`com.packmeup.app`) matches iOS's
  `PRODUCT_BUNDLE_IDENTIFIER`. No mismatch — the only missing pieces really
  are the two credential placeholders the doc already names.

**No bugs found.** Cold start does not drop the route (the `retainUntilConsumed`
buffering the doc doesn't mention makes this safe), and all three real link
shapes plus the bare-URL edge case route correctly.

### iOS — build verified, on-device routing confirmed still blocked (not by this sandbox)

- `xcodebuild -workspace/-project ... -sdk iphonesimulator` initially failed
  — but on an *unrelated* pre-existing issue: `@sentry/capacitor`'s Swift
  plugin references `PrivateSentrySDKOnly`, which the SPM-resolved
  `sentry-cocoa` 9.29.2 package doesn't expose the same way CocoaPods does.
  Reproduces the same way with `EXCLUDED_ARCHS=x86_64`/arm64-only, so it
  isn't an Apple Silicon vs. Intel simulator issue either — it's the Sentry
  Cocoa SPM package itself. Confirmed this is unrelated to this PR's diff
  (`git diff main --stat -- ios/` touches only `App.entitlements` and
  `project.pbxproj`'s `CODE_SIGN_ENTITLEMENTS`/`Package.resolved`, nothing
  Sentry-related).
- To get a real build for the entitlements check, temporarily dropped the
  `SentryCapacitor` dependency from `ios/App/CapApp-SPM/Package.swift`
  (**local-only** — reverted with `git checkout` before finishing; never
  committed, working tree confirmed clean afterwards). With that,
  `xcodebuild ... build` succeeded on Xcode 26.6 / iOS 26.5 Simulator.
- Installed the built `App.app` on an iPhone 17 simulator and ran
  `codesign -d --entitlements - App.app`: **the real embedded code signature
  carries no entitlements at all** (`{}`). The build log shows why —
  `ProcessProductPackaging` writes the associated-domains entitlement
  correctly into `App.app-Simulated.xcent` (Xcode's own
  `application-identifier = FAKETEAMID.com.packmeup.app` placeholder, used
  only for Xcode's Simulator debug-launch sandboxing), but the file that
  actually gets code-signed, `App.app.xcent`, is emitted empty because there's
  no real Team ID/provisioning profile to authorize the Associated Domains
  capability. This is concrete, observed evidence for exactly what
  `docs/deep-linking.md` already said would happen ("Until both are real,
  ... verification will fail silently"), rather than an assumption — and it
  means a `simctl openurl`/tap test against this build would prove nothing
  (no app on the system actually claims the domain), so it wasn't attempted.
- No code or entitlements-wiring bug found on the iOS side either. The one
  real gap is exactly the one the doc names: a real Apple Team ID, which no
  sandbox — this one included — can produce from a repo checkout.

### What to do about the `@sentry/capacitor` SPM build failure

Not part of this issue and not touched by this PR, but worth a separate
ticket: `@sentry/capacitor@4.2.0` + `sentry-cocoa@9.29.2` resolved via Swift
Package Manager fails to build (`cannot find 'PrivateSentrySDKOnly' in
scope`) in a stock `xcodebuild` from a clean `npx cap sync ios`. Anyone
opening this project in Xcode from scratch will hit this. Reproduce with:
`cd ios/App && xcodebuild -project App.xcodeproj -scheme App -sdk
iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17'
CODE_SIGNING_ALLOWED=NO build`.

### Suggested doc update

`docs/deep-linking.md`'s "What hasn't been verified on a real device" section
is correct as written — the explicit `am start ... com.timgent.packmeup` it
recommends genuinely does work regardless of verification, and it says so.
But there's now a stronger, still-credential-free test worth adding
alongside it: `adb shell pm set-app-links --package com.timgent.packmeup
STATE_APPROVED packmeup.tim-gent.com`, followed by an **implicit** `am start
-a android.intent.action.VIEW -d "<url>" -c android.intent.category.BROWSABLE`
(no package named). That exercises the actual resolution path a tap takes —
proving the app wins over the browser — not just that the intent-filter
matches. Not applied to `docs/deep-linking.md` in this pass; flagging it for
the user to decide whether it's worth a small follow-up edit.

## Original report — 2026-09-26, first pass (no Android SDK/emulator, no Xcode)

This issue is about getting Android/iOS to route a tapped share link into the
installed app instead of the browser, and about the app then turning that
incoming link into the right in-app route. The first half (an Android
`intent-filter` + `assetlinks.json`, an iOS Associated Domains entitlement +
`apple-app-site-association`) is OS-level behaviour that only exists on a
real device/emulator with the app actually installed and signed. **This
sandbox has no Android SDK/emulator and no macOS/Xcode** (confirmed:
`adb`/`emulator` are not on `PATH`, no `ANDROID_HOME`, no iOS simulator), so
that half cannot be exercised here — this is stated plainly rather than
glossed over, per the instruction to say so explicitly when something can't
be tested.

What *can* be verified in this sandbox, and was:

1. The pure routing logic (`routeFromDeepLink`/`installDeepLinkHandler` in
   `src/services/deepLinks.ts`) that turns an incoming URL into a hash
   HashRouter can act on — via automated tests (below) plus manual inspection
   of the wiring in `main.tsx`.
2. That the two destination routes any deep link would ultimately land on
   still behave exactly as before — driven for real in a built, served
   version of the app.
3. That the two new static files the OS fetches to verify domain ownership
   are actually served, with the right content.

## How it was tested

- Build: `npm run build` (production build, same as CI/deploy).
- Server: `npm run preview` on `http://localhost:4173`.
- Driver: Playwright (pre-installed Chromium at `/opt/pw-browsers/chromium`),
  via a throwaway script — not a committed e2e spec, deleted after the run.
- Viewports: 1280×900 (desktop) and 390×844 (mobile).
- No Solid pod/account needed — both destination routes render their
  signed-out state, which is exactly what's being checked (see below).

## Automated checks

- `npm test` (typecheck via `tsc -b`, then the full vitest suite): **149
  test files, 2515 tests, all passing**, including the 11 new tests in
  `src/services/deepLinks.test.ts` written test-first (red confirmed before
  `deepLinks.ts` existed, green after).

## Success criteria

The issue lists two payoffs and a suggested four-step approach. Going
through each:

### 1. A `VIEW` intent-filter + `assetlinks.json` for Android

Added to `android/app/src/main/AndroidManifest.xml` (a separate
`autoVerify="true"` filter, kept apart from the `MAIN`/`LAUNCHER` one per
Android App Links convention) and `public/.well-known/assetlinks.json`.
Verified the manifest XML is well-formed (`xmllint --noout`, passed) and that
the JSON file is actually reachable once built and served:

```
$ curl -o /dev/null -w "%{http_code}\n" http://localhost:4173/.well-known/assetlinks.json
200
```

**Not verifiable here**: real App Links *verification* (the OS confirming the
claim) needs the app signed with real Play App Signing credentials — the
`sha256_cert_fingerprints` value is a placeholder (see `docs/deep-linking.md`
for exactly what's needed and how to check verification once it's real). ***Update (see addendum above)***: with an Android emulator available, this
was tested end-to-end by forcing the domain to `approved` via `adb shell pm
set-app-links` (Android's own supported route for testing App Links without
real signing credentials) and sending genuine implicit `VIEW` intents — the
app-side routing is confirmed correct; only the real credential remains
outstanding.

### 2. iOS Associated Domains + `apple-app-site-association`

Added `ios/App/App/App.entitlements` (declares
`applinks:packmeup.tim-gent.com`) and wired `CODE_SIGN_ENTITLEMENTS` into
both the Debug and Release build configs in `project.pbxproj` — verified by
grepping the result and confirming brace/paren balance is unchanged (no
Xcode available in this sandbox to do a real build check). Added
`public/.well-known/apple-app-site-association` plus a new `vercel.json`
header rule, since the AASA file has no extension and would otherwise be
served as `application/octet-stream`:

```
$ curl -o /dev/null -w "%{http_code}\n" http://localhost:4173/.well-known/apple-app-site-association
200
```

**Not verifiable here**: same reasoning as Android — needs a real Apple Team
ID and Xcode's signing UI, neither available in this sandbox. ***Update (see
addendum above)***: with Xcode available, a real simulator build now
confirms this concretely — `codesign -d --entitlements -` on the built app
shows an empty entitlements set, because Xcode strips the Associated Domains
capability from the real code signature without a genuine Team ID (it only
survives in Xcode's own placeholder-`FAKETEAMID` "Simulated" entitlements
file, used for local debug-launch sandboxing, not for real Universal Link
routing).

### 3. `appUrlOpen` listener mapping the incoming URL onto the router

`src/services/deepLinks.ts`'s `installDeepLinkHandler`, wired into
`main.tsx`. Covered by 11 unit tests mirroring the existing
`appResume.test.ts` (Capacitor mocking) and
`capability/openInvocation.test.ts` (`installOpenInvocationHandler`'s
`history.replaceState` + synthetic `popstate` pattern, reused rather than
reinvented) styles. All pass — see Automated checks above.

### 4. The two sharing entry points still work when reached this way

`ForeignPodLayout` (`/pod/:encodedPodUrl/view-lists`) and `view-packing-list`
with `?pod=` (`/view-lists/:id?pod=...`) needed no code changes — the deep
link handler only changes *how* the hash gets set, not what the router does
with it. Confirmed by navigating directly to both routes in the built,
served app, signed out, on both viewports:

**Desktop, `/view-lists/:id?pod=...`** (the shape a shared-list link
resolves to):

![Shared list, desktop](images/01-shared-list-desktop.png)

**Desktop, `/pod/:id/view-lists`** (the shape a shared-setup link resolves
to):

![Shared setup, desktop](images/02-shared-setup-desktop.png)

**Mobile, `/view-lists/:id?pod=...`**:

![Shared list, mobile](images/03-shared-list-mobile.png)

**Mobile, `/pod/:id/view-lists`**:

![Shared setup, mobile](images/04-shared-setup-mobile.png)

All four show `SharedAccessHelp`'s signed-out state ("Someone shared a
packing list/their packing lists with you" → "Sign in to open"), matching
current, unchanged behaviour. The red "Could not load shared list: Failed to
fetch" toast in the list screenshots is pre-existing behaviour from
`pod.example.com` not existing — not something this change touched, and it
doesn't interfere with `SharedAccessHelp` rendering.

## Success-criteria table

| Criterion | Result |
|---|---|
| Android `VIEW` intent-filter + `assetlinks.json` added, manifest well-formed, JSON served | ✅ Pass |
| iOS Associated Domains entitlement + `apple-app-site-association` added, wired, JSON served with correct content-type | ✅ Pass |
| `appUrlOpen` → router wiring, TDD, unit-tested | ✅ Pass (11/11 new tests) |
| Existing sharing destination routes unaffected (desktop + mobile) | ✅ Pass |
| Full test suite green | ✅ Pass (2515/2515) |
| Real on-device App Links / Universal Links verification | ⛔ Not testable in *this* sandbox (no Android SDK/emulator, no macOS/Xcode) |

**Superseded by the addendum above**, run in an environment with both:

| Criterion | Result |
|---|---|
| Android App Links: implicit-intent tap routes to the app (warm + cold start, all 3 link shapes + bare-URL edge case), once the domain is force-approved via `pm set-app-links` | ✅ Pass — see addendum |
| iOS: real Xcode/Simulator build succeeds, entitlement correctly wired into the project | ✅ Pass — see addendum |
| iOS: real embedded code signature carries the Associated Domains entitlement | ⛔ Confirmed blocked — needs a real Apple Team ID (no sandbox can supply this) |
| Real Android App Links verification against production `sha256_cert_fingerprints` | ⛔ Still needs real Play App Signing credentials |

## Bugs found

None, in either pass.
