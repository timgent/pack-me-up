import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PouchDB from 'pouchdb'
import PouchDBMemoryAdapter from 'pouchdb-adapter-memory'
import type { Session } from '@inrupt/solid-client-authn-browser'
import type { SolidDataset, WithServerResourceInfo } from '@inrupt/solid-client'
import { PackingAppDatabase } from './database'
import { AuthenticationError } from './solidPod'
import { createBackup, listBackups, deleteBackup, restoreBackup } from './solidPodBackup'
import type { PackingListQuestionSet } from '../edit-questions/types'
import type { PackingList } from '../create-packing-list/types'

// Setup PouchDB with memory adapter for testing
PouchDB.plugin(PouchDBMemoryAdapter)

vi.mock('@inrupt/solid-client', () => ({
    getFile: vi.fn(),
    getSolidDataset: vi.fn(),
    getContainedResourceUrlAll: vi.fn(),
    getPodUrlAll: vi.fn(),
    saveFileInContainer: vi.fn(),
    overwriteFile: vi.fn(),
    deleteFile: vi.fn(),
}))

// Mock solidPod service functions
vi.mock('./solidPod', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./solidPod')>()
    return {
        ...actual,
        saveFileToPod: vi.fn(),
        loadFileFromPod: vi.fn(),
        saveMultipleFilesToPod: vi.fn(),
    }
})

import { getSolidDataset, getContainedResourceUrlAll, deleteFile } from '@inrupt/solid-client'
import { saveFileToPod, loadFileFromPod, saveMultipleFilesToPod } from './solidPod'

const mockGetSolidDataset = vi.mocked(getSolidDataset)
const mockGetContainedResourceUrlAll = vi.mocked(getContainedResourceUrlAll)
const mockDeleteFile = vi.mocked(deleteFile)
const mockSaveFileToPod = vi.mocked(saveFileToPod)
const mockLoadFileFromPod = vi.mocked(loadFileFromPod)
const mockSaveMultipleFilesToPod = vi.mocked(saveMultipleFilesToPod)

const mockSession = {
    info: { isLoggedIn: true, webId: 'https://example.com/profile#me' },
    fetch: vi.fn(),
} as unknown as Session

const POD_URL = 'https://pod.example.com/'

const mockQuestionSet: PackingListQuestionSet = {
    _id: '1',
    people: [{ id: 'person-1', name: 'Alice' }],
    alwaysNeededItems: [],
    questions: []
}

const mockPackingList: PackingList = {
    id: 'pl-1',
    name: 'Beach Trip',
    createdAt: '2025-01-01T00:00:00.000Z',
    items: []
}

async function clearAllInstances() {
    // @ts-expect-error - Accessing private static property for testing
    const instances = PackingAppDatabase.instances as Map<string, PackingAppDatabase>
    for (const instance of instances.values()) {
        // @ts-expect-error - Accessing private property for testing
        await instance.db.destroy()
    }
    instances.clear()
}

describe('createBackup', () => {
    let db: PackingAppDatabase

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.clearAllMocks()
        await clearAllInstances()
        db = PackingAppDatabase.getInstance('backup-test')
    })

    afterEach(async () => {
        vi.restoreAllMocks()
    })

    it('calls saveFileToPod with correct container path and filename format', async () => {
        await db.saveQuestionSet(mockQuestionSet)
        await db.savePackingList(mockPackingList)
        mockSaveFileToPod.mockResolvedValue(undefined)

        const before = Date.now()
        await createBackup(mockSession, POD_URL, db)
        const after = Date.now()

        expect(mockSaveFileToPod).toHaveBeenCalledOnce()
        const call = mockSaveFileToPod.mock.calls[0][0]
        expect(call.session).toBe(mockSession)
        expect(call.containerPath).toBe(`${POD_URL}pack-me-up/backups/`)
        expect(call.filename).toMatch(/^backup-\d+\.json$/)

        // Verify timestamp is within test window
        const timestampMatch = call.filename.match(/backup-(\d+)\.json/)
        expect(timestampMatch).not.toBeNull()
        const ts = parseInt(timestampMatch![1], 10)
        expect(ts).toBeGreaterThanOrEqual(before)
        expect(ts).toBeLessThanOrEqual(after)
    })

    it('saves backup data with correct shape', async () => {
        await db.saveQuestionSet(mockQuestionSet)
        await db.savePackingList(mockPackingList)
        mockSaveFileToPod.mockResolvedValue(undefined)

        await createBackup(mockSession, POD_URL, db)

        const savedData = mockSaveFileToPod.mock.calls[0][0].data
        expect(savedData.version).toBe(1)
        expect(savedData.createdAt).toBeDefined()
        expect(new Date(savedData.createdAt).toISOString()).toBe(savedData.createdAt)
        expect(savedData.questionSet).toMatchObject({
            people: mockQuestionSet.people,
            alwaysNeededItems: mockQuestionSet.alwaysNeededItems,
            questions: mockQuestionSet.questions,
        })
        expect(savedData.packingLists).toHaveLength(1)
        expect(savedData.packingLists[0].id).toBe('pl-1')
    })

    it('returns correct BackupMetadata', async () => {
        await db.saveQuestionSet(mockQuestionSet)
        await db.savePackingList(mockPackingList)
        mockSaveFileToPod.mockResolvedValue(undefined)

        const metadata = await createBackup(mockSession, POD_URL, db)

        expect(metadata.url).toMatch(new RegExp(`^${POD_URL}pack-me-up/backups/backup-\\d+\\.json$`))
        expect(metadata.filename).toMatch(/^backup-\d+\.json$/)
        expect(metadata.packingListCount).toBe(1)
        expect(metadata.hasQuestionSet).toBe(true)
        expect(metadata.createdAt).toBeDefined()
    })

    it('handles missing question set gracefully', async () => {
        await db.savePackingList(mockPackingList)
        mockSaveFileToPod.mockResolvedValue(undefined)

        const metadata = await createBackup(mockSession, POD_URL, db)

        const savedData = mockSaveFileToPod.mock.calls[0][0].data
        expect(savedData.questionSet).toBeNull()
        expect(metadata.hasQuestionSet).toBe(false)
    })
})

describe('listBackups', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns BackupMetadata array sorted newest first', async () => {
        const backupUrl1 = `${POD_URL}pack-me-up/backups/backup-1000.json`
        const backupUrl2 = `${POD_URL}pack-me-up/backups/backup-2000.json`

        const mockDataset = {}
        mockGetSolidDataset.mockResolvedValue(mockDataset as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValue([backupUrl1, backupUrl2])

        const backupFile1 = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: mockQuestionSet,
            packingLists: [mockPackingList]
        }
        const backupFile2 = {
            version: 1 as const,
            createdAt: '2025-01-02T00:00:00.000Z',
            questionSet: null,
            packingLists: []
        }

        mockLoadFileFromPod
            .mockResolvedValueOnce(backupFile1)
            .mockResolvedValueOnce(backupFile2)

        const results = await listBackups(mockSession, POD_URL)

        expect(results).toHaveLength(2)
        // Newest first
        expect(results[0].createdAt).toBe('2025-01-02T00:00:00.000Z')
        expect(results[1].createdAt).toBe('2025-01-01T00:00:00.000Z')
    })

    it('returns correct metadata for each backup', async () => {
        const backupUrl = `${POD_URL}pack-me-up/backups/backup-1000.json`

        const mockDataset = {}
        mockGetSolidDataset.mockResolvedValue(mockDataset as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValue([backupUrl])

        const backupFile = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: mockQuestionSet,
            packingLists: [mockPackingList, { ...mockPackingList, id: 'pl-2' }]
        }

        mockLoadFileFromPod.mockResolvedValue(backupFile)

        const results = await listBackups(mockSession, POD_URL)

        expect(results[0].url).toBe(backupUrl)
        expect(results[0].filename).toBe('backup-1000.json')
        expect(results[0].createdAt).toBe('2025-01-01T00:00:00.000Z')
        expect(results[0].packingListCount).toBe(2)
        expect(results[0].hasQuestionSet).toBe(true)
    })

    it('returns [] when container returns 404', async () => {
        mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })

        const results = await listBackups(mockSession, POD_URL)

        expect(results).toEqual([])
    })

    it('propagates AuthenticationError on 401', async () => {
        mockGetSolidDataset.mockRejectedValue({ statusCode: 401 })

        await expect(listBackups(mockSession, POD_URL)).rejects.toThrow(AuthenticationError)
    })

    it('calls getSolidDataset with correct backups container URL', async () => {
        mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })

        await listBackups(mockSession, POD_URL)

        expect(mockGetSolidDataset).toHaveBeenCalledWith(
            `${POD_URL}pack-me-up/backups/`,
            expect.objectContaining({ fetch: mockSession.fetch })
        )
    })

    it('ignores non-json files', async () => {
        const backupUrl = `${POD_URL}pack-me-up/backups/backup-1000.json`
        const otherUrl = `${POD_URL}pack-me-up/backups/`

        const mockDataset = {}
        mockGetSolidDataset.mockResolvedValue(mockDataset as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValue([backupUrl, otherUrl])

        const backupFile = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: null,
            packingLists: []
        }

        mockLoadFileFromPod.mockResolvedValue(backupFile)

        const results = await listBackups(mockSession, POD_URL)

        expect(results).toHaveLength(1)
        expect(mockLoadFileFromPod).toHaveBeenCalledOnce()
    })
})

describe('deleteBackup', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('calls deleteFile with the correct URL', async () => {
        const backupUrl = `${POD_URL}pack-me-up/backups/backup-1000.json`
        mockDeleteFile.mockResolvedValue(undefined)

        await deleteBackup(mockSession, backupUrl)

        expect(mockDeleteFile).toHaveBeenCalledWith(
            backupUrl,
            expect.objectContaining({ fetch: mockSession.fetch })
        )
    })
})

describe('restoreBackup', () => {
    let db: PackingAppDatabase
    const backupUrl = `${POD_URL}pack-me-up/backups/backup-1000.json`

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.clearAllMocks()
        await clearAllInstances()
        db = PackingAppDatabase.getInstance('restore-test')
    })

    afterEach(async () => {
        vi.restoreAllMocks()
    })

    it('clears existing packing lists before restoring', async () => {
        // Seed existing data
        await db.savePackingList({ ...mockPackingList, id: 'old-list' })

        const backupFile = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: null,
            packingLists: [{ ...mockPackingList, id: 'new-list' }]
        }
        mockLoadFileFromPod.mockResolvedValue(backupFile)
        mockSaveFileToPod.mockResolvedValue(undefined)
        mockSaveMultipleFilesToPod.mockResolvedValue({ success: true, successCount: 1, failCount: 0, totalCount: 1 })

        await restoreBackup(mockSession, POD_URL, db, backupUrl)

        const lists = await db.getAllPackingLists()
        expect(lists.map(l => l.id)).not.toContain('old-list')
        expect(lists.map(l => l.id)).toContain('new-list')
    })

    it('saves restored packing lists to local DB', async () => {
        const backupFile = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: null,
            packingLists: [mockPackingList, { ...mockPackingList, id: 'pl-2', name: 'Mountain Trip' }]
        }
        mockLoadFileFromPod.mockResolvedValue(backupFile)
        mockSaveFileToPod.mockResolvedValue(undefined)
        mockSaveMultipleFilesToPod.mockResolvedValue({ success: true, successCount: 2, failCount: 0, totalCount: 2 })

        await restoreBackup(mockSession, POD_URL, db, backupUrl)

        const lists = await db.getAllPackingLists()
        expect(lists).toHaveLength(2)
        expect(lists.map(l => l.id)).toContain('pl-1')
        expect(lists.map(l => l.id)).toContain('pl-2')
    })

    it('saves restored question set to local DB', async () => {
        const backupFile = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: mockQuestionSet,
            packingLists: []
        }
        mockLoadFileFromPod.mockResolvedValue(backupFile)
        mockSaveFileToPod.mockResolvedValue(undefined)
        mockSaveMultipleFilesToPod.mockResolvedValue({ success: true, successCount: 0, failCount: 0, totalCount: 0 })

        await restoreBackup(mockSession, POD_URL, db, backupUrl)

        const qs = await db.getQuestionSet()
        expect(qs.people).toEqual(mockQuestionSet.people)
    })

    it('calls saveFileToPod for question set when present', async () => {
        const backupFile = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: mockQuestionSet,
            packingLists: []
        }
        mockLoadFileFromPod.mockResolvedValue(backupFile)
        mockSaveFileToPod.mockResolvedValue(undefined)
        mockSaveMultipleFilesToPod.mockResolvedValue({ success: true, successCount: 0, failCount: 0, totalCount: 0 })

        await restoreBackup(mockSession, POD_URL, db, backupUrl)

        expect(mockSaveFileToPod).toHaveBeenCalledWith(
            expect.objectContaining({
                session: mockSession,
                containerPath: `${POD_URL}pack-me-up/`,
                filename: 'packing-list-questions.json',
            })
        )
    })

    it('calls saveMultipleFilesToPod for packing lists', async () => {
        const backupFile = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: null,
            packingLists: [mockPackingList]
        }
        mockLoadFileFromPod.mockResolvedValue(backupFile)
        mockSaveFileToPod.mockResolvedValue(undefined)
        mockSaveMultipleFilesToPod.mockResolvedValue({ success: true, successCount: 1, failCount: 0, totalCount: 1 })

        await restoreBackup(mockSession, POD_URL, db, backupUrl)

        expect(mockSaveMultipleFilesToPod).toHaveBeenCalledWith(
            mockSession,
            `${POD_URL}pack-me-up/packing-lists/`,
            expect.arrayContaining([expect.objectContaining({ id: 'pl-1' })])
        )
    })

    it('does not call saveFileToPod for question set when not present', async () => {
        const backupFile = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: null,
            packingLists: []
        }
        mockLoadFileFromPod.mockResolvedValue(backupFile)
        mockSaveFileToPod.mockResolvedValue(undefined)
        mockSaveMultipleFilesToPod.mockResolvedValue({ success: true, successCount: 0, failCount: 0, totalCount: 0 })

        await restoreBackup(mockSession, POD_URL, db, backupUrl)

        expect(mockSaveFileToPod).not.toHaveBeenCalled()
    })

    it('handles missing question set in DB gracefully (not_found)', async () => {
        // DB has no question set, backup has one
        const backupFile = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            questionSet: mockQuestionSet,
            packingLists: []
        }
        mockLoadFileFromPod.mockResolvedValue(backupFile)
        mockSaveFileToPod.mockResolvedValue(undefined)
        mockSaveMultipleFilesToPod.mockResolvedValue({ success: true, successCount: 0, failCount: 0, totalCount: 0 })

        // Should not throw even if question set doesn't exist in DB before restore
        await expect(restoreBackup(mockSession, POD_URL, db, backupUrl)).resolves.not.toThrow()
    })
})
