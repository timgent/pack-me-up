import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSyncCoordinator, TimestampedData } from './useSyncCoordinator'

interface TestData extends TimestampedData {
  id: string
  value: string
}

const makeTestData = (overrides: Partial<TestData> = {}): TestData => ({
  id: 'test-1',
  value: 'hello',
  ...overrides,
})

const makeOptions = (overrides: Partial<Parameters<typeof useSyncCoordinator<TestData>>[0]> = {}) => ({
  currentData: null as TestData | null,
  saveToLocalDb: vi.fn().mockResolvedValue({ rev: 'rev-1' }),
  updateFormAndState: vi.fn(),
  ...overrides,
})

describe('useSyncCoordinator', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // ─────────────────────────────────────────────────────────────────
  // Option 3: Monotonic timestamp generation (HLC)
  // ─────────────────────────────────────────────────────────────────

  describe('monotonic timestamp generation', () => {
    it('generates strictly increasing timestamps when system time does not advance between saves', async () => {
      vi.useFakeTimers()
      const FIXED_TIME = 1700000000000
      vi.setSystemTime(FIXED_TIME) // freezes both Date.now() and new Date()

      const options = makeOptions()
      const { result } = renderHook(() => useSyncCoordinator<TestData>(options))

      const saveToPod = vi.fn().mockResolvedValue(true)
      let result1: TestData | null = null
      let result2: TestData | null = null

      await act(async () => {
        result1 = await result.current.saveWithSyncPrevention(makeTestData(), saveToPod)
      })
      await act(async () => {
        result2 = await result.current.saveWithSyncPrevention(makeTestData(), saveToPod)
      })

      expect(result1?.lastModified).toBeDefined()
      expect(result2?.lastModified).toBeDefined()
      // Second save must produce a strictly later timestamp even though system time is frozen
      expect(result2!.lastModified! > result1!.lastModified!).toBe(true)
    })

    it('advances past a Pod timestamp in the future (clock-skew scenario)', async () => {
      vi.useFakeTimers()
      const LOCAL_TIME = 1700000000000
      const POD_TIME = LOCAL_TIME + 5000 // Pod clock is 5s ahead of local clock
      vi.setSystemTime(LOCAL_TIME)

      const saveToLocalDb = vi.fn().mockResolvedValue({ rev: 'rev-1' })
      const updateFormAndState = vi.fn()
      const options = makeOptions({ currentData: null, saveToLocalDb, updateFormAndState, conflictStrategy: 'fallback-to-pod' })
      const { result } = renderHook(() => useSyncCoordinator<TestData>(options))

      // Receive future Pod data — should advance maxSeenTimestamp
      const podData = makeTestData({ lastModified: new Date(POD_TIME).toISOString() })
      await act(async () => {
        await result.current.handleSyncSuccess(podData)
      })

      // Now save locally — system clock still reads LOCAL_TIME
      const saveToPod = vi.fn().mockResolvedValue(true)
      let savedData: TestData | null = null
      await act(async () => {
        savedData = await result.current.saveWithSyncPrevention(makeTestData(), saveToPod)
      })

      expect(savedData?.lastModified).toBeDefined()
      const savedMs = new Date(savedData!.lastModified!).getTime()
      // Must be strictly greater than the Pod's future timestamp
      expect(savedMs).toBeGreaterThan(POD_TIME)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Option 4: Robust sync-loop prevention
  // ─────────────────────────────────────────────────────────────────

  describe('sync-loop prevention', () => {
    it('skips handleSyncSuccess during the gap between save start and isLocalChangeRef being set', async () => {
      // Bug: isLocalChangeRef is only set AFTER saveToLocalDb resolves.
      // Between the start of a save and that point, handleSyncSuccess is unguarded.
      // Fix: set saveInProgressRef=true at the very start of saveWithSyncPrevention.

      // 1st call (from saveWithSyncPrevention): never resolves — simulates slow local DB write
      // 2nd call (from handleSyncSuccess, if not blocked): resolves immediately
      let resolveLocalDb!: (v: { rev: string }) => void
      const saveToLocalDb = vi.fn()
        .mockReturnValueOnce(
          new Promise<{ rev: string }>(resolve => { resolveLocalDb = resolve })
        )
        .mockResolvedValue({ rev: 'rev-1' })

      const updateFormAndState = vi.fn()
      const saveToPod = vi.fn().mockResolvedValue(true)
      const currentData = makeTestData({ lastModified: new Date(1000).toISOString() })
      const options = makeOptions({ currentData, saveToLocalDb, updateFormAndState, conflictStrategy: 'fallback-to-pod' })

      const { result } = renderHook(() => useSyncCoordinator<TestData>(options))

      // Start save — saveToLocalDb (1st call) has NOT resolved yet (isLocalChangeRef not yet set)
      act(() => {
        result.current.saveWithSyncPrevention(makeTestData(), saveToPod)
      })

      // Immediately try to apply newer Pod data while saveToLocalDb is still in-flight
      const newerPodData = makeTestData({ lastModified: new Date(9999999999999).toISOString() })
      await act(async () => {
        await result.current.handleSyncSuccess(newerPodData)
      })

      // Must be skipped — save is in-progress (even though isLocalChangeRef not yet set)
      expect(updateFormAndState).not.toHaveBeenCalled()

      // Cleanup: resolve the pending local DB save to avoid dangling promise warnings
      resolveLocalDb({ rev: 'rev-1' })
    })

    it('skips Pod echo even after syncPreventionWindow has elapsed', async () => {
      // Bug: isLocalChangeRef is reset by a 2-second timer. If the echo arrives
      // after 2s, the echo slips through. Fix: track lastSavedTimestamp and detect
      // echo by timestamp match, independent of timers.
      vi.useFakeTimers()

      const saveToPod = vi.fn().mockResolvedValue(true)
      const saveToLocalDb = vi.fn().mockResolvedValue({ rev: 'rev-1' })
      const updateFormAndState = vi.fn()
      const options = makeOptions({ currentData: null, saveToLocalDb, updateFormAndState, conflictStrategy: 'fallback-to-pod' })

      const { result } = renderHook(() => useSyncCoordinator<TestData>(options))

      // Save locally (fast)
      let savedData: TestData | null = null
      await act(async () => {
        savedData = await result.current.saveWithSyncPrevention(makeTestData(), saveToPod)
      })
      expect(savedData?.lastModified).toBeDefined()

      // Advance past the syncPreventionWindow (default 2s)
      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      // Pod echoes back the exact data we saved
      await act(async () => {
        await result.current.handleSyncSuccess(savedData!)
      })

      // Must be skipped — it is our own echo, regardless of elapsed time
      expect(updateFormAndState).not.toHaveBeenCalled()
    })

    it('applies Pod data when timestamp differs from last save (genuine remote change)', async () => {
      const LOCAL_TIME = 1700000000000
      const REMOTE_TIME = LOCAL_TIME + 10000

      const saveToLocalDb = vi.fn().mockResolvedValue({ rev: 'rev-1' })
      const updateFormAndState = vi.fn()
      const currentData = makeTestData({ lastModified: new Date(LOCAL_TIME).toISOString() })
      const options = makeOptions({ currentData, saveToLocalDb, updateFormAndState, conflictStrategy: 'fallback-to-pod' })

      const { result } = renderHook(() => useSyncCoordinator<TestData>(options))

      const remoteData = makeTestData({
        value: 'changed on another device',
        lastModified: new Date(REMOTE_TIME).toISOString(),
      })

      await act(async () => {
        await result.current.handleSyncSuccess(remoteData)
      })

      expect(updateFormAndState).toHaveBeenCalledOnce()
    })
  })
})
