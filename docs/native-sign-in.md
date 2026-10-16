# Signing in from the native app (#358)

**Status: implemented and covered end to end against a real Community Solid
Server; the hand-off from the system browser back to the app still needs a pass
on real devices.** See the last section.

The native app used to sign in by navigating its own WebView to the provider's
login page. It now opens that page in the system browser's in-app tab — a Chrome
Custom Tab on Android, `SFSafariViewController` on iOS — and the provider sends the
user back to the app. The web app is unchanged.

## Why

- **RFC 8252 (OAuth 2.0 for Native Apps), §8.12** says embedded user agents are not
  an acceptable way to make authorization requests. Google has refused WebView
  sign-in since 2021; the day a Solid provider does the same, a WebView login stops
  working with no change on our side.
- **In a WebView the app can reach the password field**, and the user has no URL bar
  telling them whose page they are typing into.
- **Single sign-on.** A Custom Tab shares the browser's cookies, so a user already
  signed in to their provider in Chrome/Safari is usually asked only for consent.

A Custom Tab still renders inside the app's task, themed, with no app switch, so the
"never leave the app" feel is kept.

## The flow

```
tap a provider ──► SolidPodContext.login()
                     └─ nativeLogin.createSystemBrowserLogin().start()
                          └─ ResilientSession.beginExternalLogin()
                               • reads the provider's openid-configuration (RFC 9207 issuer check)
                               • PKCE + state, stored in localStorage (pmu-pending-external-login)
                               • Browser.open(authorize URL)            ── Custom Tab / SFSafariViewController
                                                                            user signs in, consents
provider redirects to com.timgent.packmeup:/auth-callback?code&state&iss
  └─ OS routes the scheme to the app ─► App 'appUrlOpen'   (or App.getLaunchUrl() on a cold start)
       └─ nativeLogin: Browser.close(); ResilientSession.completeExternalLogin(url)
            • state / iss / redirect checked before anything is written
            • code exchanged with redirect_uri = the custom scheme
            • tokens banked in IndexedDB, then verified
       └─ SolidPodContext: back to the route the user signed in from
```

`login()` resolves with how it ended — `signed-in`, or `cancelled` when the user
closed the tab (`browserFinished`) or declined at the provider — so the provider
picker closes, or goes back to its list. On the web it resolves `redirected`, as the
page is on its way to the provider.

## Decisions

### A custom scheme, in a Client ID Document of its own

The redirect is `com.timgent.packmeup:/auth-callback`: RFC 8252 §7.1's private-use
scheme, reverse-domain so nothing else can plausibly claim it. Android declares it
with an intent-filter, iOS with `CFBundleURLTypes`.

It cannot go in `public/client-id.json`. `oidc-provider` — which Community Solid
Server and Inrupt's ESS are built on — validates every redirect URI against the
document's `application_type` (`lib/helpers/client_schema.js`): a `web` client may
only list http(s) URIs, and **one bad entry invalidates the whole document**, so
adding it there would stop the website signing in. A `native` client may list the
custom scheme, but not `https://localhost/`. Hence `public/client-id-native.json`,
`application_type: "native"`. `solidClientIdentity.test.ts` checks both documents
against those rules.

`client-id.json` keeps `https://localhost/`: app versions released before this still
sign in inside the WebView and return there.

### Not an App Link

`https://packmeup.tim-gent.com/…` claimed as an App Link / Universal Link would need
no second document, but: verification still has placeholder signing values
(`docs/deep-linking.md`); an unverified link would load the hosted *web* app inside
the Custom Tab and strand the user there mid sign-in; and `SFSafariViewController`
does not hand a redirect to a Universal Link. The custom scheme works on both
platforms today. On iOS, Safari asks "Open in Pack Me Up?" the first time.

### Our own login and callback, not the library's

`@uvdsl/solid-oidc-client-browser`'s `login()` ends with `window.location.href = …`,
and its callback handler reads the code from `window.location.href` and sends *that
page's URL* as the token request's `redirect_uri`. In the WebView that is
`https://localhost/…`, never the scheme the provider redirected to, so the provider
would refuse the exchange. `ResilientSession` already owns refresh for similar
reasons; `beginExternalLogin`/`completeExternalLogin` sit beside it and store the
session under the same IndexedDB keys `performRefresh` reads.

Two rules from `CLAUDE.md` carry over:

- **A callback it cannot trust never costs the stored session.** Redirect URI,
  `state` and `iss` are checked before anything is written; a forged callback does
  not even cancel the sign-in in progress.
- **Bank before verifying.** The refresh token is stored the moment the exchange
  returns.

The pending sign-in lives in localStorage with a 15-minute limit, not the library's
sessionStorage, because Android may kill the app while the user is in the browser;
the callback then arrives as the URL that launched a new process.

## Deploy order

The native app asks providers to fetch
`https://packmeup.tim-gent.com/client-id-native.json`. That file ships with the
website, so **the web deploy must be live before an app build containing this
change is released**. Existing sessions are unaffected either way: a refresh uses
the client id stored with the session.

`VITE_NATIVE_CLIENT_ID_URL` points a build at a different document — the E2E build
(`.env.e2e`) uses one served by `e2e/global-setup.ts`, and a preview build tested on
a device needs its own copy, with its own `client_id`, reachable by the provider.

## Tests

- `ResilientSession.test.ts` → "external-agent login": authorize request, the
  exchange's `redirect_uri`, banking, every rejected callback, cold start, and a
  restore from what was banked.
- `nativeLogin.test.ts`: callbacks by event and by launch URL, closing the tab, the
  Android race between `browserFinished` and `appUrlOpen`.
- `SolidPodContext.nativeLogin.test.tsx`, `SolidProviderSelector.test.tsx`: the app
  never navigates the WebView, returns to the route it came from, and the picker
  closes or resets.
- E2E suite J, **J6** and **J7**: the native path against a real CSS.
  `e2e/helpers/native-shell.ts` stands in for Capacitor's native bridge (the
  plugins' own web fallbacks race at startup and lose listeners), a popup plays
  the Custom Tab, and the redirect CSS issues is delivered as `appUrlOpen`.

## Still needs a real device

The container this was built in has no Android SDK or Xcode, so these are unverified:

- **Android:** the Custom Tab opens, and after consent Chrome hands
  `com.timgent.packmeup:/auth-callback` to the app (singleTask brings `MainActivity`
  forward and clears the tab). Also: backing out of the tab returns to the picker;
  a cold start via the callback (enable "Don't keep activities" in developer
  options to force it) still signs in.
- **iOS:** `SFSafariViewController` opens; the "Open in Pack Me Up?" prompt appears
  and returns to the app; `Browser.close()` dismisses the sheet; swiping it away
  returns to the picker.
- **Providers other than CSS**, above all Inrupt's `login.inrupt.com`: that they
  accept a Client ID Document with `application_type: native` and a custom-scheme
  redirect. oidc-provider allows it; whether each deployment's configuration does
  is worth one real sign-in each.
