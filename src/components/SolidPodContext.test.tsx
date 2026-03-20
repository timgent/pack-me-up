import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Hoisted variables (must be declared before vi.mock factory runs)
// ---------------------------------------------------------------------------

const { fakeEvents, fakeSession, mockSolidLogout, mockShowToast } = vi.hoisted(() => {
  const { EventEmitter } = require('events') as typeof import('events')

  const fakeEvents = new EventEmitter()
  fakeEvents.setMaxListeners(50)

  const fakeSession = {
    info: { isLoggedIn: false, webId: undefined as string | undefined, sessionId: 'test' },
    events: fakeEvents,
    fetch: () => Promise.resolve(new Response()),
  }

  return {
    fakeEvents,
    fakeSession,
    mockSolidLogout: vi.fn(),
    mockShowToast: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@inrupt/solid-client-authn-browser', () => ({
  getDefaultSession: vi.fn(() => fakeSession),
  handleIncomingRedirect: vi.fn().mockResolvedValue(undefined),
  login: vi.fn(),
  logout: mockSolidLogout,
}))

// Stable showToast reference — the real bug is React StrictMode double-invoking
// effects with no cleanup, not an unstable showToast reference.
vi.mock('./ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

import { SolidPodProvider, useSolidPod } from './SolidPodContext'

// ---------------------------------------------------------------------------
// Helper component
// ---------------------------------------------------------------------------

function LogoutButton() {
  const { logout } = useSolidPod()
  return <button onClick={() => { void logout() }}>Logout</button>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SolidPodContext', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockShowToast.mockClear()
    mockSolidLogout.mockClear()

    // solidLogout emits 'logout' on the shared fake session, mirroring the
    // real Inrupt library behaviour
    mockSolidLogout.mockImplementation(async () => {
      fakeEvents.emit('logout')
    })

    // Remove any listeners left by the previous test's component
    fakeEvents.removeAllListeners()
    fakeSession.info = { isLoggedIn: false, webId: undefined, sessionId: 'test' }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // In React 18 StrictMode (used in development and the production app), effects
  // are intentionally double-invoked to surface missing cleanups. Because
  // setupSessionEventListeners has no cleanup, both invocations leave their
  // listeners active. When the user logs out:
  //   1st listener: sees intentionalLogoutRef=true → suppresses toast, resets flag to false
  //   2nd listener: sees intentionalLogoutRef=false → shows "session expired" toast ← BUG
  it('does not show session-expired toast when user intentionally logs out (StrictMode)', async () => {
    render(
      <React.StrictMode>
        <SolidPodProvider>
          <LogoutButton />
        </SolidPodProvider>
      </React.StrictMode>
    )

    await waitFor(() => screen.getByText('Logout'))

    await act(async () => {
      fireEvent.click(screen.getByText('Logout'))
    })

    expect(mockShowToast).not.toHaveBeenCalledWith(
      expect.stringContaining('session has expired'),
      'error'
    )
  })

  it('shows session-expired toast when session expires unexpectedly', async () => {
    render(
      <SolidPodProvider>
        <LogoutButton />
      </SolidPodProvider>
    )

    await waitFor(() => screen.getByText('Logout'))

    // Emit the logout event directly — no intentional flag set, so the toast
    // should appear
    act(() => {
      fakeEvents.emit('logout')
    })

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('session has expired'),
      'error'
    )
  })
})
