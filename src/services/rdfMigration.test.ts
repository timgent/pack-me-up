import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Session } from '@inrupt/solid-client-authn-browser'

vi.mock('./solidPod', () => ({
    loadFileFromPod: vi.fn(),
    loadMultipleFilesFromPod: vi.fn(),
    saveRdfToPod: vi.fn(),
    POD_CONTAINERS: {
        ROOT: 'pack-me-up/',
        QUESTIONS: 'pack-me-up/packing-list-questions.ttl',
        QUESTIONS_LEGACY_JSON: 'pack-me-up/packing-list-questions.json',
        MIGRATION_MARKER: 'pack-me-up/migrated-to-rdf.ttl',
        PACKING_LISTS: 'pack-me-up/packing-lists/',
        BACKUPS: 'pack-me-up/backups/',
    },
}))

import {
    loadFileFromPod,
    loadMultipleFilesFromPod,
    saveRdfToPod,
} from './solidPod'
import { detectPodDataFormat, migrateJsonToRdf } from './rdfMigration'
import type { PackingListQuestionSet } from '../edit-questions/types'
import type { PackingList } from '../create-packing-list/types'

const mockLoadFileFromPod = vi.mocked(loadFileFromPod)
const mockLoadMultipleFilesFromPod = vi.mocked(loadMultipleFilesFromPod)
const mockSaveRdfToPod = vi.mocked(saveRdfToPod)

const mockSession = {
    info: { isLoggedIn: true, webId: 'https://example.com/profile#me' },
    fetch: vi.fn(),
} as unknown as Session

const POD_URL = 'https://pod.example.com/'

function makeQuestionSet(overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet {
    return { _id: '1', people: [], alwaysNeededItems: [], questions: [], ...overrides }
}

function makePackingList(id: string, overrides: Partial<PackingList> = {}): PackingList {
    return { id, name: `List ${id}`, createdAt: '2024-01-01T00:00:00.000Z', items: [], ...overrides }
}

describe('detectPodDataFormat', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns "rdf" when migration marker file exists', async () => {
        mockLoadFileFromPod.mockResolvedValueOnce({} as PackingListQuestionSet) // marker exists

        const result = await detectPodDataFormat(mockSession, POD_URL)

        expect(result).toBe('rdf')
        expect(mockLoadFileFromPod).toHaveBeenCalledWith(
            expect.objectContaining({
                fileUrl: `${POD_URL}pack-me-up/migrated-to-rdf.ttl`,
            })
        )
    })

    it('returns "rdf" when ttl questions file exists (no marker)', async () => {
        mockLoadFileFromPod
            .mockRejectedValueOnce({ statusCode: 404 }) // no marker
            .mockResolvedValueOnce({} as PackingListQuestionSet) // ttl questions exists

        const result = await detectPodDataFormat(mockSession, POD_URL)

        expect(result).toBe('rdf')
    })

    it('returns "json" when only json questions file exists', async () => {
        mockLoadFileFromPod
            .mockRejectedValueOnce({ statusCode: 404 }) // no marker
            .mockRejectedValueOnce({ statusCode: 404 }) // no ttl
            .mockResolvedValueOnce({} as PackingListQuestionSet) // json exists

        const result = await detectPodDataFormat(mockSession, POD_URL)

        expect(result).toBe('json')
    })

    it('returns "empty" when no files exist', async () => {
        mockLoadFileFromPod
            .mockRejectedValueOnce({ statusCode: 404 })
            .mockRejectedValueOnce({ statusCode: 404 })
            .mockRejectedValueOnce({ statusCode: 404 })

        const result = await detectPodDataFormat(mockSession, POD_URL)

        expect(result).toBe('empty')
    })

    it('re-throws non-404 errors', async () => {
        const serverError = { statusCode: 500 }
        mockLoadFileFromPod.mockRejectedValueOnce(serverError)

        await expect(detectPodDataFormat(mockSession, POD_URL)).rejects.toEqual(serverError)
    })
})

describe('migrateJsonToRdf', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'log').mockImplementation(() => {})
        mockSaveRdfToPod.mockResolvedValue(undefined)
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('migrates question set and packing lists', async () => {
        const qs = makeQuestionSet()
        const list1 = makePackingList('list-1')
        const list2 = makePackingList('list-2')

        mockLoadFileFromPod.mockResolvedValueOnce(qs)
        mockLoadMultipleFilesFromPod.mockResolvedValueOnce({
            data: [list1, list2],
            result: { success: true, successCount: 2, failCount: 0, totalCount: 2 },
        })

        const result = await migrateJsonToRdf(mockSession, POD_URL)

        expect(result.questionSetMigrated).toBe(true)
        expect(result.packingListsMigrated).toBe(2)
        expect(result.errors).toEqual([])

        // Saves question set as RDF
        expect(mockSaveRdfToPod).toHaveBeenCalledWith(
            expect.objectContaining({
                session: mockSession,
                fileUrl: `${POD_URL}pack-me-up/packing-list-questions.ttl`,
            })
        )
        // Saves each packing list as RDF
        expect(mockSaveRdfToPod).toHaveBeenCalledWith(
            expect.objectContaining({
                fileUrl: `${POD_URL}pack-me-up/packing-lists/list-1.ttl`,
            })
        )
        expect(mockSaveRdfToPod).toHaveBeenCalledWith(
            expect.objectContaining({
                fileUrl: `${POD_URL}pack-me-up/packing-lists/list-2.ttl`,
            })
        )
        // Saves migration marker
        expect(mockSaveRdfToPod).toHaveBeenCalledWith(
            expect.objectContaining({
                fileUrl: `${POD_URL}pack-me-up/migrated-to-rdf.ttl`,
            })
        )
    })

    it('skips question set gracefully when it does not exist (404)', async () => {
        mockLoadFileFromPod.mockRejectedValueOnce({ statusCode: 404 })
        mockLoadMultipleFilesFromPod.mockResolvedValueOnce({
            data: [],
            result: { success: true, successCount: 0, failCount: 0, totalCount: 0 },
        })

        const result = await migrateJsonToRdf(mockSession, POD_URL)

        expect(result.questionSetMigrated).toBe(false)
        expect(result.packingListsMigrated).toBe(0)
        expect(result.errors).toEqual([])
        // Marker is still written
        expect(mockSaveRdfToPod).toHaveBeenCalledWith(
            expect.objectContaining({ fileUrl: `${POD_URL}pack-me-up/migrated-to-rdf.ttl` })
        )
    })

    it('records errors for failed list migrations without aborting', async () => {
        const qs = makeQuestionSet()
        const list1 = makePackingList('list-1')
        const list2 = makePackingList('list-2')

        mockLoadFileFromPod.mockResolvedValueOnce(qs)
        mockLoadMultipleFilesFromPod.mockResolvedValueOnce({
            data: [list1, list2],
            result: { success: true, successCount: 2, failCount: 0, totalCount: 2 },
        })

        // Question set save succeeds, list-1 fails, list-2 succeeds, marker succeeds
        mockSaveRdfToPod
            .mockResolvedValueOnce(undefined)        // question set
            .mockRejectedValueOnce(new Error('network error'))  // list-1 fails
            .mockResolvedValueOnce(undefined)        // list-2
            .mockResolvedValueOnce(undefined)        // marker

        const result = await migrateJsonToRdf(mockSession, POD_URL)

        expect(result.packingListsMigrated).toBe(1)
        expect(result.errors).toHaveLength(1)
        expect(result.errors[0]).toContain('list-1')
    })

    it('writes migration marker even when some lists fail', async () => {
        mockLoadFileFromPod.mockRejectedValueOnce({ statusCode: 404 })
        mockLoadMultipleFilesFromPod.mockResolvedValueOnce({
            data: [makePackingList('list-1')],
            result: { success: false, successCount: 0, failCount: 1, totalCount: 1 },
        })
        mockSaveRdfToPod
            .mockRejectedValueOnce(new Error('save failed'))
            .mockResolvedValueOnce(undefined) // marker

        const result = await migrateJsonToRdf(mockSession, POD_URL)

        expect(result.errors).toHaveLength(1)
        // Marker still written
        expect(mockSaveRdfToPod).toHaveBeenCalledWith(
            expect.objectContaining({ fileUrl: `${POD_URL}pack-me-up/migrated-to-rdf.ttl` })
        )
    })
})
