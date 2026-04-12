import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Session } from '@inrupt/solid-client-authn-browser'
import type { SolidDataset, WithServerResourceInfo } from '@inrupt/solid-client'
import { hasPodData, syncAllDataFromPod } from './solidPod'
import { AuthenticationError } from './solidPod'
import type { PackingAppDatabase } from './database'
import type { PackingListQuestionSet } from '../edit-questions/types'
import type { PackingList } from '../create-packing-list/types'

vi.mock('@inrupt/solid-client', () => ({
    getFile: vi.fn(),
    getSolidDataset: vi.fn(),
    getContainedResourceUrlAll: vi.fn(),
    getPodUrlAll: vi.fn(),
    saveFileInContainer: vi.fn(),
    overwriteFile: vi.fn(),
    deleteFile: vi.fn(),
}))

import { getFile, getSolidDataset, getContainedResourceUrlAll, saveFileInContainer } from '@inrupt/solid-client'

const mockGetFile = vi.mocked(getFile)
const mockGetSolidDataset = vi.mocked(getSolidDataset)
const mockGetContainedResourceUrlAll = vi.mocked(getContainedResourceUrlAll)
const mockSaveFileInContainer = vi.mocked(saveFileInContainer)

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

    it('returns true when the questions file exists on the pod', async () => {
        mockGetFile.mockResolvedValue(new Blob(['{}']) as unknown as Blob & WithServerResourceInfo)

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(true)
        expect(mockGetFile).toHaveBeenCalledWith(
            `${POD_URL}pack-me-up/packing-list-questions.json`,
            expect.objectContaining({ fetch: mockSession.fetch })
        )
    })

    it('returns true when no questions file but packing lists exist', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        const mockDataset = {}
        mockGetSolidDataset.mockResolvedValue(mockDataset as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValue([
            `${POD_URL}pack-me-up/packing-lists/list-1.json`,
        ])

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(true)
    })

    it('returns false when neither questions file nor packing lists exist', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(false)
    })

    it('returns false when questions file is 404 and packing lists container is empty', async () => {
        mockGetFile.mockRejectedValue({ statusCode: 404 })
        const mockDataset = {}
        mockGetSolidDataset.mockResolvedValue(mockDataset as unknown as SolidDataset & WithServerResourceInfo)
        mockGetContainedResourceUrlAll.mockReturnValue([])

        const result = await hasPodData(mockSession, POD_URL)

        expect(result).toBe(false)
    })

    it('returns false when questions file is 404 and packing lists container has no json files', async () => {
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

// ─── syncAllDataFromPod ──────────────────────────────────────────────────────

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

            // No packing lists in pod
            mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })
            // Question set file returns pod data
            mockGetFile.mockResolvedValueOnce(jsonBlob(podQs))

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

            mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })
            mockGetFile.mockResolvedValueOnce(jsonBlob(podQs))

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.saveQuestionSet).not.toHaveBeenCalled()
            expect(result.questionSetSynced).toBe(false)
        })

        it('saves pod question set when no local copy exists', async () => {
            const podQs = makeQuestionSet()
            const db = makeDb({ questionSet: null, packingLists: [] })

            mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })
            mockGetFile.mockResolvedValueOnce(jsonBlob(podQs))

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.saveQuestionSet).toHaveBeenCalled()
            expect(result.questionSetSynced).toBe(true)
        })

        it('skips question set sync gracefully when pod returns 404', async () => {
            const db = makeDb({ packingLists: [] })

            // Question set 404, then packing lists 404
            mockGetFile.mockRejectedValueOnce({ statusCode: 404 })
            mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.saveQuestionSet).not.toHaveBeenCalled()
            expect(result.questionSetSynced).toBe(false)
        })

        it('re-throws authentication errors from question set load', async () => {
            const db = makeDb({ packingLists: [] })
            mockGetFile.mockRejectedValueOnce({ statusCode: 401 })

            await expect(syncAllDataFromPod(mockSession, POD_URL, db)).rejects.toThrow(AuthenticationError)
        })
    })

    describe('packing lists sync', () => {
        it('saves all pod packing lists to local DB', async () => {
            const podList1 = makePackingList('list-1')
            const podList2 = makePackingList('list-2')
            const db = makeDb({ questionSet: null, packingLists: [] })

            // Question set 404
            mockGetFile
                .mockRejectedValueOnce({ statusCode: 404 })
                // packing list files
                .mockResolvedValueOnce(jsonBlob(podList1))
                .mockResolvedValueOnce(jsonBlob(podList2))

            const mockDataset = {}
            mockGetSolidDataset.mockResolvedValue(mockDataset as unknown as SolidDataset & WithServerResourceInfo)
            mockGetContainedResourceUrlAll.mockReturnValue([
                `${POD_URL}pack-me-up/packing-lists/list-1.json`,
                `${POD_URL}pack-me-up/packing-lists/list-2.json`,
            ])

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.savePackingList).toHaveBeenCalledTimes(2)
            expect(result.packingListsSynced).toBe(2)
        })

        it('uploads local-only packing lists to pod', async () => {
            const localOnlyList = makePackingList('local-only')
            const db = makeDb({ questionSet: null, packingLists: [localOnlyList] })

            // Question set 404, packing lists container is empty
            mockGetFile.mockRejectedValueOnce({ statusCode: 404 })
            mockGetSolidDataset.mockResolvedValue({} as unknown as SolidDataset & WithServerResourceInfo)
            mockGetContainedResourceUrlAll.mockReturnValue([])

            mockSaveFileInContainer.mockResolvedValue({} as unknown as ReturnType<typeof saveFileInContainer> extends Promise<infer R> ? R : never)

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(mockSaveFileInContainer).toHaveBeenCalledWith(
                expect.stringContaining('packing-lists'),
                expect.any(File),
                expect.objectContaining({ slug: 'local-only.json' })
            )
            expect(result.packingListsUploaded).toBe(1)
        })

        it('returns correct counts when both pod and local lists exist', async () => {
            const podList = makePackingList('pod-list')
            const localOnlyList = makePackingList('local-only')
            const db = makeDb({ questionSet: null, packingLists: [localOnlyList] })

            mockGetFile
                .mockRejectedValueOnce({ statusCode: 404 }) // question set
                .mockResolvedValueOnce(jsonBlob(podList))    // pod packing list

            mockGetSolidDataset.mockResolvedValue({} as unknown as SolidDataset & WithServerResourceInfo)
            mockGetContainedResourceUrlAll.mockReturnValue([
                `${POD_URL}pack-me-up/packing-lists/pod-list.json`,
            ])
            mockSaveFileInContainer.mockResolvedValue({} as unknown as ReturnType<typeof saveFileInContainer> extends Promise<infer R> ? R : never)

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(result.packingListsSynced).toBe(1)
            expect(result.packingListsUploaded).toBe(1)
        })
    })
})
