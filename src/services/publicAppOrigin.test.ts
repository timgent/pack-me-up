import { describe, it, expect, afterEach, vi } from 'vitest'
import { HOSTED_CLIENT_ID_URL } from './solidClientIdentity'
import { PUBLIC_APP_ORIGIN, resolveShareOrigin, shareOrigin } from './publicAppOrigin'

/**
 * A share link is the one thing this app produces that has to work on somebody
 * else's device. Every other URL it builds is followed on the device that built
 * it, where `window.location.origin` is exactly right — inside the Capacitor
 * shell that origin is `https://localhost`, which is a perfectly good address
 * for the app talking to itself and no address at all for anybody else (#357).
 */

describe('PUBLIC_APP_ORIGIN', () => {
    it('is derived from the hosted Client ID Document, so there is one deployment host in the code', () => {
        expect(PUBLIC_APP_ORIGIN).toBe(new URL(HOSTED_CLIENT_ID_URL).origin)
    })

    it('is a public https origin — never loopback', () => {
        const url = new URL(PUBLIC_APP_ORIGIN)
        expect(url.protocol).toBe('https:')
        expect(url.hostname).not.toBe('localhost')
        expect(PUBLIC_APP_ORIGIN).not.toMatch(/\/$/)
    })
})

describe('resolveShareOrigin', () => {
    it('uses the public origin in the native app, whatever the shell is served from', () => {
        expect(resolveShareOrigin({ runtimeOrigin: 'https://localhost', isNativePlatform: true }))
            .toBe(PUBLIC_APP_ORIGIN)
    })

    it('uses the public origin for a Capacitor shell origin even if the platform check says otherwise', () => {
        // Belt and braces: the platform check is a native API, and a webview
        // that answers it wrongly would otherwise hand out `https://localhost`
        // links again. No web deployment is served from https://localhost with
        // no port, so nothing legitimate is caught by this.
        expect(resolveShareOrigin({ runtimeOrigin: 'https://localhost', isNativePlatform: false }))
            .toBe(PUBLIC_APP_ORIGIN)
        expect(resolveShareOrigin({ runtimeOrigin: 'capacitor://localhost', isNativePlatform: false }))
            .toBe(PUBLIC_APP_ORIGIN)
    })

    it('keeps the runtime origin on the web, so a preview deploy links to itself', () => {
        expect(resolveShareOrigin({ runtimeOrigin: 'https://preview.example.com', isNativePlatform: false }))
            .toBe('https://preview.example.com')
    })

    it('keeps a dev-server origin, so local dev and e2e follow their own links', () => {
        expect(resolveShareOrigin({ runtimeOrigin: 'http://localhost:5173', isNativePlatform: false }))
            .toBe('http://localhost:5173')
        expect(resolveShareOrigin({ runtimeOrigin: 'http://127.0.0.1:4173', isNativePlatform: false }))
            .toBe('http://127.0.0.1:4173')
    })

    it('falls back to the public origin when there is no usable runtime origin', () => {
        expect(resolveShareOrigin({ runtimeOrigin: '', isNativePlatform: false })).toBe(PUBLIC_APP_ORIGIN)
        expect(resolveShareOrigin({ runtimeOrigin: 'null', isNativePlatform: false })).toBe(PUBLIC_APP_ORIGIN)
    })
})

describe('shareOrigin', () => {
    const originalLocation = window.location

    afterEach(() => {
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('reads the runtime origin, and replaces a native one', () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, origin: 'https://localhost' },
        })
        expect(shareOrigin()).toBe(PUBLIC_APP_ORIGIN)
    })

    it('honours a VITE_PUBLIC_ORIGIN override, trailing slash and all', async () => {
        vi.stubEnv('VITE_PUBLIC_ORIGIN', 'https://staging.example.com/')
        vi.resetModules()
        const reloaded = await import('./publicAppOrigin')
        expect(reloaded.PUBLIC_APP_ORIGIN).toBe('https://staging.example.com')
        expect(reloaded.resolveShareOrigin({ runtimeOrigin: 'https://localhost', isNativePlatform: true }))
            .toBe('https://staging.example.com')
    })
})
