import { Capacitor } from '@capacitor/core'
import { HOSTED_CLIENT_ID_URL } from './solidClientIdentity'

/**
 * The origin to put in anything that leaves this device.
 *
 * Almost every URL the app builds is followed on the device that built it, and
 * `window.location.origin` is exactly right for those. A share link is the one
 * exception: it is built here and opened by somebody else, on their phone, days
 * later. Inside the Capacitor shell the runtime origin is `https://localhost`
 * (`capacitor.config.ts` sets the https scheme on both platforms, and
 * `solidClientIdentity.ts` explains why that has to stay), so every link the
 * native app produced started `https://localhost/#/…` — copyable, shareable and
 * useless, which made a working feature look like a local-only one (#357).
 *
 * The grants behind those links were always made correctly. Only the address
 * was wrong.
 */

const withoutTrailingSlash = (origin: string): string => origin.replace(/\/+$/, '')

/**
 * Where the app actually lives on the web.
 *
 * Derived from the hosted Client ID Document rather than written out again, so
 * the deployment host appears in the code once. `VITE_PUBLIC_ORIGIN` overrides
 * it, which is how a staging build hands out links to itself.
 */
export const PUBLIC_APP_ORIGIN = withoutTrailingSlash(
    (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)
    || new URL(HOSTED_CLIENT_ID_URL).origin,
)

/**
 * Whether this origin is the app talking to itself inside a native shell.
 *
 * Capacitor serves from the loopback host with no port — a shape no web
 * deployment has, and one a dev server (`http://localhost:5173`) and the e2e
 * preview never take either, so checking it costs nothing and catches a webview
 * whose `isNativePlatform()` answers the wrong way.
 */
function isNativeShellOrigin(origin: string): boolean {
    let url: URL
    try {
        url = new URL(origin)
    } catch {
        // Not an origin at all — `''` before the document has one, or the
        // literal `"null"` of an opaque origin. Neither is somewhere to send
        // anybody, so both take the public origin below.
        return true
    }
    if (url.protocol === 'capacitor:' || url.protocol === 'ionic:') return true
    return url.protocol === 'https:' && url.hostname === 'localhost' && url.port === ''
}

/**
 * The origin a share link should carry, given where the app is running.
 *
 * A web origin is kept as it is: the deployed site, a preview deploy and the
 * e2e build all link to themselves, which is what makes a preview testable.
 */
export function resolveShareOrigin({
    runtimeOrigin,
    isNativePlatform,
}: {
    /** `window.location.origin`. */
    runtimeOrigin: string
    isNativePlatform: boolean
}): string {
    if (isNativePlatform || isNativeShellOrigin(runtimeOrigin)) return PUBLIC_APP_ORIGIN
    return withoutTrailingSlash(runtimeOrigin)
}

/**
 * `resolveShareOrigin` for the running app. Use this — never
 * `window.location.origin` — to build anything handed to another person:
 * share links, invite links, QR codes.
 */
export function shareOrigin(): string {
    return resolveShareOrigin({
        runtimeOrigin: typeof window === 'undefined' ? '' : window.location.origin,
        isNativePlatform: Capacitor.isNativePlatform(),
    })
}
