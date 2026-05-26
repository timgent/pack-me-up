# Plan: WebView Mobile App (Capacitor)

## Summary

Wrap the existing Vite/React build in Capacitor to produce native iOS and Android apps. The biggest unknown is whether the Solid OIDC redirect loop works correctly inside a WebView — validate this early.

---

## Chunk 1 — Capacitor shell (half day)

- `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
- `npx cap init` — set app ID (e.g. `com.packmeup.app`) and web dir to `dist`
- `npx cap add ios` and/or `npx cap add android`
- Add `npx cap copy` to the build pipeline
- Verify the built app loads in the simulator/emulator (no auth yet)

**Done when:** the home screen renders in an iOS simulator or Android emulator.

---

## Chunk 2 — OIDC auth validation (half–full day)

The app derives `redirect_uri` from `window.location.origin`, which will be:
- Android WebView: `http://localhost`
- iOS Capacitor: `capacitor://localhost`

Steps:
- Log the origin at startup to confirm what Capacitor reports on each platform
- Test the full login flow against a real Solid provider (e.g. solidcommunity.net)
- If the IdP rejects the `capacitor://` scheme (iOS), configure Capacitor's `server.hostname` to use `localhost` and set `allowNavigation` as needed, or register a custom `https://` redirect URI
- Verify `sessionStorage` and IndexedDB (`SessionIDB`) persist correctly between app foregrounding

**Done when:** a user can log in with a Solid account, the redirect lands back in the app, and the session survives backgrounding/restoring.

---

## Chunk 3 — Mobile UX polish (half day)

- Add safe-area inset padding for iOS notch/home-bar (`safe-area-inset-*` CSS env vars or Capacitor's `@capacitor/status-bar`)
- Audit tap targets — minimum 44px touch targets throughout
- Disable pull-to-refresh interfering with scroll (`overscroll-behavior: none` where needed)
- Test on a physical device if possible

**Done when:** the app looks and feels native, with no clipped UI or accidental gesture conflicts.

---

## Chunk 4 — Build pipeline & release (half day)

- Add `cap:build` npm scripts for iOS and Android
- Configure app icon and splash screen (`@capacitor/assets`)
- Android: generate a signed APK/AAB for sideloading or Play Store
- iOS: configure signing in Xcode for TestFlight or direct install
- Document the release process in README

**Done when:** a distributable binary exists that a real user can install.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `capacitor://` scheme rejected by OIDC provider | Medium | Force Capacitor to use `http://localhost` origin |
| `@uvdsl/solid-oidc-client-browser` makes `https`-only assumptions | Low | Check source; patch or fork if needed |
| IndexedDB wiped on iOS when app storage is cleared | Low | Warn users; no structural change needed |
