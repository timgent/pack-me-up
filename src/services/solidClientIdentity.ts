/**
 * Which OIDC client this app presents itself as.
 *
 * Solid-OIDC offers two ways to be a client, and they age very differently:
 *
 * - A **Client ID Document** hosted at an https URL. The provider fetches it on
 *   every grant, so the registration is as permanent as the file. Nothing about
 *   it can lapse.
 * - A **dynamic registration**, created at login. The provider hands back a
 *   client id it owns and may reclaim — Inrupt's ESS expires them, and a
 *   Community Solid Server drops them whenever its registration storage is
 *   cleared. When that happens the next refresh comes back `invalid_client`.
 *   That is terminal by definition (the app is no longer a client the provider
 *   knows), so the user is signed out with a perfectly good refresh token still
 *   on disk, and no amount of retrying helps.
 *
 * The native shell is served from `https://localhost` by Capacitor, so it never
 * matched the hosted document's redirect URI and fell through to dynamic
 * registration on every install — which is why phones lost their session on a
 * schedule the web app never saw. It now has a hosted document of its own.
 *
 * Its own, rather than a line in the website's, because since #358 the native
 * app signs in through the system browser (a Custom Tab, SFSafariViewController)
 * and the provider hands the result back on a private-use scheme. `oidc-provider`
 * — behind CSS and Inrupt's ESS — refuses a custom scheme in a `web` client's
 * document, and one bad redirect URI invalidates the whole document: adding it to
 * `client-id.json` would stop the *website* signing in. A `native` document is the
 * only place it can go. See docs/native-sign-in.md.
 */

/**
 * The deployed Client ID Document.
 *
 * Hardcoded on purpose: the native app has no deployment origin to derive this
 * from — `window.location.origin` inside the shell is `https://localhost`, and a
 * provider cannot fetch a client document from a phone. `VITE_CLIENT_ID_URL`
 * still overrides it, which is how a preview build is tested natively.
 */
export const HOSTED_CLIENT_ID_URL = 'https://packmeup.tim-gent.com/client-id.json'

/**
 * The native app's Client ID Document (`public/client-id-native.json`).
 * Hardcoded for the same reason as `HOSTED_CLIENT_ID_URL`;
 * `VITE_NATIVE_CLIENT_ID_URL` overrides it, which is how E2E suite J and a
 * preview build tested natively point at a document of their own.
 */
export const HOSTED_NATIVE_CLIENT_ID_URL = 'https://packmeup.tim-gent.com/client-id-native.json'

/**
 * Where the provider sends the system browser once the user has signed in.
 * RFC 8252 §7.1's reverse-domain private-use scheme: Android's intent-filter and
 * iOS's `CFBundleURLTypes` route it to this app, and nothing else on the device
 * can claim it without also claiming our bundle id. `client-id-native.json` must
 * list it.
 */
export const NATIVE_AUTH_REDIRECT_URI = 'com.timgent.packmeup:/auth-callback'

/**
 * The redirect URI app versions released before #358 send: they sign in inside
 * the WebView, whose origin is Capacitor's `https://localhost` on both platforms
 * (see `capacitor.config.ts`). Nothing current sends it, but phones that have not
 * updated still do — `public/client-id.json` must keep listing it, or they cannot
 * log in at all.
 */
export const LEGACY_NATIVE_REDIRECT_URI = 'https://localhost/'

export type SolidClientDetails =
    | { client_id: string }
    | { redirect_uris: string[]; client_name: string }

export function solidClientDetails({
    clientIdUrl,
    nativeClientIdUrl,
    isNativePlatform,
    origin,
}: {
    /** `VITE_CLIENT_ID_URL`, when the build sets one. */
    clientIdUrl?: string
    /** `VITE_NATIVE_CLIENT_ID_URL`, when the build sets one. */
    nativeClientIdUrl?: string
    isNativePlatform: boolean
    origin: string
}): SolidClientDetails {
    // Checked first: the website's document cannot list the native redirect URI,
    // so a native build must never pick it up from VITE_CLIENT_ID_URL.
    if (isNativePlatform) return { client_id: nativeClientIdUrl || HOSTED_NATIVE_CLIENT_ID_URL }
    if (clientIdUrl) return { client_id: clientIdUrl }

    // A web origin with no hosted document — localhost or a preview deploy.
    // Dynamic registration is the only option, and its fragility matters less
    // here: these sessions are minutes old and re-logging in costs nothing.
    //
    // Use the SPA root so the redirect_uri in the token exchange matches what is
    // registered. Going through pod-auth-callback.html would have the library
    // strip the params from that URL and send the wrong redirect_uri.
    return { redirect_uris: [origin + '/'], client_name: 'Pack Me Up' }
}
