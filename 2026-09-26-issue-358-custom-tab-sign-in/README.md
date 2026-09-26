# Manual test report — issue #358: native sign-in through the system browser

| | |
|---|---|
| **Date** | 2026-09-26 |
| **Issue** | [timgent/pack-me-up#358](https://github.com/timgent/pack-me-up/issues/358) |
| **PR** | [timgent/pack-me-up#376](https://github.com/timgent/pack-me-up/pull/376) |
| **Branch / commit** | `claude/jolly-noether-7hwj6l` @ `cfaadb3` |
| **Result** | ✅ Pass in a simulated native shell. ⚠️ Still needs a pass on a real Android/iOS device (see the end) |

## How it was tested

- `npm run build:e2e` + `vite preview` (http://localhost:4173). This is the production bundle in mode `e2e`, which points the native path at a local copy of the native Client ID Document.
- A real Community Solid Server on port 4001, started by the e2e global setup. Global setup also serves `client-id-native.json`, re-addressed to `http://localhost:4002/…`, with the shipped redirect URI and `application_type: native`. So CSS itself validated the custom-scheme redirect, issued the code, and exchanged it.
- **This container has no Android SDK or Xcode**, so the native app was simulated in Chromium:
  - `e2e/helpers/native-shell.ts` stands in for Capacitor's native bridge (`isNativePlatform()` is true, and the App/Browser plugins go through `nativeCallback`/`nativePromise`).
  - `Browser.open` opens a popup, which plays the Custom Tab.
  - The `com.timgent.packmeup:/auth-callback?…` redirect that CSS answered with was delivered to the app as the `appUrlOpen` event the OS would send.
- Accounts: `jnative` for the native sign-ins, and `testuser` for the web check.
- Viewports: desktop 1280×900 and phone 390×844.
- Driven by a throwaway Playwright script, which was deleted and not committed.

## 1. The provider opens in the "browser", and the app never navigates

The user taps *Sync & Share* (desktop) or *Sign in* (phone), then picks the provider. The picker now says the provider **opens in your browser**, and a separate tab opens on CSS's password page.

| | Home | Picker | App while the tab is open |
|---|---|---|---|
| Desktop | ![](images/desktop-01-home.png) | ![](images/desktop-02-picker.png) | ![](images/desktop-03-app-while-tab-open.png) |
| Phone | ![](images/mobile-01-home.png) | ![](images/mobile-02-picker.png) | ![](images/mobile-03-app-while-tab-open.png) |

The tab, meaning the provider's own pages rather than the app's:

| | Password page | Consent page |
|---|---|---|
| Desktop | ![](images/desktop-04-tab-provider-login.png) | ![](images/desktop-05-tab-provider-consent.png) |
| Phone | ![](images/mobile-04-tab-provider-login.png) | ![](images/mobile-05-tab-provider-consent.png) |

The consent page identifies the client as **`client-id-native.json`**, so the provider fetched and accepted the native document.

Every navigation of the app's own page stayed on the app origin, recorded at both sizes:

```
http://localhost:4173/  →  /#/home  →  /#/solid-pod-handle-redirect  →  /#/wizard
```

The provider never loaded in the app's page.

## 2. Coming back signed in, and staying signed in

After *Authorize*, CSS redirected to `com.timgent.packmeup:/auth-callback?code=…&state=…&iss=http%3A%2F%2Flocalhost%3A4001%2F`. Delivered as `appUrlOpen`, it did the following:

- closed the tab
- exchanged the code
- signed the user in
- routed them through the redirect page to the wizard (`jnative`'s pod is empty)

A reload then restored the session from the refresh token saved at sign-in:

- auth log: `login.completed {"via":"system-browser"}`
- then, after the reload: `restore.attempt` → `refresh.succeeded` → `restore.succeeded`

| | Signed in | After reload |
|---|---|---|
| Desktop | ![](images/desktop-06-signed-in.png) | ![](images/desktop-07-after-reload.png) |
| Phone | ![](images/mobile-06-signed-in.png) | ![](images/mobile-07-after-reload.png) |

## 3. Back to the page the user signed in from

The user started signed out on *My Questions & Items* (`/#/manage-questions`) and signed in from there. They landed back on `/#/manage-questions`, the same promise the web redirect keeps.

| | Before | After |
|---|---|---|
| Desktop | ![](images/desktop-12-start-on-manage-questions.png) | ![](images/desktop-13-back-on-manage-questions.png) |
| Phone | ![](images/mobile-12-start-on-manage-questions.png) | ![](images/mobile-13-back-on-manage-questions.png) |

## 4. Closing the tab partway through

The tab was closed without signing in, and the OS's `browserFinished` was delivered. The picker went back to its list, with no error and the address still filled in. *Connect* opened a fresh tab straight away.

| | Connecting | After closing the tab | Retry |
|---|---|---|---|
| Desktop | ![](images/desktop-09-connecting-before-dismiss.png) | ![](images/desktop-10-after-dismiss-back-to-list.png) | ![](images/desktop-11-retry-opens-tab-again.png) |
| Phone | ![](images/mobile-09-connecting-before-dismiss.png) | ![](images/mobile-10-after-dismiss-back-to-list.png) | ![](images/mobile-11-retry-opens-tab-again.png) |

## 5. A stray callback does not cost the session

While signed in, a forged `com.timgent.packmeup:/auth-callback?code=forged&state=forged…` was delivered. The auth log recorded `login.callback-failed {"reason":"no-pending-login"}`, and the user stayed signed in with a live session.

| Desktop | Phone |
|---|---|
| ![](images/desktop-08-after-forged-callback.png) | ![](images/mobile-08-after-forged-callback.png) |

## 6. Web sign-in is unchanged

In a normal browser context, *Connect* navigated the same tab to CSS as before. No popup opened, and the user came back signed in.

| Provider in the same tab | Signed in |
|---|---|
| ![](images/desktop-14-web-same-tab-provider.png) | ![](images/desktop-15-web-signed-in.png) |

## Success criteria

| Criterion (from the issue) | Result |
|---|---|
| Native app opens the authorization URL outside the WebView (`@capacitor/browser`) | ✅ (simulated shell) |
| Callback caught by deep link, and the tab closed | ✅ (simulated shell; the popup was closed by `Browser.close()`) |
| Callback params handed back into the app's sign-in | ✅ Real CSS exchange with `redirect_uri` = the custom scheme |
| Browser (web) path unchanged | ✅ |
| Only the provider may end a session (#342 rules) | ✅ A forged callback left the session live; J1–J5 green |
| Suite J extended to cover the Custom Tab path, and still green | ✅ J6 + J7 added; J 7/7 |
| Desktop and phone viewports | ✅ |
| Unhappy paths: dismiss, retry, reload, stray callback | ✅ |

## Automated checks

- `npm test` (typecheck + vitest): **155 files, 2,651 tests passed**.
- `npm run lint`: 0 errors. The 11 warnings are in untouched files.
- Full E2E (`npx playwright test`): **106/106 passed**.
- Suite J under simulated CI (a plain `npm run build`, then `CI=1 playwright test`, where `webServer` rebuilds in mode e2e): **7/7 passed**.

## Bugs found

None in the app.

Two things came up in the test harness and were fixed before commit:

- Capacitor's web plugin fallbacks are created lazily, and first calls that race at startup each get their own instance, so the app's `appUrlOpen` listener never received the event. The fake native bridge replaces those fallbacks; the real bridge doesn't have this problem.
- `waitForLiveSession` looks for the desktop "account menu" label, so it can't be used at phone width.

## Not verified here: needs a real device

- **Android:** the Chrome Custom Tab hands `com.timgent.packmeup:/auth-callback` back to the app after consent, and singleTask clears the tab. Also: backing out of the tab, and a cold start via the callback ("Don't keep activities").
- **iOS:** `SFSafariViewController` opens, the "Open in Pack Me Up?" prompt returns to the app, and `Browser.close()` dismisses the sheet.
- **Providers other than CSS**, above all `login.inrupt.com`: they accept a Client ID Document with `application_type: native` and a custom-scheme redirect.
- **Deploy order:** `client-id-native.json` must be live on packmeup.tim-gent.com before an app build with this change is released.
