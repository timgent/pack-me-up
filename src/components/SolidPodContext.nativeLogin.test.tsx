import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React, { useState } from 'react'
import { SolidPodProvider, useSolidPod } from './SolidPodContext'
import { ToastProvider } from './ToastContext'
import { ExternalLoginError } from '../services/ResilientSession'
import { NATIVE_AUTH_REDIRECT_URI } from '../services/solidClientIdentity'
import { AUTH_RETURN_TO_KEY } from '../pages/solid-pod-handle-redirect-page'

/**
 * Signing in from the native app goes through the system browser, not the
 * WebView (#358). What the context owes that path: it never navigates the
 * WebView to the provider, it finishes the sign-in when the callback lands,
 * puts the user back where they started, and — as everywhere else in this
 * file's siblings — a sign-in that fails costs nobody the session they had.
 */

let capturedCallbacks: { onSessionStateChange?: (event?: Event) => void } = {}
let mockIsActive = false
let mockWebId: string | undefined
const mockLibraryLogin = vi.fn()
const mockBeginExternalLogin = vi.fn()
const mockCompleteExternalLogin = vi.fn()
const mockLogout = vi.fn()
const mockHasStoredSession = vi.fn()
const mockRestore = vi.fn()

vi.mock('../services/ResilientSession', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/ResilientSession')>()
    return {
        ...actual,
        ResilientSession: vi.fn().mockImplementation(function (
            _clientDetails: unknown,
            _database: unknown,
            options: typeof capturedCallbacks,
        ) {
            capturedCallbacks = options ?? {}
            return {
                get isActive() { return mockIsActive },
                get webId() { return mockWebId },
                handleRedirectFromLogin: vi.fn().mockResolvedValue(undefined),
                restore: (...args: unknown[]) => mockRestore(...args),
                login: (...args: unknown[]) => mockLibraryLogin(...args),
                beginExternalLogin: (...args: unknown[]) => mockBeginExternalLogin(...args),
                completeExternalLogin: (...args: unknown[]) => mockCompleteExternalLogin(...args),
                logout: (...args: unknown[]) => mockLogout(...args),
                authFetch: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
                hasStoredSession: (...args: unknown[]) => mockHasStoredSession(...args),
                needsRenewal: vi.fn().mockReturnValue(false),
                scheduleRenewal: vi.fn(),
                cancelRenewal: vi.fn(),
                getExpiresIn: () => 3600,
                isExpired: () => false,
            }
        }),
    }
})

vi.mock('@uvdsl/solid-oidc-client-browser', () => ({
    SessionIDB: vi.fn().mockImplementation(function () { return {} }),
}))

const mockIsNativePlatform = vi.fn(() => true)
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))

const appListeners = new Map<string, (event: { url: string }) => void>()
vi.mock('@capacitor/app', () => ({
    App: {
        addListener: async (event: string, listener: (event: { url: string }) => void) => {
            appListeners.set(event, listener)
            return { remove: () => appListeners.delete(event) }
        },
        getLaunchUrl: async () => undefined,
    },
}))

const mockBrowserOpen = vi.fn()
vi.mock('@capacitor/browser', () => ({
    Browser: {
        open: (options: unknown) => mockBrowserOpen(options),
        close: vi.fn().mockResolvedValue(undefined),
        addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    },
}))

const ISSUER = 'https://idp.example.org'
const WEB_ID = 'https://user.example.org/profile/card#me'
const CALLBACK = `${NATIVE_AUTH_REDIRECT_URI}?code=c1&state=s1&iss=${encodeURIComponent(ISSUER)}`

function Consumer() {
    const { isLoggedIn, login } = useSolidPod()
    const [outcome, setOutcome] = useState('none')
    return (
        <div>
            <span data-testid="isLoggedIn">{String(isLoggedIn)}</span>
            <span data-testid="outcome">{outcome}</span>
            <button onClick={() => { void login(ISSUER).then(result => setOutcome(String(result)), () => setOutcome('failed')) }}>sign in</button>
        </div>
    )
}

async function renderApp() {
    render(<ToastProvider><SolidPodProvider><Consumer /></SolidPodProvider></ToastProvider>)
    // Let startup (restore attempt, listener registration) settle.
    await waitFor(() => expect(appListeners.has('appUrlOpen')).toBe(true))
}

async function signIn() {
    await act(async () => { screen.getByRole('button', { name: 'sign in' }).click() })
    await waitFor(() => expect(mockBeginExternalLogin).toHaveBeenCalled())
}

async function deliverCallback(url = CALLBACK) {
    await act(async () => { appListeners.get('appUrlOpen')?.({ url }) })
}

describe('SolidPodContext — signing in from the native app', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        capturedCallbacks = {}
        appListeners.clear()
        mockIsActive = false
        mockWebId = undefined
        mockIsNativePlatform.mockReturnValue(true)
        mockLibraryLogin.mockReset().mockResolvedValue(undefined)
        mockBeginExternalLogin.mockReset().mockImplementation(
            async (_issuer: string, _redirectUri: string, open: (url: string) => Promise<void>) => {
                await open(`${ISSUER}/auth?state=s1`)
            },
        )
        mockCompleteExternalLogin.mockReset().mockImplementation(async () => {
            mockIsActive = true
            mockWebId = WEB_ID
            capturedCallbacks.onSessionStateChange?.(
                new CustomEvent('sessionStateChange', { detail: { isActive: true, webId: WEB_ID } }),
            )
        })
        mockLogout.mockReset().mockResolvedValue(undefined)
        mockHasStoredSession.mockReset().mockResolvedValue(false)
        mockRestore.mockReset().mockResolvedValue(undefined)
        mockBrowserOpen.mockReset().mockResolvedValue(undefined)
        sessionStorage.clear()
        localStorage.clear()
        window.history.replaceState(null, '', '/#/home')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('opens the provider in the system browser, and never sends the WebView there', async () => {
        await renderApp()
        await signIn()

        expect(mockBeginExternalLogin).toHaveBeenCalledWith(ISSUER, NATIVE_AUTH_REDIRECT_URI, expect.any(Function))
        expect(mockBrowserOpen).toHaveBeenCalledWith({ url: `${ISSUER}/auth?state=s1` })
        expect(mockLibraryLogin).not.toHaveBeenCalled()
    })

    it('signs in when the browser comes back, and tells the caller so', async () => {
        await renderApp()
        await signIn()

        await deliverCallback()

        expect(mockCompleteExternalLogin).toHaveBeenCalledWith(CALLBACK)
        await waitFor(() => expect(screen.getByTestId('isLoggedIn').textContent).toBe('true'))
        await waitFor(() => expect(screen.getByTestId('outcome').textContent).toBe('signed-in'))
    })

    it('puts the user back on the page they signed in from', async () => {
        // Someone who opened a shared list and signed in to read it has to land
        // on that list — the same promise the web redirect keeps.
        const sharedList = `/view-lists/abc?pod=${encodeURIComponent('https://pod.example.org/')}`
        window.history.replaceState(null, '', `/#${sharedList}`)
        await renderApp()
        await signIn()
        expect(sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBe(sharedList)

        await deliverCallback()

        await waitFor(() => expect(window.location.hash).toBe(`#${sharedList}`))
    })

    it('hands a sign-in from the home page to the page that picks where to go', async () => {
        await renderApp()
        await signIn()

        await deliverCallback()

        await waitFor(() => expect(window.location.hash).toBe('#/solid-pod-handle-redirect'))
    })

    it('never ends the stored session over a sign-in that failed', async () => {
        mockHasStoredSession.mockResolvedValue(true)
        mockCompleteExternalLogin.mockRejectedValue(new ExternalLoginError('token-request-failed'))
        await renderApp()
        await signIn()

        await deliverCallback()

        await waitFor(() => expect(screen.getByTestId('outcome').textContent).toBe('failed'))
        expect(mockLogout).not.toHaveBeenCalled()
    })
})

describe('SolidPodContext — signing in on the web', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        appListeners.clear()
        mockIsNativePlatform.mockReturnValue(false)
        mockLibraryLogin.mockReset().mockResolvedValue(undefined)
        mockBeginExternalLogin.mockReset()
        mockHasStoredSession.mockReset().mockResolvedValue(false)
        sessionStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        mockIsNativePlatform.mockReturnValue(true)
    })

    it('keeps the same-page redirect, returning to this origin', async () => {
        render(<ToastProvider><SolidPodProvider><Consumer /></SolidPodProvider></ToastProvider>)

        await act(async () => { screen.getByRole('button', { name: 'sign in' }).click() })

        await waitFor(() => expect(mockLibraryLogin).toHaveBeenCalledWith(ISSUER, `${window.location.origin}/`))
        await waitFor(() => expect(screen.getByTestId('outcome').textContent).toBe('redirected'))
        expect(mockBeginExternalLogin).not.toHaveBeenCalled()
        expect(appListeners.has('appUrlOpen')).toBe(false)
    })
})
