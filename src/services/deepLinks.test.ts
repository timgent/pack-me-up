import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PUBLIC_APP_ORIGIN } from './publicAppOrigin'

const mockIsNativePlatform = vi.fn(() => false)
const mockAddListener = vi.fn()
const mockRemove = vi.fn()

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))

vi.mock('@capacitor/app', () => ({
    App: { addListener: (...args: unknown[]) => mockAddListener(...args) },
}))

const { routeFromDeepLink, installDeepLinkHandler } = await import('./deepLinks')

function fireAppUrlOpen(url: string) {
    const handler = mockAddListener.mock.calls.at(-1)?.[1] as (event: { url: string }) => void
    handler({ url })
}

/**
 * A share link (`buildSharedListUrl`/`buildSharedSetupUrl` in solidPod.ts,
 * `buildInviteLink` in invites.ts) is a `PUBLIC_APP_ORIGIN` URL whose route
 * lives entirely in the hash, because the app is a HashRouter SPA. Once
 * Android/iOS route such a link to this app instead of the browser (the
 * intent-filter / associated-domain side, which lives outside src/), the app
 * still has to turn the arriving URL into where HashRouter should be —
 * Capacitor's `appUrlOpen` hands over the full URL, not a hash the router can
 * use directly.
 */
describe('routeFromDeepLink', () => {
    it('extracts the hash route from a shared-list link', () => {
        const url = `${PUBLIC_APP_ORIGIN}/#/view-lists/abc?pod=${encodeURIComponent('https://pod.example.com/')}&owner=${encodeURIComponent('https://pod.example.com/profile/card#me')}`
        expect(routeFromDeepLink(url)).toBe(`#/view-lists/abc?pod=${encodeURIComponent('https://pod.example.com/')}&owner=${encodeURIComponent('https://pod.example.com/profile/card#me')}`)
    })

    it('extracts the hash route from a shared-setup link', () => {
        const url = `${PUBLIC_APP_ORIGIN}/#/pod/${encodeURIComponent('https://pod.example.com/')}/view-lists`
        expect(routeFromDeepLink(url)).toBe(`#/pod/${encodeURIComponent('https://pod.example.com/')}/view-lists`)
    })

    it('extracts the hash route from an invite link', () => {
        const url = `${PUBLIC_APP_ORIGIN}/#/invite/tok-123?pod=${encodeURIComponent('https://pod.example.com/')}&kind=full-setup`
        expect(routeFromDeepLink(url)).toBe(`#/invite/tok-123?pod=${encodeURIComponent('https://pod.example.com/')}&kind=full-setup`)
    })

    it('returns null for a URL on a different origin', () => {
        expect(routeFromDeepLink('https://not-this-app.example.com/#/view-lists/abc')).toBeNull()
    })

    it('returns null for a string that is not a URL at all', () => {
        expect(routeFromDeepLink('not a url')).toBeNull()
    })

    it('returns null when there is no hash to route to', () => {
        expect(routeFromDeepLink(`${PUBLIC_APP_ORIGIN}/`)).toBeNull()
    })

    it('accepts a custom origin, so a preview build can be tested natively', () => {
        const url = 'https://preview.example.com/#/view-lists/abc'
        expect(routeFromDeepLink(url, 'https://preview.example.com')).toBe('#/view-lists/abc')
    })
})

describe('installDeepLinkHandler', () => {
    beforeEach(() => {
        mockIsNativePlatform.mockReturnValue(false)
        mockAddListener.mockReset()
        mockAddListener.mockResolvedValue({ remove: mockRemove })
        mockRemove.mockReset()
    })

    it('does not subscribe to the plugin on the web', () => {
        installDeepLinkHandler(window)

        expect(mockAddListener).not.toHaveBeenCalled()
    })

    it('routes an incoming link on native, telling the router to look again', async () => {
        mockIsNativePlatform.mockReturnValue(true)
        window.location.hash = '#/view-lists'
        installDeepLinkHandler(window)
        await vi.waitFor(() => expect(mockAddListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function)))

        const seen: string[] = []
        window.addEventListener('popstate', () => seen.push(window.location.hash))
        fireAppUrlOpen(`${PUBLIC_APP_ORIGIN}/#/view-lists/abc?pod=${encodeURIComponent('https://pod.example.com/')}`)

        expect(window.location.hash).toBe(`#/view-lists/abc?pod=${encodeURIComponent('https://pod.example.com/')}`)
        expect(seen).toContain(`#/view-lists/abc?pod=${encodeURIComponent('https://pod.example.com/')}`)
    })

    it('leaves the current route alone when the incoming URL has nothing to route to', async () => {
        mockIsNativePlatform.mockReturnValue(true)
        window.location.hash = '#/view-lists'
        installDeepLinkHandler(window)
        await vi.waitFor(() => expect(mockAddListener).toHaveBeenCalled())

        fireAppUrlOpen('https://not-this-app.example.com/#/view-lists/abc')

        expect(window.location.hash).toBe('#/view-lists')
    })

    it('removes the native listener when unsubscribed', async () => {
        mockIsNativePlatform.mockReturnValue(true)
        const unsubscribe = installDeepLinkHandler(window)
        await vi.waitFor(() => expect(mockAddListener).toHaveBeenCalled())

        unsubscribe()

        await vi.waitFor(() => expect(mockRemove).toHaveBeenCalled())
    })
})
