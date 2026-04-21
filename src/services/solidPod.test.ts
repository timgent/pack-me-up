import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Session } from '@inrupt/solid-client-authn-browser'
import type { SolidDataset, WithServerResourceInfo } from '@inrupt/solid-client'
import {
    hasPodData,
    syncAllDataFromPod,
    loadRdfFromPod,
    saveRdfToPod,
    loadMultipleRdfFromPod,
    saveMultipleRdfToPod,
    POD_CONTAINERS,
} from './solidPod'
import { AuthenticationError } from './solidPod'
import type { PackingAppDatabase } from './database'
import type { PackingListQuestionSet } from '../edit-questions/types'
import type { PackingList } from '../create-packing-list/types'
import { packingListToDataset, questionSetToDataset } from './rdfSerialization'

vi.mock('@inrupt/solid-client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inrupt/solid-client')>()
    return {
        ...actual,
        // These are mocked so tests can control pod I/O
        getFile: vi.fn(),
        getSolidDataset: vi.fn(),
        getContainedResourceUrlAll: vi.fn(),
        getPodUrlAll: vi.fn(),
        saveFileInContainer: vi.fn(),
        overwriteFile: vi.fn(),
        deleteFile: vi.fn(),
        saveSolidDatasetAt: vi.fn(),
    }
})

import { getFile, getSolidDataset, getContainedResourceUrlAll, saveFileInContainer, saveSolidDatasetAt } from '@inrupt/solid-client'

const mockGetFile = vi.mocked(getFile)
const mockGetSolidDataset = vi.mocked(getSolidDataset)
const mockGetContainedResourceUrlAll = vi.mocked(getContainedResourceUrlAll)
const mockSaveFileInContainer = vi.mocked(saveFileInContainer)
const mockSaveSolidDatasetAt = vi.mocked(saveSolidDatasetAt)

const mockSession = {
    info: { isLoggedIn: true, webId: 'https://example.com/profile#me' },
    fetch: vi.fn(),
} as unknown as Session

const POD_URL = 'https://pod.example.com/'

describe('hasPodData', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns true when the migration marker (ttl) exists on the pod', async () => {
        mockGetFile.mockResolvedValueOnce(new Blob(['']) as unknown as Blob & WithServerResourceInfo)

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(true)
        expect(mockGetFile).toHaveBeenCalledWith(
            `${POD_URL}${POD_CONTAINERS.MIGRATION_MARKER}`,
            expect.objectContaining({ fetch: mockSession.fetch })
        )
    })

    it('returns true when the ttl questions file exists (no migration marker)', async () => {
        mockGetFile
            .mockRejectedValueOnce({ statusCode: 404 }) // no migration marker
            .mockResolvedValueOnce(new Blob(['']) as unknown as Blob & WithServerResourceInfo)

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(true)
    })

    it('returns true when only the legacy json questions file exists', async () => {
        mockGetFile
            .mockRejectedValueOnce({ statusCode: 404 }) // no migration marker
            .mockRejectedValueOnce({ statusCode: 404 }) // no ttl questions
            .mockResolvedValueOnce(new Blob(['']) as unknown as Blob & WithServerResourceInfo) // json exists

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(true)
    })

    it('returns true when no questions files but packing lists exist', async () => {
        // All 3 getFile checks (marker, ttl, json) return 404
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        const mockDataset = {}
        mockGetSolidDataset.mockResolvedValue(mockDataset as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValue([
            `${POD_URL}pack-me-up/packing-lists/list-1.ttl`,
        ])

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(true)
    })

    it('returns false when neither questions files nor packing lists exist', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(false)
    })

    it('returns false when all question checks are 404 and packing lists container is empty', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        const mockDataset = {}
        mockGetSolidDataset.mockResolvedValue(mockDataset as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValue([])

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(false)
    })

    it('returns false when all question checks are 404 and container has no ttl or json files', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        const mockDataset = {}
        mockGetSolidDataset.mockResolvedValue(mockDataset as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValue([
            `${POD_URL}pack-me-up/packing-lists/`,
        ])

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(false)
    })

    it('checks packing lists at the correct container URL', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })

        await hasPodData(mockSession, POD_URL)

        expect(mockGetSolidDataset).toHaveBeenCalledWith(
            `${POD_URL}pack-me-up/packing-lists/`,
            expect.objectContaining({ fetch: mockSession.fetch })
        )
    })

    it('throws AuthenticationError on 401 from questions file check', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 401 })

        await expect(hasPodData(mockSession, POD_URL)).rejects.toThrow(AuthenticationError)
    })

    it('throws AuthenticationError on 403 from questions file check', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 403 })

        await expect(hasPodData(mockSession, POD_URL)).rejects.toThrow(AuthenticationError)
    })

    it('throws AuthenticationError on 401 from packing lists check', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        mockGetSolidDataset.mockRejectedValue({ statusCode: 401 })

        await expect(hasPodData(mockSession, POD_URL)).rejects.toThrow(AuthenticationError)
    })

    it('re-throws unexpected errors from questions file check', async () => {
        const unexpectedError = { statusCode: 500, message: 'Server Error' }
        mockGetFile.mockRejectedValue(unexpectedError)

        await expect(hasPodData(mockSession, POD_URL)).rejects.toEqual(unexpectedError)
    })

    it('re-throws unexpected errors from packing lists check', async () => {
        const unexpectedError = { statusCode: 500, message: 'Server Error' }
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        mockGetSolidDataset.mockRejectedValue(unexpectedError)

        await expect(hasPodData(mockSession, POD_URL)).rejects.toEqual(unexpectedError)
    })
})

// ─── helpers ────────────────────────────────────────────────────────────────

function makeQuestionSet(overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet {
    return {
        _id: '1',
        people: [],
        alwaysNeededItems: [],
        questions: [],
        lastModified: '2024-01-01T10:00:00.000Z',
        ...overrides,
    }
}

function makePackingList(id: string, overrides: Partial<PackingList> = {}): PackingList {
    return {
        id,
        name: `List ${id}`,
        createdAt: '2024-01-01T00:00:00.000Z',
        items: [],
        lastModified: '2024-01-01T10:00:00.000Z',
        ...overrides,
    }
}

/** Blob whose .text() returns the given JSON */
function jsonBlob(data: unknown): Blob & WithServerResourceInfo {
    const text = JSON.stringify(data)
    return {
        text: () => Promise.resolve(text),
    } as unknown as Blob & WithServerResourceInfo
}

function makeDb(overrides: Partial<{
    questionSet: PackingListQuestionSet | null
    packingLists: PackingList[]
}> = {}): PackingAppDatabase {
    const questionSet = overrides.questionSet !== undefined ? overrides.questionSet : null
    const packingLists = overrides.packingLists ?? []

    return {
        getQuestionSet: vi.fn().mockImplementation(() =>
            questionSet
                ? Promise.resolve(questionSet)
                : Promise.reject({ name: 'not_found' })
        ),
        saveQuestionSet: vi.fn().mockResolvedValue({ rev: 'rev-1' }),
        getAllPackingLists: vi.fn().mockResolvedValue(packingLists),
        savePackingList: vi.fn().mockResolvedValue({ rev: 'rev-pl' }),
        deletePackingList: vi.fn().mockResolvedValue(undefined),
    } as unknown as PackingAppDatabase
}

// ─── syncAllDataFromPod (RDF) ────────────────────────────────────────────────

const QUESTIONS_URL = `${POD_URL}${POD_CONTAINERS.QUESTIONS}`
const LISTS_CONTAINER_URL = `${POD_URL}${POD_CONTAINERS.PACKING_LISTS}`

function makeRdfQsDataset(qs: PackingListQuestionSet) {
    return questionSetToDataset(qs, QUESTIONS_URL) as unknown as SolidDataset & WithServerResourceInfo
}

function makeRdfListDataset(list: PackingList) {
    const url = `${LISTS_CONTAINER_URL}${list.id}.ttl`
    return packingListToDataset(list, url) as unknown as SolidDataset & WithServerResourceInfo
}

function makeContainerDataset(fileUrls: string[]) {
    const ds = {} as SolidDataset & WithServerResourceInfo
    mockGetContainedResourceUrlAll.mockReturnValueOnce(fileUrls)
    return ds
}

describe('syncAllDataFromPod', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('question set sync', () => {
        it('saves pod question set to local DB when pod is newer', async () => {
            const podQs = makeQuestionSet({ lastModified: '2024-06-01T12:00:00.000Z' })
            const localQs = makeQuestionSet({ lastModified: '2024-01-01T10:00:00.000Z' })
            const db = makeDb({ questionSet: localQs, packingLists: [] })

            mockGetSolidDataset
                .mockResolvedValueOnce(makeRdfQsDataset(podQs))
                .mockRejectedValueOnce({ statusCode: 404 }) // empty container

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.saveQuestionSet).toHaveBeenCalledWith(expect.objectContaining({
                lastModified: podQs.lastModified,
            }))
            expect(result.questionSetSynced).toBe(true)
        })

        it('does not overwrite local question set when local is newer', async () => {
            const podQs = makeQuestionSet({ lastModified: '2024-01-01T10:00:00.000Z' })
            const localQs = makeQuestionSet({ lastModified: '2024-06-01T12:00:00.000Z' })
            const db = makeDb({ questionSet: localQs, packingLists: [] })

            mockGetSolidDataset
                .mockResolvedValueOnce(makeRdfQsDataset(podQs))
                .mockRejectedValueOnce({ statusCode: 404 })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.saveQuestionSet).not.toHaveBeenCalled()
            expect(result.questionSetSynced).toBe(false)
        })

        it('saves pod question set when no local copy exists', async () => {
            const podQs = makeQuestionSet()
            const db = makeDb({ questionSet: null, packingLists: [] })

            mockGetSolidDataset
                .mockResolvedValueOnce(makeRdfQsDataset(podQs))
                .mockRejectedValueOnce({ statusCode: 404 })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.saveQuestionSet).toHaveBeenCalled()
            expect(result.questionSetSynced).toBe(true)
        })

        it('skips question set sync gracefully when pod returns 404', async () => {
            const db = makeDb({ packingLists: [] })

            mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.saveQuestionSet).not.toHaveBeenCalled()
            expect(result.questionSetSynced).toBe(false)
        })

        it('re-throws authentication errors from question set load', async () => {
            const db = makeDb({ packingLists: [] })
            mockGetSolidDataset.mockRejectedValueOnce({ statusCode: 401 })

            await expect(syncAllDataFromPod(mockSession, POD_URL, db)).rejects.toThrow(AuthenticationError)
        })
    })

    describe('packing lists sync', () => {
        it('saves all pod packing lists to local DB', async () => {
            const podList1 = makePackingList('list-1')
            const podList2 = makePackingList('list-2')
            const db = makeDb({ questionSet: null, packingLists: [] })

            const list1Url = `${LISTS_CONTAINER_URL}list-1.ttl`
            const list2Url = `${LISTS_CONTAINER_URL}list-2.ttl`

            mockGetSolidDataset
                .mockRejectedValueOnce({ statusCode: 404 }) // no question set
                .mockResolvedValueOnce(makeContainerDataset([list1Url, list2Url]))
                .mockResolvedValueOnce(makeRdfListDataset(podList1))
                .mockResolvedValueOnce(makeRdfListDataset(podList2))

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.savePackingList).toHaveBeenCalledTimes(2)
            expect(result.packingListsSynced).toBe(2)
        })

        it('uploads local-only packing lists to pod', async () => {
            const localOnlyList = makePackingList('local-only')
            const db = makeDb({ questionSet: null, packingLists: [localOnlyList] })

            mockGetSolidDataset
                .mockRejectedValueOnce({ statusCode: 404 }) // no question set
                .mockResolvedValueOnce(makeContainerDataset([])) // empty container

            mockSaveSolidDatasetAt.mockResolvedValue({} as unknown as SolidDataset & WithServerResourceInfo)

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(mockSaveSolidDatasetAt).toHaveBeenCalledWith(
                expect.stringContaining('local-only.ttl'),
                expect.anything(),
                expect.objectContaining({ fetch: mockSession.fetch })
            )
            expect(result.packingListsUploaded).toBe(1)
        })

        it('returns correct counts when both pod and local lists exist', async () => {
            const podList = makePackingList('pod-list')
            const localOnlyList = makePackingList('local-only')
            const db = makeDb({ questionSet: null, packingLists: [localOnlyList] })

            const podListUrl = `${LISTS_CONTAINER_URL}pod-list.ttl`

            mockGetSolidDataset
                .mockRejectedValueOnce({ statusCode: 404 }) // no question set
                .mockResolvedValueOnce(makeContainerDataset([podListUrl]))
                .mockResolvedValueOnce(makeRdfListDataset(podList))

            mockSaveSolidDatasetAt.mockResolvedValue({} as unknown as SolidDataset & WithServerResourceInfo)

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(result.packingListsSynced).toBe(1)
            expect(result.packingListsUploaded).toBe(1)
        })
    })
})

// ─── loadRdfFromPod ──────────────────────────────────────────────────────────

describe('loadRdfFromPod', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('loads a dataset and applies the deserializer', async () => {
        const list = makePackingList('test-id')
        const url = `${POD_URL}pack-me-up/packing-lists/test-id.ttl`
        mockGetSolidDataset.mockResolvedValueOnce(
            packingListToDataset(list, url) as unknown as SolidDataset & WithServerResourceInfo
        )

        const result = await loadRdfFromPod(mockSession, url, (ds, u) => {
            return { id: 'test-id', name: 'Test', createdAt: new Date().toISOString(), items: [] }
        })

        expect(mockGetSolidDataset).toHaveBeenCalledWith(url, expect.objectContaining({ fetch: mockSession.fetch }))
        expect(result.id).toBe('test-id')
    })

    it('throws AuthenticationError on 401', async () => {
        mockGetSolidDataset.mockRejectedValueOnce({ statusCode: 401 })
        await expect(
            loadRdfFromPod(mockSession, 'https://pod.example.com/test.ttl', () => null)
        ).rejects.toThrow(AuthenticationError)
    })

    it('re-throws non-auth errors', async () => {
        const err = { statusCode: 500 }
        mockGetSolidDataset.mockRejectedValueOnce(err)
        await expect(
            loadRdfFromPod(mockSession, 'https://pod.example.com/test.ttl', () => null)
        ).rejects.toEqual(err)
    })
})

// ─── saveRdfToPod ────────────────────────────────────────────────────────────

describe('saveRdfToPod', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('serializes data and calls saveSolidDatasetAt', async () => {
        const list = makePackingList('my-list')
        const url = `${POD_URL}pack-me-up/packing-lists/my-list.ttl`
        mockSaveSolidDatasetAt.mockResolvedValue({} as unknown as SolidDataset & WithServerResourceInfo)

        await saveRdfToPod({
            session: mockSession,
            fileUrl: url,
            data: list,
            serializer: packingListToDataset,
        })

        expect(mockSaveSolidDatasetAt).toHaveBeenCalledWith(
            url,
            expect.anything(),
            expect.objectContaining({ fetch: mockSession.fetch })
        )
    })

    it('throws AuthenticationError on 401', async () => {
        mockSaveSolidDatasetAt.mockRejectedValueOnce({ statusCode: 401 })
        await expect(
            saveRdfToPod({ session: mockSession, fileUrl: 'https://x.example.com/f.ttl', data: {}, serializer: () => ({} as any) })
        ).rejects.toThrow(AuthenticationError)
    })
})

// ─── loadMultipleRdfFromPod ──────────────────────────────────────────────────

describe('loadMultipleRdfFromPod', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('loads all ttl files from a container', async () => {
        const list1 = makePackingList('list-1')
        const list2 = makePackingList('list-2')
        const url1 = `${LISTS_CONTAINER_URL}list-1.ttl`
        const url2 = `${LISTS_CONTAINER_URL}list-2.ttl`

        mockGetSolidDataset
            .mockResolvedValueOnce({} as unknown as SolidDataset & WithServerResourceInfo) // container
            .mockResolvedValueOnce(packingListToDataset(list1, url1) as unknown as SolidDataset & WithServerResourceInfo)
            .mockResolvedValueOnce(packingListToDataset(list2, url2) as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValueOnce([url1, url2])

        const { data, result } = await loadMultipleRdfFromPod(
            mockSession, LISTS_CONTAINER_URL,
            (ds, url) => ({ id: url.split('/').pop()!.replace('.ttl', ''), name: '', createdAt: '', items: [] })
        )

        expect(data).toHaveLength(2)
        expect(result.successCount).toBe(2)
        expect(result.failCount).toBe(0)
    })

    it('returns empty array when container is 404', async () => {
        mockGetSolidDataset.mockRejectedValueOnce({ statusCode: 404 })

        const { data } = await loadMultipleRdfFromPod(mockSession, LISTS_CONTAINER_URL, () => null as any)

        expect(data).toHaveLength(0)
    })

    it('ignores non-ttl files', async () => {
        mockGetSolidDataset.mockResolvedValueOnce({} as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValueOnce([
            `${LISTS_CONTAINER_URL}list-1.json`,  // should be ignored
            `${LISTS_CONTAINER_URL}list-2.ttl`,   // should be loaded
        ])
        const list2 = makePackingList('list-2')
        const url2 = `${LISTS_CONTAINER_URL}list-2.ttl`
        mockGetSolidDataset.mockResolvedValueOnce(packingListToDataset(list2, url2) as unknown as SolidDataset & WithServerResourceInfo)

        const { data } = await loadMultipleRdfFromPod(mockSession, LISTS_CONTAINER_URL,
            (ds, url) => ({ id: url.split('/').pop()!.replace('.ttl', ''), name: '', createdAt: '', items: [] }))

        expect(data).toHaveLength(1)
    })
})

// ─── saveMultipleRdfToPod ────────────────────────────────────────────────────

describe('saveMultipleRdfToPod', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('saves each item as a ttl file', async () => {
        const lists = [makePackingList('list-1'), makePackingList('list-2')]
        mockGetSolidDataset.mockRejectedValueOnce({ statusCode: 404 }) // no existing files
        mockSaveSolidDatasetAt.mockResolvedValue({} as unknown as SolidDataset & WithServerResourceInfo)

        const result = await saveMultipleRdfToPod(mockSession, LISTS_CONTAINER_URL, lists, packingListToDataset)

        expect(mockSaveSolidDatasetAt).toHaveBeenCalledWith(
            expect.stringContaining('list-1.ttl'),
            expect.anything(),
            expect.any(Object)
        )
        expect(mockSaveSolidDatasetAt).toHaveBeenCalledWith(
            expect.stringContaining('list-2.ttl'),
            expect.anything(),
            expect.any(Object)
        )
        expect(result.successCount).toBe(2)
    })

    it('deletes orphaned ttl files', async () => {
        const { deleteFile } = await import('@inrupt/solid-client')
        const mockDeleteFile = vi.mocked(deleteFile)
        const orphanUrl = `${LISTS_CONTAINER_URL}orphan.ttl`
        const activeList = makePackingList('active')

        mockGetSolidDataset.mockResolvedValueOnce({} as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValueOnce([orphanUrl])
        mockDeleteFile.mockResolvedValueOnce(undefined)
        mockSaveSolidDatasetAt.mockResolvedValue({} as unknown as SolidDataset & WithServerResourceInfo)

        await saveMultipleRdfToPod(mockSession, LISTS_CONTAINER_URL, [activeList], packingListToDataset)

        expect(mockDeleteFile).toHaveBeenCalledWith(orphanUrl, expect.any(Object))
    })
})
