import { Capacitor } from '@capacitor/core'
import { registerSW } from 'virtual:pwa-register'

export type ApplyUpdate = () => void

/**
 * How long Reload waits for the new worker to take over before reloading
 * regardless. A reload that lands on the old worker only brings the banner
 * back; a button that does nothing leaves the user stuck.
 */
export const RELOAD_FALLBACK_MS = 3000

/**
 * Registers the app's service worker, skipped on Capacitor's native shell —
 * it already ships its own assets from https://localhost and has no use for
 * a second layer of caching, the same "web vs. native" split main.tsx uses
 * for safe-area handling.
 *
 * Built with `registerType: 'prompt'` (vite.config.ts), so a build shipped
 * while the tab is open never reloads it out from under the user — it only
 * calls `onNeedRefresh`, and the caller decides when to apply it via the
 * returned function. The alternative, `autoUpdate`, reloads the instant the
 * new worker activates, which could land mid-edit on a packing list.
 */
export function registerPwaServiceWorker(
    onNeedRefresh: () => void,
    reloadPage: () => void = () => window.location.reload(),
): ApplyUpdate | undefined {
    if (Capacitor.isNativePlatform()) return undefined
    let registration: ServiceWorkerRegistration | undefined
    const updateSW = registerSW({
        onNeedRefresh,
        onRegisteredSW: (_url, r) => {
            registration = r
        },
    })
    return () => applyUpdate(updateSW, registration, reloadPage)
}

/**
 * Hands over to the waiting worker, then reloads the page ourselves. The
 * plugin's own `updateSW(true)` only reloads on `controllerchange`, and a tab
 * the old worker never controlled — a first visit, or after a hard reload —
 * gets no such event, so Reload silently did nothing there. The worker's own
 * `activated` state is reported either way.
 */
function applyUpdate(
    updateSW: () => Promise<void>,
    registration: ServiceWorkerRegistration | undefined,
    reloadPage: () => void,
) {
    let reloaded = false
    const reloadOnce = () => {
        if (reloaded) return
        reloaded = true
        reloadPage()
    }

    // Nothing waiting (another tab may have applied it already): a plain
    // reload picks up whichever worker is active now.
    const waiting = registration?.waiting
    if (!waiting) {
        reloadOnce()
        return
    }

    waiting.addEventListener('statechange', () => {
        if (waiting.state === 'activated' || waiting.state === 'redundant') reloadOnce()
    })
    setTimeout(reloadOnce, RELOAD_FALLBACK_MS)
    void updateSW()
}
