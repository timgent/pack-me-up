import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { PUBLIC_APP_ORIGIN } from './publicAppOrigin'

/**
 * Every link a share produces (`buildSharedListUrl`/`buildSharedSetupUrl` in
 * solidPod.ts, `buildInviteLink` in invites.ts) is a `PUBLIC_APP_ORIGIN` URL
 * whose destination lives entirely in the hash, because the app is a
 * HashRouter SPA. Android's intent-filter and iOS's associated domain (see
 * AndroidManifest.xml and App.entitlements) get such a link routed to this
 * app instead of the browser, but Capacitor's `appUrlOpen` hands over the
 * whole URL, not something HashRouter can act on directly.
 *
 * The origin check is defence in depth: the OS-level filters already restrict
 * which URLs reach the app at all, but nothing stops a caller from feeding
 * `installDeepLinkHandler` a URL that didn't come through them.
 */
export function routeFromDeepLink(url: string, appOrigin: string = PUBLIC_APP_ORIGIN): string | null {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return null
    }
    if (parsed.origin !== appOrigin) return null
    return parsed.hash || null
}

/**
 * Routes an incoming deep link into the running app.
 *
 * Reuses the rewrite technique `installOpenInvocationHandler`
 * (capability/openInvocation.ts) established for the same problem — another
 * app's `#open=…` invocation arriving in a fragment HashRouter can't route:
 * `history.replaceState` to the resolved hash, then a synthetic `popstate`,
 * since that's the event HashRouter listens on and a plain hash assignment
 * would fire `hashchange` instead.
 *
 * A no-op on the web: `appUrlOpen` is a native-shell event, and a browser tab
 * opened via a normal link already has the right hash on load.
 */
export function installDeepLinkHandler(win: Window = window): () => void {
    if (!Capacitor.isNativePlatform()) return () => {}

    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }: { url: string }) => {
        const route = routeFromDeepLink(url)
        if (!route) return
        win.history.replaceState(null, '', route)
        win.dispatchEvent(new PopStateEvent('popstate'))
    })

    return () => {
        void listener.then(handle => handle.remove()).catch(() => {
            // Nothing to unhook — the plugin never attached.
        })
    }
}
