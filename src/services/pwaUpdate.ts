import { Capacitor } from '@capacitor/core'
import { registerSW } from 'virtual:pwa-register'

export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>

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
export function registerPwaServiceWorker(onNeedRefresh: () => void): UpdateServiceWorker | undefined {
    if (Capacitor.isNativePlatform()) return undefined
    return registerSW({ onNeedRefresh })
}
