import type { BrowserContext, Page } from '@playwright/test'

/**
 * Makes every page in `ctx` run as the native app does, for the parts of it
 * that sign in through the system browser (#358).
 *
 * Capacitor decides it is native from `CapacitorCustomPlatform`, and talks to
 * the plugins in `PluginHeaders` over `nativeCallback`/`nativePromise` — the
 * hooks the real Android/iOS bridge provides. This provides them for the two
 * plugins sign-in uses: `Browser.open` becomes `window.open`, so a popup plays
 * the Custom Tab, and listeners are kept here so the test can deliver the
 * events the OS would (`appUrlOpen`, `browserFinished`).
 *
 * Why not simply let Capacitor fall back to the plugins' web implementations:
 * those are created lazily, and first calls that race — the app makes several
 * at startup — each get an instance of their own, so a listener can end up on
 * one the events never reach. The real bridge has no such problem, and neither
 * does this.
 */
export async function runAsNativeApp(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    type Options = { eventName?: string; callbackId?: string; url?: string }
    const listeners = new Map<string, Map<string, (data: unknown) => void>>()
    let nextCallbackId = 0
    let tab: Window | null = null

    const emit = (plugin: string, event: string, data: unknown) => {
      listeners.get(`${plugin}.${event}`)?.forEach(callback => callback(data))
    }

    const method = (name: string, rtype: 'promise' | 'callback') => ({ name, rtype })
    const win = window as unknown as Record<string, unknown>
    win.CapacitorCustomPlatform = { name: 'android' }
    win.Capacitor = {
      PluginHeaders: [
        {
          name: 'App',
          methods: [method('addListener', 'callback'), method('removeListener', 'promise'), method('getLaunchUrl', 'promise')],
        },
        {
          name: 'Browser',
          methods: [
            method('open', 'promise'),
            method('close', 'promise'),
            method('addListener', 'callback'),
            method('removeListener', 'promise'),
          ],
        },
      ],
      nativeCallback(plugin: string, name: string, options: Options, callback: (data: unknown) => void) {
        if (name !== 'addListener') throw new Error(`${plugin}.${name} is not part of the fake native shell`)
        const key = `${plugin}.${options.eventName}`
        const callbackId = String(++nextCallbackId)
        if (!listeners.has(key)) listeners.set(key, new Map())
        listeners.get(key)!.set(callbackId, callback)
        return Promise.resolve(callbackId)
      },
      async nativePromise(plugin: string, name: string, options: Options) {
        if (name === 'removeListener') {
          listeners.get(`${plugin}.${options.eventName}`)?.delete(String(options.callbackId))
          return undefined
        }
        if (plugin === 'App' && name === 'getLaunchUrl') return { url: '' }
        if (plugin === 'Browser' && name === 'open') {
          tab = window.open(options.url, '_blank')
          return undefined
        }
        if (plugin === 'Browser' && name === 'close') {
          tab?.close()
          tab = null
          emit('Browser', 'browserFinished', {})
          return undefined
        }
        throw new Error(`${plugin}.${name} is not part of the fake native shell`)
      },
    }
    win.__nativeShell = { emit }
  })
}

/** Delivers an event the OS would, e.g. `appUrlOpen` when a link is routed to the app. */
export async function emitNativeEvent(page: Page, plugin: string, event: string, data: unknown): Promise<void> {
  await page.evaluate(({ plugin, event, data }) => {
    const shell = (window as unknown as { __nativeShell: { emit: (p: string, e: string, d: unknown) => void } }).__nativeShell
    shell.emit(plugin, event, data)
  }, { plugin, event, data })
}
