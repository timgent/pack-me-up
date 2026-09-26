import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { ExternalLoginError, type ResilientSession } from './ResilientSession'
import { NATIVE_AUTH_REDIRECT_URI } from './solidClientIdentity'
import { logAuthEvent } from './authLog'

/**
 * How a sign-in ended, as far as whoever started it needs to know.
 *
 * - `redirected` — the web app: the page is navigating to the provider, and the
 *   callback will arrive as a fresh page load.
 * - `signed-in` — the native app: the system browser came back and the session
 *   is live, in this same page.
 * - `cancelled` — the native app: the user closed the browser, or declined at
 *   the provider. Nothing went wrong; they can simply try again.
 */
export type LoginOutcome = 'redirected' | 'signed-in' | 'cancelled'

/** Whether `url` is the provider sending the system browser back to this app. */
export function isAuthCallback(url: string, redirectUri: string = NATIVE_AUTH_REDIRECT_URI): boolean {
    return url.split(/[?#]/)[0] === redirectUri
}

/**
 * Callbacks that were never this sign-in's — stray, forged, or left over from
 * one that already finished. They must not end the sign-in the user is
 * part-way through, so the wait carries on past them.
 */
const NOT_THIS_SIGN_IN = new Set(['no-pending-login', 'state-mismatch', 'redirect-mismatch'])

/**
 * How long to wait, after the browser reports closing, for a callback that may
 * still be on its way. Android tears the Custom Tab down as it hands the
 * redirect to the app, and does not promise which event arrives first.
 */
const CANCEL_GRACE_MS = 1_500

type ExternalLoginSession = Pick<ResilientSession, 'beginExternalLogin' | 'completeExternalLogin'>

export interface SystemBrowserLogin {
    /** Opens the provider in the system browser, and settles once the sign-in is over. */
    start(issuer: string): Promise<LoginOutcome>
    /** Stops listening for callbacks and for the browser closing. */
    dispose(): void
}

/**
 * Signs in through the system browser — a Chrome Custom Tab on Android,
 * SFSafariViewController on iOS — rather than the app's own WebView (#358).
 *
 * RFC 8252 §8.12 rules out embedded user agents for authorization requests: in
 * a WebView the app can reach the password field and the user has no browser
 * chrome saying whose page it is. The system browser also carries the user's
 * existing session with their provider, so they are often asked for nothing
 * but consent.
 *
 * The provider returns on `NATIVE_AUTH_REDIRECT_URI`, a private-use scheme the
 * OS routes back to this app: normally as an `appUrlOpen` event, or — if the
 * app was killed while the user was in the browser — as the URL that launched
 * the new process. Either way it is handed to the session to finish.
 *
 * Native only. The web keeps the library's same-page redirect.
 */
export function createSystemBrowserLogin(
    session: ExternalLoginSession,
    { onSignedIn, cancelGraceMs = CANCEL_GRACE_MS }: { onSignedIn: () => void; cancelGraceMs?: number },
): SystemBrowserLogin {
    let waiting: { resolve: (outcome: LoginOutcome) => void; reject: (error: unknown) => void } | undefined
    let callbackInFlight = false
    let cancelTimer: ReturnType<typeof setTimeout> | undefined
    const handled = new Set<string>()

    const settle = (outcome: { value: LoginOutcome } | { error: unknown }) => {
        clearTimeout(cancelTimer)
        const current = waiting
        waiting = undefined
        if (!current) return
        if ('value' in outcome) current.resolve(outcome.value)
        else current.reject(outcome.error)
    }

    const handleCallback = async (url: string) => {
        if (!isAuthCallback(url) || handled.has(url)) return
        handled.add(url)
        callbackInFlight = true
        // SFSafariViewController stays up until told to go. On Android the
        // Custom Tab has already gone, and this just finds nothing to close.
        void Browser.close().catch(() => { /* nothing open */ })
        try {
            await session.completeExternalLogin(url)
            logAuthEvent('login.completed', { via: 'system-browser' })
            onSignedIn()
            settle({ value: 'signed-in' })
        } catch (error) {
            const reason = error instanceof ExternalLoginError ? error.reason : String(error)
            logAuthEvent('login.callback-failed', { reason }, 'warn')
            if (NOT_THIS_SIGN_IN.has(reason)) return
            settle(reason === 'access_denied' ? { value: 'cancelled' } : { error })
        } finally {
            callbackInFlight = false
        }
    }

    const handleBrowserFinished = () => {
        if (!waiting || callbackInFlight) return
        clearTimeout(cancelTimer)
        cancelTimer = setTimeout(() => {
            if (!waiting || callbackInFlight) return
            logAuthEvent('login.external-agent-dismissed')
            settle({ value: 'cancelled' })
        }, cancelGraceMs)
    }

    const listeners = [
        CapacitorApp.addListener('appUrlOpen', ({ url }) => { void handleCallback(url) }),
        Browser.addListener('browserFinished', handleBrowserFinished),
    ]
    void CapacitorApp.getLaunchUrl()
        .then(launch => { if (launch?.url) void handleCallback(launch.url) })
        .catch(() => { /* no launch URL on this platform */ })

    return {
        async start(issuer) {
            // A second tap while the first browser is still up replaces it.
            settle({ value: 'cancelled' })
            const outcome = new Promise<LoginOutcome>((resolve, reject) => { waiting = { resolve, reject } })
            try {
                await session.beginExternalLogin(issuer, NATIVE_AUTH_REDIRECT_URI, url => Browser.open({ url }))
            } catch (error) {
                settle({ error })
            }
            return outcome
        },
        dispose() {
            clearTimeout(cancelTimer)
            for (const listener of listeners) {
                void listener.then(handle => handle.remove()).catch(() => {
                    // Nothing to unhook — the plugin never attached.
                })
            }
        },
    }
}
