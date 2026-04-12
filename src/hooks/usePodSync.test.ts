import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePodSync } from './usePodSync'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../components/SolidPodContext', () => ({
  useSolidPod: vi.fn(),
}))

vi.mock('../services/solidPod', () => ({
  getPrimaryPodUrl: vi.fn(),
  loadFileFromPod: vi.fn(),
  saveFileToPod: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'AuthenticationError'
    }
  },
}))

import { useSolidPod } from '../components/SolidPodContext'
import { getPrimaryPodUrl, loadFileFromPod } from '../services/solidPod'
import type { Session } from '@inrupt/solid-client-authn-browser'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockLoadFileFromPod = vi.mocked(loadFileFromPod)

const mockSession = { info: { isLoggedIn: true } } as unknown as Session
const POD_URL = 'https://pod.example.com/'
const QUESTION_SET_DATA = { questions: [], people: [], alwaysNeededItems: [], lastModified: '2024-01-01T00:00:00.000Z' }

function setupLoggedIn() {
  mockUseSolidPod.mockReturnValue({
    session: mockSession,
    isLoggedIn: true,
    webId: 'https://example.com/profile#me',
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
  mockGetPrimaryPodUrl.mockResolvedValue(POD_URL)
  mockLoadFileFromPod.mockResolvedValue(QUESTION_SET_DATA)
}

function setupLoggedOut() {
  mockUseSolidPod.mockReturnValue({
    session: null,
    isLoggedIn: false,
    webId: undefined,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

const staticPathConfig = {
  container: 'pack-me-up/',
  filename: 'packing-list-questions.json',
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('usePodSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetPrimaryPodUrl.mockReset()
    mockLoadFileFromPod.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('syncOnMount (without polling)', () => {
    it('syncs once on mount when syncOnMount is true and pollInterval is not set', async () => {
      setupLoggedIn()
      const onSyncSuccess = vi.fn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: true,
          enabled: true,
          onSyncSuccess,
        })
      )

      // Let the async syncFromPod call resolve
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockLoadFileFromPod).toHaveBeenCalledOnce()
      expect(onSyncSuccess).toHaveBeenCalledWith(QUESTION_SET_DATA)
    })

    it('does not set up a polling interval when syncOnMount is true and pollInterval is not set', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: true,
          enabled: true,
        })
      )

      // Initial sync
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(mockLoadFileFromPod).toHaveBeenCalledOnce()

      // Advance well past any hypothetical interval - should still be only one call
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })

      expect(mockLoadFileFromPod).toHaveBeenCalledOnce()
    })

    it('does not sync when syncOnMount is false and pollInterval is not set', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: false,
          enabled: true,
        })
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockLoadFileFromPod).not.toHaveBeenCalled()
    })

    it('does not sync when not logged in even if syncOnMount is true', async () => {
      setupLoggedOut()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: true,
          enabled: true,
        })
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockLoadFileFromPod).not.toHaveBeenCalled()
    })

    it('does not sync when enabled is false even if syncOnMount is true', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: true,
          enabled: false,
        })
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockLoadFileFromPod).not.toHaveBeenCalled()
    })
  })

  describe('polling (existing behaviour preserved)', () => {
    it('syncs on mount and polls at the given interval when pollInterval is set', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          pollInterval: 5000,
          enabled: true,
        })
      )

      // Initial sync on mount (run microtasks / promise callbacks)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(mockLoadFileFromPod).toHaveBeenCalledOnce()

      // Advance exactly one poll interval
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(mockLoadFileFromPod).toHaveBeenCalledTimes(2)
    })

    it('does not poll when enabled is false', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          pollInterval: 5000,
          enabled: false,
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(10_000)
        await vi.runAllTimersAsync()
      })

      expect(mockLoadFileFromPod).not.toHaveBeenCalled()
    })
  })
})
