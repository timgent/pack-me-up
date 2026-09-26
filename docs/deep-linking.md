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

Nothing here can be exercised without an Android device/emulator or a Mac
with Xcode, neither of which this development environment has. Once the
placeholders above are real:

- Android: `adb shell am start -a android.intent.action.VIEW -d
  "https://packmeup.tim-gent.com/#/view-lists/<id>?pod=<encoded>"
  com.timgent.packmeup` should bring the app to the foreground on that route
  even without a tap (this works regardless of asset-link verification, since
  an explicit `am start` matches the intent-filter directly — verification
  only governs whether tapping a real link from another app, e.g. Chrome or
  Messages, prefers the app over the browser).
- iOS: tap a share link from Messages/Notes with the app installed and
  confirm it opens the app rather than Safari.
- Both: confirm the destination (`ForeignPodLayout`, `view-packing-list`)
  ends up in the same state a browser open of the same URL would.
