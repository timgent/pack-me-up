import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExternalLoginError } from './ResilientSession'
import { NATIVE_AUTH_REDIRECT_URI } from './solidClientIdentity'
import { PUBLIC_APP_ORIGIN } from './publicAppOrigin'

type Listener = (event: { url: string }) => void

const appListeners = new Map<string, Listener>()
const browserListeners = new Map<string, () => void>()
const mockRemove = vi.fn()
const mockGetLaunchUrl = vi.fn()
const mockBrowserOpen = vi.fn()
const mockBrowserClose = vi.fn()

vi.mock('@capacitor/app', () => ({
    App: {
        addListener: async (event: string, listener: Listener) => {
            appListeners.set(event, listener)
            return { remove: () => { mockRemove(event); appListeners.delete(event) } }
        },
        getLaunchUrl: () => mockGetLaunchUrl(),
    },
}))

vi.mock('@capacitor/browser', () => ({
    Browser: {
        open: (options: { url: string }) => mockBrowserOpen(options),
        close: () => mockBrowserClose(),
        addListener: async (event: string, listener: () => void) => {
            browserListeners.set(event, listener)
            return { remove: () => { mockRemove(event); browserListeners.delete(event) } }
        },
    },
}))

vi.mock('./authLog', () => ({ logAuthEvent: vi.fn() }))

const { isAuthCallback, createSystemBrowserLogin } = await import('./nativeLogin')

const ISSUER = 'https://idp.example.org'
const AUTHORIZE_URL = `${ISSUER}/auth?client_id=x`
const callback = (params = 'code=c1&state=s1&iss=https%3A%2F%2Fidp.example.org') =>
    `${NATIVE_AUTH_REDIRECT_URI}?${params}`

/**
 * The native half of signing in through the system browser (#358): hand the
 * provider's page to a Custom Tab / SFSafariViewController, catch the
 * custom-scheme callback when the OS routes it back, and tell whoever started
 * the sign-in how it ended — so the provider picker can close, or go back to
 * the list if the user just closed the browser.
 */
describe('isAuthCallback', () => {
    it('recognises the redirect the provider sends the browser back to', () => {
        expect(isAuthCallback(callback())).toBe(true)
        expect(isAuthCallback(callback('error=access_denied&state=s1'))).toBe(true)
    })

    it('ignores a shared link, which is the deep-link handler\'s to route', () => {
        expect(isAuthCallback(`${PUBLIC_APP_ORIGIN}/#/view-lists/abc`)).toBe(false)
    })

    it('ignores anything that merely starts the same way', () => {
        expect(isAuthCallback(`${NATIVE_AUTH_REDIRECT_URI}-evil?code=c`)).toBe(false)
        expect(isAuthCallback('com.timgent.packmeup:/elsewhere?code=c')).toBe(false)
        expect(isAuthCallback('not a url')).toBe(false)
    })
})

describe('createSystemBrowserLogin', () => {
    let session: {
        beginExternalLogin: ReturnType<typeof vi.fn>
        completeExternalLogin: ReturnType<typeof vi.fn>
    }
    let onSignedIn: ReturnType<typeof vi.fn>
    let flow: ReturnType<typeof createSystemBrowserLogin> | undefined

    const fireAppUrlOpen = (url: string) => appListeners.get('appUrlOpen')?.({ url })
    const fireBrowserFinished = () => browserListeners.get('browserFinished')?.()
    const settledWith = async (promise: Promise<unknown>) => {
        let outcome: unknown = 'pending'
        promise.then(value => { outcome = value }, error => { outcome = error })
        await vi.advanceTimersByTimeAsync(0)
        return outcome
    }

    function create(cancelGraceMs = 1_500) {
        flow = createSystemBrowserLogin(session, { onSignedIn, cancelGraceMs })
        return flow
    }

    beforeEach(() => {
        vi.useFakeTimers()
        appListeners.clear()
        browserListeners.clear()
        mockRemove.mockReset()
        mockGetLaunchUrl.mockReset().mockResolvedValue(undefined)
        mockBrowserOpen.mockReset().mockResolvedValue(undefined)
        mockBrowserClose.mockReset().mockResolvedValue(undefined)
        session = {
            beginExternalLogin: vi.fn(async (_issuer: string, _redirectUri: string, open: (url: string) => Promise<void>) => {
                await open(AUTHORIZE_URL)
            }),
            completeExternalLogin: vi.fn().mockResolvedValue(undefined),
        }
        onSignedIn = vi.fn()
    })

    afterEach(() => {
        flow?.dispose()
        flow = undefined
        vi.useRealTimers()
    })

    it('opens the provider in the system browser, returning to the app\'s own scheme', async () => {
        const login = create()
        void login.start(ISSUER)
        await vi.advanceTimersByTimeAsync(0)

        expect(session.beginExternalLogin).toHaveBeenCalledWith(ISSUER, NATIVE_AUTH_REDIRECT_URI, expect.any(Function))
        expect(mockBrowserOpen).toHaveBeenCalledWith({ url: AUTHORIZE_URL })
    })

    it('finishes the sign-in when the provider sends the browser back', async () => {
        const login = create()
        const outcome = login.start(ISSUER)
        await vi.advanceTimersByTimeAsync(0)

        fireAppUrlOpen(callback())

        expect(await settledWith(outcome)).toBe('signed-in')
        expect(session.completeExternalLogin).toHaveBeenCalledWith(callback())
        expect(mockBrowserClose).toHaveBeenCalled()
        expect(onSignedIn).toHaveBeenCalledTimes(1)
    })

    it('reports a cancelled sign-in when the user closes the browser', async () => {
        const login = create()
        const outcome = login.start(ISSUER)
        await vi.advanceTimersByTimeAsync(0)

        fireBrowserFinished()
        expect(await settledWith(outcome)).toBe('pending')
        await vi.advanceTimersByTimeAsync(1_500)

        expect(await settledWith(outcome)).toBe('cancelled')
        expect(onSignedIn).not.toHaveBeenCalled()
    })

    it('still signs in when the browser reports closing just before the callback lands', async () => {
        // On Android the Custom Tab goes away as the OS hands the redirect to
        // the app, and nothing promises which of the two events arrives first.
        const login = create()
        const outcome = login.start(ISSUER)
        await vi.advanceTimersByTimeAsync(0)

        fireBrowserFinished()
        await vi.advanceTimersByTimeAsync(500)
        fireAppUrlOpen(callback())
        await vi.advanceTimersByTimeAsync(1_500)

        expect(await settledWith(outcome)).toBe('signed-in')
    })

    it('treats the user declining at the provider as a cancelled sign-in', async () => {
        session.completeExternalLogin.mockRejectedValue(new ExternalLoginError('access_denied'))
        const login = create()
        const outcome = login.start(ISSUER)
        await vi.advanceTimersByTimeAsync(0)

        fireAppUrlOpen(callback('error=access_denied&state=s1'))

        expect(await settledWith(outcome)).toBe('cancelled')
        expect(onSignedIn).not.toHaveBeenCalled()
    })

    it('fails the sign-in when the exchange itself fails', async () => {
        const failure = new ExternalLoginError('token-request-failed')
        session.completeExternalLogin.mockRejectedValue(failure)
        const login = create()
        const outcome = login.start(ISSUER)
        await vi.advanceTimersByTimeAsync(0)

        fireAppUrlOpen(callback())

        expect(await settledWith(outcome)).toBe(failure)
        expect(onSignedIn).not.toHaveBeenCalled()
    })

    it('keeps waiting past a callback that was never this sign-in\'s', async () => {
        session.completeExternalLogin
            .mockRejectedValueOnce(new ExternalLoginError('state-mismatch'))
            .mockResolvedValueOnce(undefined)
        const login = create()
        const outcome = login.start(ISSUER)
        await vi.advanceTimersByTimeAsync(0)

        fireAppUrlOpen(callback('code=forged&state=forged&iss=x'))
        expect(await settledWith(outcome)).toBe('pending')

        fireAppUrlOpen(callback())
        expect(await settledWith(outcome)).toBe('signed-in')
    })

    it('fails the sign-in when the browser cannot be opened', async () => {
        mockBrowserOpen.mockRejectedValue(new Error('no browser'))
        const login = create()

        await expect(login.start(ISSUER)).rejects.toThrow('no browser')
    })

    it('finishes a sign-in whose callback started the app from cold', async () => {
        // Android killed the app while the user was in the browser: the callback
        // is the URL that launched the new process, not an appUrlOpen event.
        mockGetLaunchUrl.mockResolvedValue({ url: callback() })
        create()
        await vi.advanceTimersByTimeAsync(0)

        expect(session.completeExternalLogin).toHaveBeenCalledWith(callback())
        expect(onSignedIn).toHaveBeenCalledTimes(1)
    })

    it('handles a callback once, however many ways it arrives', async () => {
        mockGetLaunchUrl.mockResolvedValue({ url: callback() })
        create()
        await vi.advanceTimersByTimeAsync(0)

        fireAppUrlOpen(callback())
        await vi.advanceTimersByTimeAsync(0)

        expect(session.completeExternalLogin).toHaveBeenCalledTimes(1)
    })

    it('leaves every other link to the deep-link handler', async () => {
        create()
        await vi.advanceTimersByTimeAsync(0)

        fireAppUrlOpen(`${PUBLIC_APP_ORIGIN}/#/view-lists/abc`)
        await vi.advanceTimersByTimeAsync(0)

        expect(session.completeExternalLogin).not.toHaveBeenCalled()
        expect(mockBrowserClose).not.toHaveBeenCalled()
    })

    it('stops listening once disposed', async () => {
        const login = create()
        await vi.advanceTimersByTimeAsync(0)

        login.dispose()
        flow = undefined
        await vi.advanceTimersByTimeAsync(0)

        expect(mockRemove).toHaveBeenCalledWith('appUrlOpen')
        expect(mockRemove).toHaveBeenCalledWith('browserFinished')
    })
})
