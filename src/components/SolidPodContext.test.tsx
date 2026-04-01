import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { EventEmitter } from 'events'
import React from 'react'
import { SolidPodProvider, useSolidPod } from './SolidPodContext'
import { ToastProvider } from './ToastContext'

function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <ToastProvider>
            <SolidPodProvider>{children}</SolidPodProvider>
        </ToastProvider>
    )
}

// Build a controllable mock session backed by an EventEmitter
function makeMockSession(isLoggedIn = false, webId?: string) {
    const events = new EventEmitter()
    return {
        info: { isLoggedIn, webId, sessionId: 'test-session' },
        events,
        fetch: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    }
}

let mockSession = makeMockSession()

vi.mock('@inrupt/solid-client-authn-browser', () => ({
    handleIncomingRedirect: vi.fn().mockResolvedValue(undefined),
    getDefaultSession: vi.fn(() => mockSession),
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
}))

import { getDefaultSession } from '@inrupt/solid-client-authn-browser'
const mockGetDefaultSession = vi.mocked(getDefaultSession)

/** Test consumer that renders context values as text */
function Consumer() {
    const { isLoggedIn, sessionExpired, webId } = useSolidPod()
    return (
        <div>
            <span data-testid="isLoggedIn">{String(isLoggedIn)}</span>
            <span data-testid="sessionExpired">{String(sessionExpired)}</span>
            <span data-testid="webId">{webId ?? 'none'}</span>
        </div>
    )
}

/** Test consumer that also exposes clearSessionExpired */
function ConsumerWithActions() {
    const { isLoggedIn, sessionExpired, clearSessionExpired, logout } = useSolidPod()
    return (
        <div>
            <span data-testid="isLoggedIn">{String(isLoggedIn)}</span>
            <span data-testid="sessionExpired">{String(sessionExpired)}</span>
            <button onClick={clearSessionExpired}>clear</button>
            <button onClick={logout}>logout</button>
        </div>
    )
}

describe('SolidPodContext', () => {
    let originalLocation: Location

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mockSession = makeMockSession()
        mockGetDefaultSession.mockReturnValue(mockSession as never)
        sessionStorage.clear()
        originalLocation = window.location
    })

    afterEach(() => {
        vi.restoreAllMocks()
        sessionStorage.clear()
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    })

    function setWindowLocation(search: string, hash = '') {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, search, hash },
        })
    }

    it('starts with isLoggedIn false and sessionExpired false', async () => {
        render(
            <Wrapper>
                <Consumer />
            </Wrapper>
        )

        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('false')
            expect(screen.getByTestId('sessionExpired').textContent).toBe('false')
        })
    })

    it('sets isLoggedIn true after session initialises with a logged-in session', async () => {
        mockSession = makeMockSession(true, 'https://user.example.org/profile/card#me')
        mockGetDefaultSession.mockReturnValue(mockSession as never)

        render(
            <Wrapper>
                <Consumer />
            </Wrapper>
        )

        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('true')
        })
    })

    it('sets isLoggedIn false and sessionExpired true on non-intentional logout', async () => {
        mockSession = makeMockSession(true, 'https://user.example.org/profile/card#me')
        mockGetDefaultSession.mockReturnValue(mockSession as never)

        render(
            <Wrapper>
                <Consumer />
            </Wrapper>
        )

        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('true')
        })

        // Simulate session expiry: library fires logout event and resets session info
        await act(async () => {
            mockSession.info.isLoggedIn = false
            const expiredSession = makeMockSession(false)
            mockGetDefaultSession.mockReturnValue(expiredSession as never)
            mockSession.events.emit('logout')
        })

        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('false')
            expect(screen.getByTestId('sessionExpired').textContent).toBe('true')
        })
    })

    it('sets isLoggedIn false but keeps sessionExpired false on intentional logout', async () => {
        mockSession = makeMockSession(true, 'https://user.example.org/profile/card#me')
        mockGetDefaultSession.mockReturnValue(mockSession as never)

        render(
            <Wrapper>
                <ConsumerWithActions />
            </Wrapper>
        )

        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('true')
        })

        await act(async () => {
            screen.getByRole('button', { name: 'logout' }).click()
        })

        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('false')
            expect(screen.getByTestId('sessionExpired').textContent).toBe('false')
        })
    })

    it('sets isLoggedIn true and sessionExpired false on login event', async () => {
        render(
            <Wrapper>
                <Consumer />
            </Wrapper>
        )

        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('false')
        })

        await act(async () => {
            mockSession.info.isLoggedIn = true
            mockSession.info.webId = 'https://user.example.org/profile/card#me'
            mockSession.events.emit('login')
        })

        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('true')
            expect(screen.getByTestId('sessionExpired').textContent).toBe('false')
        })
    })

    it('saves current route to sessionStorage before session restore when not in OAuth callback', async () => {
        setWindowLocation('', '#/create-packing-list')

        render(
            <Wrapper>
                <Consumer />
            </Wrapper>
        )

        await waitFor(() => {
            expect(sessionStorage.getItem('authReturnTo')).toBe('/create-packing-list')
        })
    })

    it('does not overwrite sessionStorage authReturnTo when in OAuth callback', async () => {
        setWindowLocation('?code=abc123&state=xyz', '#/solid-pod-handle-redirect')
        sessionStorage.setItem('authReturnTo', '/existing-route')

        render(
            <Wrapper>
                <Consumer />
            </Wrapper>
        )

        await waitFor(() => {
            expect(sessionStorage.getItem('authReturnTo')).toBe('/existing-route')
        })
    })

    it('clearSessionExpired sets sessionExpired to false', async () => {
        mockSession = makeMockSession(true, 'https://user.example.org/profile/card#me')
        mockGetDefaultSession.mockReturnValue(mockSession as never)

        render(
            <Wrapper>
                <ConsumerWithActions />
            </Wrapper>
        )

        // Wait for initialization
        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('true')
        })

        // Trigger session expiry
        await act(async () => {
            mockSession.info.isLoggedIn = false
            const expiredSession = makeMockSession(false)
            mockGetDefaultSession.mockReturnValue(expiredSession as never)
            mockSession.events.emit('logout')
        })

        await waitFor(() => {
            expect(screen.getByTestId('sessionExpired').textContent).toBe('true')
        })

        // Dismiss
        await act(async () => {
            screen.getByRole('button', { name: 'clear' }).click()
        })

        await waitFor(() => {
            expect(screen.getByTestId('sessionExpired').textContent).toBe('false')
        })
    })
})
