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
  syncAllDataFromPod: vi.fn(),
}))

vi.mock('../services/rdfMigration', () => ({
  detectPodDataFormat: vi.fn(),
  migrateJsonToRdf: vi.fn(),
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
import { getPrimaryPodUrl, hasPodData, syncAllDataFromPod } from '../services/solidPod'
import { detectPodDataFormat, migrateJsonToRdf } from '../services/rdfMigration'
import { PackingAppDatabase } from '../services/database'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockHasPodData = vi.mocked(hasPodData)
const mockSyncAllDataFromPod = vi.mocked(syncAllDataFromPod)
const mockDetectPodDataFormat = vi.mocked(detectPodDataFormat)
const mockMigrateJsonToRdf = vi.mocked(migrateJsonToRdf)
const mockGetInstance = vi.mocked(PackingAppDatabase.getInstance)

/** Creates a mock db object with controllable isEmpty/copyAllDataFrom behaviour */
function makeDb(namespace: string, overrides: {
  isEmpty?: boolean
  copyAllDataFrom?: ReturnType<typeof vi.fn>
} = {}) {
  return {
    getInfo: vi.fn().mockResolvedValue({ db_name: `packing-app-data--${namespace}`, doc_count: 0 }),
    isEmpty: vi.fn().mockResolvedValue(overrides.isEmpty ?? false),
    copyAllDataFrom: overrides.copyAllDataFrom ?? vi.fn().mockResolvedValue(undefined),
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
    mockSyncAllDataFromPod.mockReset()
    mockSyncAllDataFromPod.mockResolvedValue({ questionSetSynced: false, packingListsSynced: 0, packingListsUploaded: 0 })
    mockDetectPodDataFormat.mockReset()
    mockDetectPodDataFormat.mockResolvedValue('rdf')
    mockMigrateJsonToRdf.mockReset()
    mockMigrateJsonToRdf.mockResolvedValue({ questionSetMigrated: false, packingListsMigrated: 0, errors: [] })
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

  describe('login sync', () => {
    const mockSession = { info: { isLoggedIn: true, webId: 'https://example.com/profile#me' } }

    beforeEach(() => {
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

    it('calls syncAllDataFromPod after pod namespace is established', async () => {
      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      expect(mockSyncAllDataFromPod).toHaveBeenCalledWith(
        mockSession,
        'https://example.com/',
        expect.anything()
      )
    })

    it('does not call syncAllDataFromPod when not logged in', async () => {
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
      expect(mockSyncAllDataFromPod).not.toHaveBeenCalled()
    })

    it('does not call syncAllDataFromPod when migration prompt is shown', async () => {
      mockHasPodData.mockResolvedValue(false)
      mockGetInstance.mockImplementation((ns: string) => makeDb(ns, { isEmpty: false }))

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByText(/you have local data/i))
      expect(mockSyncAllDataFromPod).not.toHaveBeenCalled()
    })

    it('does not crash when syncAllDataFromPod throws', async () => {
      mockSyncAllDataFromPod.mockRejectedValue(new Error('Network error'))

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      // Children still render despite sync error
      await waitFor(() => screen.getByTestId('child'))
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('RDF migration on login', () => {
    const mockSession = { info: { isLoggedIn: true, webId: 'https://example.com/profile#me' } }

    beforeEach(() => {
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

    it('calls detectPodDataFormat on login', async () => {
      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      await waitFor(() => expect(mockDetectPodDataFormat).toHaveBeenCalledWith(
        mockSession,
        'https://example.com/',
      ))
    })

    it('calls migrateJsonToRdf when format is json', async () => {
      mockDetectPodDataFormat.mockResolvedValue('json')

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      await waitFor(() => expect(mockMigrateJsonToRdf).toHaveBeenCalledWith(
        mockSession,
        'https://example.com/',
      ))
    })

    it('does not call migrateJsonToRdf when format is rdf', async () => {
      mockDetectPodDataFormat.mockResolvedValue('rdf')

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      await waitFor(() => expect(mockSyncAllDataFromPod).toHaveBeenCalled())
      expect(mockMigrateJsonToRdf).not.toHaveBeenCalled()
    })

    it('does not call migrateJsonToRdf when format is empty', async () => {
      mockDetectPodDataFormat.mockResolvedValue('empty')

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      await waitFor(() => expect(mockSyncAllDataFromPod).toHaveBeenCalled())
      expect(mockMigrateJsonToRdf).not.toHaveBeenCalled()
    })

    it('still calls syncAllDataFromPod even when migration throws', async () => {
      mockDetectPodDataFormat.mockResolvedValue('json')
      mockMigrateJsonToRdf.mockRejectedValue(new Error('migration failed'))

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      await waitFor(() => expect(mockSyncAllDataFromPod).toHaveBeenCalled())
      expect(console.error).toHaveBeenCalled()
    })

    it('calls syncAllDataFromPod after migration completes', async () => {
      mockDetectPodDataFormat.mockResolvedValue('json')
      const migrationOrder: string[] = []
      mockMigrateJsonToRdf.mockImplementation(async () => {
        migrationOrder.push('migrate')
        return { questionSetMigrated: true, packingListsMigrated: 0, errors: [] }
      })
      mockSyncAllDataFromPod.mockImplementation(async () => {
        migrationOrder.push('sync')
        return { questionSetSynced: false, packingListsSynced: 0, packingListsUploaded: 0 }
      })

      render(
        <DatabaseProvider>
          <div data-testid="child" />
        </DatabaseProvider>
      )

      await waitFor(() => screen.getByTestId('child'))
      await waitFor(() => expect(migrationOrder).toEqual(['migrate', 'sync']))
    })
  })
})
