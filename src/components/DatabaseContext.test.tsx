import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { DatabaseProvider, useDatabase } from './DatabaseContext'

// --- Mocks ---

vi.mock('./SolidPodContext', () => ({
  useSolidPod: vi.fn(),
}))

vi.mock('../services/solidPod', () => ({
  getPrimaryPodUrl: vi.fn(),
}))

// Mock PackingAppDatabase so tests don't create real filesystem databases
vi.mock('../services/database', () => {
  const instanceCache = new Map<string, object>()
  return {
    LOCAL_NAMESPACE: 'local',
    PackingAppDatabase: {
      getInstance: vi.fn((namespace: string) => {
        if (!instanceCache.has(namespace)) {
          instanceCache.set(namespace, {
            getInfo: vi.fn().mockResolvedValue({ db_name: `packing-app-data--${namespace}`, doc_count: 0 }),
          })
        }
        return instanceCache.get(namespace)
      }),
      sanitizePodUrl: vi.fn((url: string) =>
        url.replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\//g, '_')
      ),
    },
  }
})

import { useSolidPod } from './SolidPodContext'
import { getPrimaryPodUrl } from '../services/solidPod'
import { PackingAppDatabase } from '../services/database'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockGetInstance = vi.mocked(PackingAppDatabase.getInstance)

function NamespaceDisplay() {
  const { db } = useDatabase()
  return <div data-testid="db-name">{(db as any).getInfo ? 'has-db' : 'no-db'}</div>
}

function OutsideProvider() {
  useDatabase()
  return null
}

describe('DatabaseContext', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetInstance.mockClear()
    mockGetPrimaryPodUrl.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when not logged in and not loading', async () => {
    mockUseSolidPod.mockReturnValue({
      session: null,
      isLoggedIn: false,
      webId: undefined,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <DatabaseProvider>
        <NamespaceDisplay />
      </DatabaseProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('db-name')).toBeTruthy()
    })
  })

  it('does not render children while session is loading', () => {
    mockUseSolidPod.mockReturnValue({
      session: null,
      isLoggedIn: false,
      webId: undefined,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <DatabaseProvider>
        <div data-testid="child">hello</div>
      </DatabaseProvider>
    )

    expect(screen.queryByTestId('child')).toBeNull()
  })

  it('provides a local-namespaced db when not logged in', async () => {
    mockUseSolidPod.mockReturnValue({
      session: null,
      isLoggedIn: false,
      webId: undefined,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <DatabaseProvider>
        <div data-testid="child" />
      </DatabaseProvider>
    )

    await waitFor(() => screen.getByTestId('child'))
    expect(mockGetInstance).toHaveBeenCalledWith('local')
  })

  it('provides a pod-namespaced db when logged in with a pod URL', async () => {
    const mockSession = { info: { isLoggedIn: true, webId: 'https://example.com/profile#me' } }
    mockUseSolidPod.mockReturnValue({
      session: mockSession as any,
      isLoggedIn: true,
      webId: 'https://example.com/profile#me',
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })
    mockGetPrimaryPodUrl.mockResolvedValue('https://example.com/')

    render(
      <DatabaseProvider>
        <div data-testid="child" />
      </DatabaseProvider>
    )

    await waitFor(() => screen.getByTestId('child'))
    expect(mockGetInstance).toHaveBeenCalledWith('example.com')
  })

  it('falls back to sanitized webId when getPrimaryPodUrl returns null', async () => {
    const mockSession = { info: { isLoggedIn: true, webId: 'https://example.com/profile#me' } }
    mockUseSolidPod.mockReturnValue({
      session: mockSession as any,
      isLoggedIn: true,
      webId: 'https://example.com/profile#me',
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })
    mockGetPrimaryPodUrl.mockResolvedValue(null)

    render(
      <DatabaseProvider>
        <div data-testid="child" />
      </DatabaseProvider>
    )

    await waitFor(() => screen.getByTestId('child'))
    // Should fall back to sanitized webId: 'https://example.com/profile#me' -> 'example.com_profile#me'
    expect(mockGetInstance).toHaveBeenCalled()
    const namespace = mockGetInstance.mock.calls[mockGetInstance.mock.calls.length - 1][0]
    expect(namespace).not.toBe('local')
    expect(namespace).toContain('example.com')
  })

  it('throws when useDatabase is called outside DatabaseProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<OutsideProvider />)).toThrow('useDatabase must be used within a DatabaseProvider')
  })
})
