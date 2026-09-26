# Deep links (#359)

**Status: app-side routing done, OS-side verification still needs real
credentials.** A shared link (`https://packmeup.tim-gent.com/#/...`, built by
`buildSharedListUrl`/`buildSharedSetupUrl` in `services/solidPod.ts` and
`buildInviteLink` in `services/invites.ts`) opens in the recipient's browser
today even when the app is installed. Two things were missing: the OS never
routed the link to the app at all, and the app had nothing listening for one
if it arrived.

## What's wired up

- `services/deepLinks.ts` — `installDeepLinkHandler` listens for Capacitor's
  `appUrlOpen` event and turns the arriving URL's hash into the app's route,
  reusing the same `history.replaceState` + synthetic `popstate` technique
  `installOpenInvocationHandler` (`capability/openInvocation.ts`) already uses
  for the same problem (an external arrival HashRouter can't route directly).
  Called from `main.tsx`. Fully covered by `deepLinks.test.ts`.
- `AndroidManifest.xml` — a `VIEW` intent-filter with `android:autoVerify`
  for `https://packmeup.tim-gent.com`, separate from the existing
  `MAIN`/`LAUNCHER` filter.
- `public/.well-known/assetlinks.json` — the Digital Asset Links file Android
  fetches to verify the `autoVerify` claim.
- `App.entitlements` + `CODE_SIGN_ENTITLEMENTS` in `project.pbxproj` — the
  `com.apple.developer.associated-domains` entitlement for
  `applinks:packmeup.tim-gent.com`.
- `public/.well-known/apple-app-site-association` + `vercel.json` (new — the
  AASA file has no extension, so it needs an explicit `Content-Type:
  application/json` header) — the iOS Universal Links equivalent.

## What's still a placeholder

Two values can't be produced from a repo checkout and need filling in by
whoever holds the real signing credentials:

1. **`assetlinks.json`'s `sha256_cert_fingerprints`** — the SHA-256 of the
   **app signing certificate**, from Play Console → App integrity → App
   signing key certificate (once the app is enrolled in Play App Signing).
   Not the debug keystore, and not the upload key if those differ.
2. **`apple-app-site-association`'s `appID`** — replace `REPLACE_WITH_TEAM_ID`
   with the real Apple Developer Team ID. Associated Domains also needs
   enabling in Xcode's Signing & Capabilities UI once that's in place, so it
   lands in the provisioning profile — `CODE_SIGN_ENTITLEMENTS` alone doesn't
   do that.

Until both are real, `autoVerify`/Universal Links verification will fail
silently (the OS just keeps opening links in the browser) rather than making
noise about it — worth checking `adb shell pm get-app-links
com.timgent.packmeup` on Android, and Settings → \[App\] → check for
Associated Domains on iOS, once real values are in.

## What hasn't been verified on a real device

Most development environments can't exercise this at all — no Android
device/emulator, no Mac with Xcode. A later run had both, though, and got
further than an explicit `am start`: see the "Addendum" section of the
[manual test report](https://github.com/timgent/pack-me-up/blob/agent-testing/2026-09-26-issue-359-deep-links/README.md)
on the `agent-testing` branch for the concrete run and screenshots.

- Android — two recipes, proving different things:
  - `adb shell am start -a android.intent.action.VIEW -d
    "https://packmeup.tim-gent.com/#/view-lists/<id>?pod=<encoded>"
    com.timgent.packmeup` brings the app to the foreground on that route even
    without a tap (this works regardless of asset-link verification, since an
    explicit `am start` matches the intent-filter directly). It only proves
    the intent-filter and `deepLinks.ts` are shaped right, not that a real
    tap would prefer the app over the browser.
  - `adb shell pm set-app-links --package com.timgent.packmeup STATE_APPROVED
    packmeup.tim-gent.com` (Android's own supported way to test App Links
    without real Play App Signing credentials) followed by an **implicit**
    `am start -a android.intent.action.VIEW -d "<url>" -c
    android.intent.category.BROWSABLE` (no package named) exercises the
    actual resolution path a tap takes. This is the stronger test, and it's
    the one the addendum above ran — for all three real link shapes, warm
    and cold start.
- iOS: tap a share link from Messages/Notes with the app installed and
  confirm it opens the app rather than Safari. `xcrun simctl openurl` isn't a
  substitute — it still needs the entitlement to make it into the real code
  signature (a real Team ID, per the placeholders above), which a Simulator
  build without one won't have; `codesign -d --entitlements -` on the built
  `.app` will show an empty entitlements set until it does.
- Both: confirm the destination (`ForeignPodLayout`, `view-packing-list`)
  ends up in the same state a browser open of the same URL would.
