import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'
import type { Session } from '@inrupt/solid-client-authn-browser'
import { DatabaseProvider, useDatabase } from './DatabaseContext'

// --- Mocks ---

vi.mock('./SolidPodContext', () => ({
  useSolidPod: vi.fn(),
}))

vi.mock('../services/solidPod', () => ({
  getPrimaryPodUrl: vi.fn(),
  hasPodData: vi.fn(),
  saveFileToPod: vi.fn(),
  deleteFileFromPod: vi.fn(),
  POD_CONTAINERS: {
    ROOT: 'pack-me-up/',
    QUESTIONS: 'pack-me-up/packing-list-questions.json',
    PACKING_LISTS: 'pack-me-up/packing-lists/',
    BACKUPS: 'pack-me-up/backups/',
  },
}))

// Mock PackingAppDatabase so tests don't create real filesystem databases
vi.mock('../services/database', () => {
  return {
    LOCAL_NAMESPACE: 'local',
    PackingAppDatabase: {
      getInstance: vi.fn(),
      sanitizePodUrl: vi.fn((url: string) =>
        url.replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\//g, '_')
      ),
    },
  }
})

import { useSolidPod } from './SolidPodContext'
import { getPrimaryPodUrl, hasPodData, saveFileToPod, deleteFileFromPod } from '../services/solidPod'
import { PackingAppDatabase } from '../services/database'
import type { PackingList } from '../create-packing-list/types'
import type { PackingListQuestionSet } from '../edit-questions/types'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockHasPodData = vi.mocked(hasPodData)
const mockGetInstance = vi.mocked(PackingAppDatabase.getInstance)
const mockSaveFileToPod = vi.mocked(saveFileToPod)
const mockDeleteFileFromPod = vi.mocked(deleteFileFromPod)

/** Creates a mock db object with controllable method behaviour */
function makeDb(namespace: string, overrides: {
  isEmpty?: boolean
  copyAllDataFrom?: ReturnType<typeof vi.fn>
  savePackingList?: ReturnType<typeof vi.fn>
  getPackingList?: ReturnType<typeof vi.fn>
  getAllPackingLists?: ReturnType<typeof vi.fn>
  deletePackingList?: ReturnType<typeof vi.fn>
  saveQuestionSet?: ReturnType<typeof vi.fn>
  getQuestionSet?: ReturnType<typeof vi.fn>
} = {}) {
  return {
    getInfo: vi.fn().mockResolvedValue({ db_name: `packing-app-data--${namespace}`, doc_count: 0 }),
    isEmpty: vi.fn().mockResolvedValue(overrides.isEmpty ?? false),
    copyAllDataFrom: overrides.copyAllDataFrom ?? vi.fn().mockResolvedValue(undefined),
    savePackingList: overrides.savePackingList ?? vi.fn().mockResolvedValue({ rev: 'rev-1' }),
    getPackingList: overrides.getPackingList ?? vi.fn().mockResolvedValue({ id: 'list-1', name: 'Test List', createdAt: '2024-01-01', items: [] }),
    getAllPackingLists: overrides.getAllPackingLists ?? vi.fn().mockResolvedValue([]),
    deletePackingList: overrides.deletePackingList ?? vi.fn().mockResolvedValue(undefined),
    saveQuestionSet: overrides.saveQuestionSet ?? vi.fn().mockResolvedValue({ rev: 'rev-1' }),
    getQuestionSet: overrides.getQuestionSet ?? vi.fn().mockResolvedValue({ people: [], questions: [], alwaysNeededItems: [] }),
  }
}

/** Default instance factory: local db is non-empty by default (avoids migration prompt) */
function defaultInstanceFactory(namespace: string) {
  return makeDb(namespace)
}

function NamespaceDisplay() {
  const { db } = useDatabase()
  return <div data-testid="db-name">{(db as unknown as { getInfo?: unknown }).getInfo ? 'has-db' : 'no-db'}</div>
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
    // Reset to the default factory so each test starts with a clean slate
    mockGetInstance.mockReset()
    mockGetInstance.mockImplementation(defaultInstanceFactory)
    mockGetPrimaryPodUrl.mockReset()
    mockHasPodData.mockReset()
    // Default: pod has data → no migration prompt
    mockHasPodData.mockResolvedValue(true)
    mockSaveFileToPod.mockReset()
    mockSaveFileToPod.mockResolvedValue(undefined)
    mockDeleteFileFromPod.mockReset()
    mockDeleteFileFromPod.mockResolvedValue(undefined)
    localStorage.clear()
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
      session: mockSession as unknown as Session,
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
      session: mockSession as unknown as Session,
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
    const namespaceCalls = mockGetInstance.mock.calls.map(([ns]) => ns)
    const podNamespaceCall = namespaceCalls.find(ns => ns !== 'local')
    expect(podNamespaceCall).toBeDefined()
    expect(podNamespaceCall).toContain('example.com')
  })

  it('throws when useDatabase is called outside DatabaseProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<OutsideProvider />)).toThrow('useDatabase must be used within a DatabaseProvider')
  })

  describe('first-time pod login migration', () => {
    beforeEach(() => {
      const mockSession = { info: { isLoggedIn: true, webId: 'https://example.com/profile#me' } }
      mockUseSolidPod.mockReturnValue({
        session: mockSession as unknown as Session,
        isLoggedIn: true,
        webId: 'https://example.com/profile#me',
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      })
      mockGetPrimaryPodUrl.mockResolvedValue('https://example.com/')
    })

    it('shows migration dialog when pod has no remote data and local has data', async () => {
      mockHasPodData.mockResolvedValue(false)
      // local db: isEmpty=false (has data)
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { isEmpty: false }))

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByText(/you have local data/i))
      expect(screen.queryByTestId('child')).toBeNull()
    })

    it('does not show migration dialog when pod already has remote data', async () => {
      mockHasPodData.mockResolvedValue(true)
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { isEmpty: false }))

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      expect(screen.queryByText(/you have local data/i)).toBeNull()
    })

    it('does not show migration dialog when local db is empty', async () => {
      mockHasPodData.mockResolvedValue(false)
      // local db: isEmpty=true
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { isEmpty: true }))

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      expect(screen.queryByText(/you have local data/i)).toBeNull()
    })

    it('does not show migration dialog when localStorage dismissed key is set', async () => {
      localStorage.setItem('pod-migration-dismissed-example.com', 'true')
      mockHasPodData.mockResolvedValue(false)
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { isEmpty: false }))

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      expect(screen.queryByText(/you have local data/i)).toBeNull()
    })

    it('copies data to pod and renders children when user clicks "Use my local data"', async () => {
      mockHasPodData.mockResolvedValue(false)
      const copyAllDataFrom = vi.fn().mockResolvedValue(undefined)
      mockGetInstance.mockImplementation((ns: string) =>
        makeDb(ns, { isEmpty: false, copyAllDataFrom })
      )

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByText('Use my local data'))
      fireEvent.click(screen.getByText('Use my local data'))
      await waitFor(() => screen.getByTestId('child'))
      expect(copyAllDataFrom).toHaveBeenCalledOnce()
    })

    it('skips migration and renders children when user clicks "Start fresh"', async () => {
      mockHasPodData.mockResolvedValue(false)
      const copyAllDataFrom = vi.fn()
      mockGetInstance.mockImplementation((ns: string) =>
        makeDb(ns, { isEmpty: false, copyAllDataFrom })
      )

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByText('Start fresh'))
      fireEvent.click(screen.getByText('Start fresh'))
      await waitFor(() => screen.getByTestId('child'))
      expect(copyAllDataFrom).not.toHaveBeenCalled()
    })

    it('sets localStorage dismissed key when user clicks "Start fresh"', async () => {
      mockHasPodData.mockResolvedValue(false)
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { isEmpty: false }))

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByText('Start fresh'))
      fireEvent.click(screen.getByText('Start fresh'))
      expect(localStorage.getItem('pod-migration-dismissed-example.com')).toBe('true')
    })
  })

  describe('unified data methods', () => {
    let capturedCtx: ReturnType<typeof useDatabase> | undefined

    function ContextCapture() {
      capturedCtx = useDatabase()
      return null
    }

    beforeEach(() => {
      capturedCtx = undefined
    })

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

    function setupLoggedIn() {
      const mockSession = { fetch: vi.fn(), info: { isLoggedIn: true, webId: 'https://example.com/profile#me' } }
      mockUseSolidPod.mockReturnValue({
        session: mockSession as unknown as Session,
        isLoggedIn: true,
        webId: 'https://example.com/profile#me',
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      })
      mockGetPrimaryPodUrl.mockResolvedValue('https://example.com/')
      return mockSession
    }

    it('savePackingList saves to PouchDB regardless of login state', async () => {
      setupLoggedOut()
      const mockDbSave = vi.fn().mockResolvedValue({ rev: 'rev-1' })
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { savePackingList: mockDbSave }))

      render(<DatabaseProvider><ContextCapture /></DatabaseProvider>)
      await waitFor(() => expect(capturedCtx).toBeDefined())

      const testList: PackingList = { id: 'list-1', name: 'Test', createdAt: '2024-01-01', items: [] }
      await capturedCtx!.savePackingList(testList)

      expect(mockDbSave).toHaveBeenCalledWith(testList)
    })

    it('savePackingList also calls saveFileToPod when a session is present', async () => {
      setupLoggedIn()
      const mockDbSave = vi.fn().mockResolvedValue({ rev: 'rev-1' })
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { savePackingList: mockDbSave }))

      render(<DatabaseProvider><ContextCapture /></DatabaseProvider>)
      await waitFor(() => expect(capturedCtx).toBeDefined())

      const testList: PackingList = { id: 'list-1', name: 'Test', createdAt: '2024-01-01', items: [] }
      await capturedCtx!.savePackingList(testList)

      expect(mockDbSave).toHaveBeenCalledWith(testList)
      expect(mockSaveFileToPod).toHaveBeenCalledWith(expect.objectContaining({
        filename: 'list-1.json',
        data: testList,
      }))
    })

    it('savePackingList does not call saveFileToPod when session is null', async () => {
      setupLoggedOut()
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns))

      render(<DatabaseProvider><ContextCapture /></DatabaseProvider>)
      await waitFor(() => expect(capturedCtx).toBeDefined())

      const testList: PackingList = { id: 'list-1', name: 'Test', createdAt: '2024-01-01', items: [] }
      await capturedCtx!.savePackingList(testList)

      expect(mockSaveFileToPod).not.toHaveBeenCalled()
    })

    it('loadPackingList returns the list from PouchDB', async () => {
      setupLoggedOut()
      const testList: PackingList = { id: 'list-1', name: 'Test', createdAt: '2024-01-01', items: [] }
      const mockDbGet = vi.fn().mockResolvedValue(testList)
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { getPackingList: mockDbGet }))

      render(<DatabaseProvider><ContextCapture /></DatabaseProvider>)
      await waitFor(() => expect(capturedCtx).toBeDefined())

      const result = await capturedCtx!.loadPackingList('list-1')

      expect(mockDbGet).toHaveBeenCalledWith('list-1')
      expect(result).toEqual(testList)
    })

    it('listPackingLists returns all lists from PouchDB', async () => {
      setupLoggedOut()
      const testLists: PackingList[] = [
        { id: 'list-1', name: 'Test 1', createdAt: '2024-01-01', items: [] },
        { id: 'list-2', name: 'Test 2', createdAt: '2024-01-02', items: [] },
      ]
      const mockDbGetAll = vi.fn().mockResolvedValue(testLists)
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { getAllPackingLists: mockDbGetAll }))

      render(<DatabaseProvider><ContextCapture /></DatabaseProvider>)
      await waitFor(() => expect(capturedCtx).toBeDefined())

      const result = await capturedCtx!.listPackingLists()

      expect(mockDbGetAll).toHaveBeenCalled()
      expect(result).toEqual(testLists)
    })

    it('deletePackingList removes from PouchDB and calls pod delete when logged in', async () => {
      setupLoggedIn()
      const mockDbDelete = vi.fn().mockResolvedValue(undefined)
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { deletePackingList: mockDbDelete }))

      render(<DatabaseProvider><ContextCapture /></DatabaseProvider>)
      await waitFor(() => expect(capturedCtx).toBeDefined())

      await capturedCtx!.deletePackingList('list-1')

      expect(mockDbDelete).toHaveBeenCalledWith('list-1')
      expect(mockDeleteFileFromPod).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('list-1.json'),
      )
    })

    it('saveQuestionSet persists to PouchDB and to Pod when logged in', async () => {
      setupLoggedIn()
      const mockDbSaveQs = vi.fn().mockResolvedValue({ rev: 'rev-1' })
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { saveQuestionSet: mockDbSaveQs }))

      render(<DatabaseProvider><ContextCapture /></DatabaseProvider>)
      await waitFor(() => expect(capturedCtx).toBeDefined())

      const testQs: PackingListQuestionSet = { people: [], questions: [], alwaysNeededItems: [] }
      await capturedCtx!.saveQuestionSet(testQs)

      expect(mockDbSaveQs).toHaveBeenCalledWith(testQs)
      expect(mockSaveFileToPod).toHaveBeenCalledWith(expect.objectContaining({
        filename: 'packing-list-questions.json',
        data: testQs,
      }))
    })

    it('loadQuestionSet returns the question set from PouchDB', async () => {
      setupLoggedOut()
      const testQs: PackingListQuestionSet = { people: [], questions: [], alwaysNeededItems: [] }
      const mockDbGetQs = vi.fn().mockResolvedValue(testQs)
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { getQuestionSet: mockDbGetQs }))

      render(<DatabaseProvider><ContextCapture /></DatabaseProvider>)
      await waitFor(() => expect(capturedCtx).toBeDefined())

      const result = await capturedCtx!.loadQuestionSet()

      expect(mockDbGetQs).toHaveBeenCalled()
      expect(result).toEqual(testQs)
    })
  })
})
