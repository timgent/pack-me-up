import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePodSync } from './usePodSync'
import type { SolidDataset } from '@inrupt/solid-client'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../components/SolidPodContext', () => ({
  useSolidPod: vi.fn(),
}))

vi.mock('../services/solidPod', () => ({
  getPrimaryPodUrl: vi.fn(),
  loadRdfFromPod: vi.fn(),
  saveRdfToPod: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'AuthenticationError'
    }
  },
}))

import { useSolidPod } from '../components/SolidPodContext'
import { getPrimaryPodUrl, loadRdfFromPod, saveRdfToPod } from '../services/solidPod'
import type { Session } from '@inrupt/solid-client-authn-browser'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockLoadRdfFromPod = vi.mocked(loadRdfFromPod)
const mockSaveRdfToPod = vi.mocked(saveRdfToPod)

const mockSession = { info: { isLoggedIn: true } } as unknown as Session
const POD_URL = 'https://pod.example.com/'
const QUESTION_SET_DATA = { questions: [], people: [], alwaysNeededItems: [], lastModified: '2024-01-01T00:00:00.000Z' }

const mockDeserialize = vi.fn().mockReturnValue(QUESTION_SET_DATA)
const mockSerialize = vi.fn().mockReturnValue({} as SolidDataset)

const rdfOptions = {
  serialize: mockSerialize,
  deserialize: mockDeserialize,
}

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
  mockLoadRdfFromPod.mockResolvedValue(QUESTION_SET_DATA)
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
  filename: 'packing-list-questions.ttl',
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('usePodSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetPrimaryPodUrl.mockReset()
    mockLoadRdfFromPod.mockReset()
    mockSaveRdfToPod.mockReset()
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
          rdf: rdfOptions,
        })
      )

      // Let the async syncFromPod call resolve
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockLoadRdfFromPod).toHaveBeenCalledOnce()
      expect(onSyncSuccess).toHaveBeenCalledWith(QUESTION_SET_DATA)
    })

    it('calls loadRdfFromPod with the correct fileUrl and deserializer', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: true,
          enabled: true,
          rdf: rdfOptions,
        })
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockLoadRdfFromPod).toHaveBeenCalledWith(
        mockSession,
        `${POD_URL}pack-me-up/packing-list-questions.ttl`,
        mockDeserialize,
      )
    })

    it('does not set up a polling interval when syncOnMount is true and pollInterval is not set', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: true,
          enabled: true,
          rdf: rdfOptions,
        })
      )

      // Initial sync
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(mockLoadRdfFromPod).toHaveBeenCalledOnce()

      // Advance well past any hypothetical interval - should still be only one call
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })

      expect(mockLoadRdfFromPod).toHaveBeenCalledOnce()
    })

    it('does not sync when syncOnMount is false and pollInterval is not set', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: false,
          enabled: true,
          rdf: rdfOptions,
        })
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockLoadRdfFromPod).not.toHaveBeenCalled()
    })

    it('does not sync when not logged in even if syncOnMount is true', async () => {
      setupLoggedOut()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: true,
          enabled: true,
          rdf: rdfOptions,
        })
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockLoadRdfFromPod).not.toHaveBeenCalled()
    })

    it('does not sync when enabled is false even if syncOnMount is true', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          syncOnMount: true,
          enabled: false,
          rdf: rdfOptions,
        })
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockLoadRdfFromPod).not.toHaveBeenCalled()
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
          rdf: rdfOptions,
        })
      )

      // Initial sync on mount (run microtasks / promise callbacks)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(mockLoadRdfFromPod).toHaveBeenCalledOnce()

      // Advance exactly one poll interval
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(mockLoadRdfFromPod).toHaveBeenCalledTimes(2)
    })

    it('does not poll when enabled is false', async () => {
      setupLoggedIn()

      renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          pollInterval: 5000,
          enabled: false,
          rdf: rdfOptions,
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(10_000)
        await vi.runAllTimersAsync()
      })

      expect(mockLoadRdfFromPod).not.toHaveBeenCalled()
    })
  })

  describe('saveToPod', () => {
    it('calls saveRdfToPod with correct fileUrl, data, and serializer', async () => {
      setupLoggedIn()
      mockSaveRdfToPod.mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          enabled: true,
          rdf: rdfOptions,
        })
      )

      await act(async () => {
        await result.current.saveToPod(QUESTION_SET_DATA)
      })

      expect(mockSaveRdfToPod).toHaveBeenCalledWith({
        session: mockSession,
        fileUrl: `${POD_URL}pack-me-up/packing-list-questions.ttl`,
        data: QUESTION_SET_DATA,
        serializer: mockSerialize,
      })
    })

    it('calls saveRdfToPod with dynamic filename when resourceId is provided', async () => {
      setupLoggedIn()
      mockSaveRdfToPod.mockResolvedValue(undefined)

      const dynamicPathConfig = {
        container: 'pack-me-up/packing-lists/',
        filename: (id: string) => `${id}.ttl`,
        resourceId: 'list-abc',
      }

      const { result } = renderHook(() =>
        usePodSync({
          pathConfig: dynamicPathConfig,
          enabled: true,
          rdf: rdfOptions,
        })
      )

      await act(async () => {
        await result.current.saveToPod(QUESTION_SET_DATA)
      })

      expect(mockSaveRdfToPod).toHaveBeenCalledWith({
        session: mockSession,
        fileUrl: `${POD_URL}pack-me-up/packing-lists/list-abc.ttl`,
        data: QUESTION_SET_DATA,
        serializer: mockSerialize,
      })
    })

    it('returns true on success', async () => {
      setupLoggedIn()
      mockSaveRdfToPod.mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          enabled: true,
          rdf: rdfOptions,
        })
      )

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.saveToPod(QUESTION_SET_DATA)
      })

      expect(success).toBe(true)
    })

    it('returns false and sets error when save fails', async () => {
      setupLoggedIn()
      mockSaveRdfToPod.mockRejectedValue(new Error('network error'))
      const onSaveError = vi.fn()

      const { result } = renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          enabled: true,
          onSaveError,
          rdf: rdfOptions,
        })
      )

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.saveToPod(QUESTION_SET_DATA)
      })

      expect(success).toBe(false)
      expect(onSaveError).toHaveBeenCalledWith('network error')
    })

    it('does not save when not logged in', async () => {
      setupLoggedOut()

      const { result } = renderHook(() =>
        usePodSync({
          pathConfig: staticPathConfig,
          enabled: true,
          rdf: rdfOptions,
        })
      )

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.saveToPod(QUESTION_SET_DATA)
      })

      expect(success).toBe(false)
      expect(mockSaveRdfToPod).not.toHaveBeenCalled()
    })
  })
})
