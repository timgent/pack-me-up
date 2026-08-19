import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PouchDB from 'pouchdb'
import PouchDBMemoryAdapter from 'pouchdb-adapter-memory'
import type { AppSession as Session } from '../types/AppSession'
import type { SolidDataset, WithServerResourceInfo } from '@inrupt/solid-client'
import {
    hasPodData,
    syncAllDataFromPod,
    loadRdfFromPod,
    saveRdfToPod,
    deleteFileFromPod,
    loadMultipleRdfFromPod,
    saveMultipleRdfToPod,
    POD_CONTAINERS,
    deriveWebIdFromPodUrl,
    grantCollaboratorAccess,
    grantPublicAccess,
    revokeCollaboratorAccess,
    getCollaborators,
    getPodOwnerName,
    friendlyPodName,
    getPrimaryPodUrl,
    derivePodUrlFromWebId,
    resetPodSessionCaches,
} from './solidPod'
import { AuthenticationError } from './solidPod'
import { PackingAppDatabase } from './database'
import type { PackingListQuestionSet } from '../edit-questions/types'
import type { PackingList } from '../create-packing-list/types'
import { packingListToDataset, questionSetToDataset, deletedPackingListsToDataset } from './rdfSerialization'
import type { DeletedPackingLists } from './rdfSerialization'
import { emptyDeletedPackingLists } from '../utils/packingListDeletions'
import { fullyPopulatedPackingList, withoutLocalOnlyFields } from '../test-utils/fullyPopulatedFixtures'

// Most tests here use a stubbed db (see makeDb); the field-fidelity test uses a
// real PouchDB-backed one.
PouchDB.plugin(PouchDBMemoryAdapter)

vi.mock('@inrupt/solid-client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inrupt/solid-client')>()
    return {
        ...actual,
        getFile: vi.fn(),
        getSolidDataset: vi.fn(),
        getContainedResourceUrlAll: vi.fn(),
        getPodUrlAll: vi.fn(),
        overwriteFile: vi.fn(),
        deleteFile: vi.fn(),
        createContainerAt: vi.fn(),
        saveSolidDatasetAt: vi.fn(),
        getResourceInfoWithAcl: vi.fn(),
        hasResourceAcl: vi.fn(),
        hasFallbackAcl: vi.fn(),
        hasAccessibleAcl: vi.fn(),
        getResourceAcl: vi.fn(),
        createAclFromFallbackAcl: vi.fn(),
        saveAclFor: vi.fn(),
        setAgentResourceAccess: vi.fn((acl: unknown) => acl),
        setAgentDefaultAccess: vi.fn((acl: unknown) => acl),
        universalAccess: {
            ...actual.universalAccess,
            getAgentAccessAll: vi.fn(),
            setPublicAccess: vi.fn(),
            setAgentAccess: vi.fn(),
        },
    }
})

import { getFile, getSolidDataset, getContainedResourceUrlAll, getPodUrlAll, overwriteFile, createSolidDataset, createContainerAt, universalAccess, getResourceInfoWithAcl, hasResourceAcl, hasFallbackAcl, hasAccessibleAcl, getResourceAcl, createAclFromFallbackAcl, saveAclFor, setAgentResourceAccess, setAgentDefaultAccess, deleteFile } from '@inrupt/solid-client'

const mockGetPodUrlAll = vi.mocked(getPodUrlAll)
const mockGetFile = vi.mocked(getFile)
const mockGetSolidDataset = vi.mocked(getSolidDataset)
const mockGetContainedResourceUrlAll = vi.mocked(getContainedResourceUrlAll)
const mockOverwriteFile = vi.mocked(overwriteFile)
const mockCreateContainerAt = vi.mocked(createContainerAt)
const mockDeleteFile = vi.mocked(deleteFile)
const mockGetAgentAccessAll = vi.mocked(universalAccess.getAgentAccessAll)
const mockSetPublicAccess = vi.mocked(universalAccess.setPublicAccess)
const mockGetResourceInfoWithAcl = vi.mocked(getResourceInfoWithAcl)
const mockHasResourceAcl = vi.mocked(hasResourceAcl)
const mockHasFallbackAcl = vi.mocked(hasFallbackAcl)
const mockHasAccessibleAcl = vi.mocked(hasAccessibleAcl)
const mockGetResourceAcl = vi.mocked(getResourceAcl)
const mockCreateAclFromFallbackAcl = vi.mocked(createAclFromFallbackAcl)
const mockSaveAclFor = vi.mocked(saveAclFor)
const mockSetAgentResourceAccess = vi.mocked(setAgentResourceAccess)
const mockSetAgentDefaultAccess = vi.mocked(setAgentDefaultAccess)

const mockSession = {
    info: { isLoggedIn: true, webId: 'https://example.com/profile#me' },
    fetch: vi.fn(),
} as unknown as Session

const POD_URL = 'https://pod.example.com/'

// Ensure each test starts with clean mock state (vi.restoreAllMocks in inner afterEach
// hooks doesn't fully clear permanent mockRejectedValue defaults on vi.fn() mocks).
beforeEach(() => {
    vi.resetAllMocks()
    // The pod URL and known-container caches live for the length of a session;
    // each test is its own session.
    resetPodSessionCaches()
})

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


function makeDb(overrides: Partial<{
    questionSet: PackingListQuestionSet | null
    packingLists: PackingList[]
    deletions: DeletedPackingLists
}> = {}): PackingAppDatabase {
    const questionSet = overrides.questionSet !== undefined ? overrides.questionSet : null
    const packingLists = overrides.packingLists ?? []
    const deletions = overrides.deletions ?? emptyDeletedPackingLists()

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
        getDeletedPackingLists: vi.fn().mockResolvedValue(deletions),
        saveDeletedPackingLists: vi.fn().mockResolvedValue({ rev: 'rev-del' }),
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

const DELETIONS_URL = `${POD_URL}${POD_CONTAINERS.DELETED_PACKING_LISTS}`

const EMPTY_DATASET = {} as SolidDataset & WithServerResourceInfo

/**
 * Answers getSolidDataset by URL rather than by call order.
 *
 * syncAllDataFromPod asks for the question set, the packing-list container and
 * the deletion tombstones concurrently, so a queue of mockResolvedValueOnce
 * hands each result to whichever request happens to go first — adding a fourth
 * read would silently re-point the other three. Anything not listed here (a
 * missing question set, an absent tombstone file) answers 404, which is what a
 * pod without that resource does.
 */
function stubPod(contents: {
    questionSet?: PackingListQuestionSet
    lists?: PackingList[]
    deletions?: DeletedPackingLists
}) {
    const { questionSet, lists = [], deletions } = contents
    mockGetContainedResourceUrlAll.mockReturnValue(lists.map(l => `${LISTS_CONTAINER_URL}${l.id}.ttl`))
    mockGetSolidDataset.mockImplementation(async (url: string) => {
        if (url === QUESTIONS_URL) {
            if (!questionSet) throw { statusCode: 404 }
            return makeRdfQsDataset(questionSet)
        }
        if (url === DELETIONS_URL) {
            if (!deletions) throw { statusCode: 404 }
            return deletedPackingListsToDataset(deletions, DELETIONS_URL) as unknown as SolidDataset & WithServerResourceInfo
        }
        const list = lists.find(l => `${LISTS_CONTAINER_URL}${l.id}.ttl` === url)
        if (list) return makeRdfListDataset(list)
        // The list container itself, and the container probes ensureContainerExists
        // makes before a write.
        return EMPTY_DATASET
    })
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
            const db = makeDb({ questionSet: null, packingLists: [] })

            stubPod({ lists: [makePackingList('list-1'), makePackingList('list-2')] })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.savePackingList).toHaveBeenCalledTimes(2)
            expect(result.packingListsSynced).toBe(2)
        })

        it('keeps a local edit the pod has not caught up with', async () => {
            // The pod write for the last edit is best-effort and can be cut off
            // by a reload. The local copy is the one that is guaranteed, so an
            // older pod copy must not flatten it on the next login.
            const item = { id: 'i1', itemText: 'Passport', personId: 'p1', personName: 'Ann', questionId: 'q1', optionId: 'o1' }
            const podList = makePackingList('list-1', {
                lastModified: '2024-01-01T10:00:00.000Z',
                items: [{ ...item, packed: false }],
            })
            const locallyEdited = makePackingList('list-1', {
                lastModified: '2024-06-01T10:00:00.000Z',
                items: [{ ...item, packed: true }],
            })
            const db = makeDb({ questionSet: null, packingLists: [locallyEdited] })

            stubPod({ lists: [podList] })
            mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

            await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.savePackingList).toHaveBeenCalledWith(expect.objectContaining({
                items: [expect.objectContaining({ id: 'i1', packed: true })],
            }))
        })

        it('puts a local edit the pod has not caught up with back on the pod', async () => {
            const item = { id: 'i1', itemText: 'Passport', personId: 'p1', personName: 'Ann', questionId: 'q1', optionId: 'o1' }
            const podList = makePackingList('list-1', {
                lastModified: '2024-01-01T10:00:00.000Z',
                items: [{ ...item, packed: false }],
            })
            const locallyEdited = makePackingList('list-1', {
                lastModified: '2024-06-01T10:00:00.000Z',
                items: [{ ...item, packed: true }],
            })
            const db = makeDb({ questionSet: null, packingLists: [locallyEdited] })

            stubPod({ lists: [podList] })
            mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

            await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(mockOverwriteFile).toHaveBeenCalledWith(
                expect.stringContaining('list-1.ttl'),
                expect.any(Blob),
                expect.objectContaining({ contentType: 'text/turtle' })
            )
        })

        it('takes the pod copy when it is the newer one', async () => {
            const item = { id: 'i1', itemText: 'Passport', personId: 'p1', personName: 'Ann', questionId: 'q1', optionId: 'o1' }
            const podList = makePackingList('list-1', {
                lastModified: '2024-06-01T10:00:00.000Z',
                items: [{ ...item, packed: true }],
            })
            const staleLocal = makePackingList('list-1', {
                lastModified: '2024-01-01T10:00:00.000Z',
                items: [{ ...item, packed: false }],
            })
            const db = makeDb({ questionSet: null, packingLists: [staleLocal] })

            stubPod({ lists: [podList] })

            await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.savePackingList).toHaveBeenCalledWith(expect.objectContaining({
                items: [expect.objectContaining({ id: 'i1', packed: true })],
            }))
            expect(mockOverwriteFile).not.toHaveBeenCalled()
        })

        it('uploads local-only packing lists to pod', async () => {
            const localOnlyList = makePackingList('local-only')
            const db = makeDb({ questionSet: null, packingLists: [localOnlyList] })

            stubPod({ lists: [] })
            mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(mockOverwriteFile).toHaveBeenCalledWith(
                expect.stringContaining('local-only.ttl'),
                expect.any(Blob),
                expect.objectContaining({ fetch: mockSession.fetch, contentType: 'text/turtle' })
            )
            expect(result.packingListsUploaded).toBe(1)
        })

        it('returns correct counts when both pod and local lists exist', async () => {
            const localOnlyList = makePackingList('local-only')
            const db = makeDb({ questionSet: null, packingLists: [localOnlyList] })

            stubPod({ lists: [makePackingList('pod-list')] })
            mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(result.packingListsSynced).toBe(1)
            expect(result.packingListsUploaded).toBe(1)
        })

        // #260: login sync writes pod lists through savePackingList, whose field
        // allowlist stripped nights / questionAnswers / selectedPeopleIds — so
        // data that was safe in the pod was lost on its way into PouchDB.
        it('keeps every pod-serialisable field of a synced list in the local DB', async () => {
            const podList: PackingList = { ...fullyPopulatedPackingList, id: 'pod-full' }
            const realDb = PackingAppDatabase.getInstance('sync-field-fidelity')

            stubPod({ lists: [podList] })

            const result = await syncAllDataFromPod(mockSession, POD_URL, realDb)

            expect(result.packingListsSynced).toBe(1)
            const stored = await realDb.getPackingList('pod-full')
            expect(stored).toEqual({ ...withoutLocalOnlyFields(podList), _rev: expect.any(String) })
        })
    })

    // A list deleted on one device used to come back everywhere, because a device
    // that still held it saw "on this device, not on the pod" and uploaded it.
    describe('deleted packing lists', () => {
        // Relative to now, not fixed dates: tombstones older than the retention
        // window are pruned, so hard-coded ones quietly stop being tombstones.
        const beforeDelete = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        const deletedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        const afterDelete = new Date(Date.now() - 30 * 60 * 1000).toISOString()

        function makeDeletions(...ids: string[]): DeletedPackingLists {
            return { deletions: ids.map(listId => ({ listId, deletedAt })), lastModified: deletedAt }
        }

        it('does not re-upload a local list the pod says was deleted', async () => {
            const deletedList = makePackingList('deleted-list', { lastModified: beforeDelete })
            const db = makeDb({ questionSet: null, packingLists: [deletedList] })

            stubPod({ lists: [], deletions: makeDeletions('deleted-list') })
            mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(mockOverwriteFile).not.toHaveBeenCalledWith(
                expect.stringContaining('deleted-list.ttl'),
                expect.anything(),
                expect.anything()
            )
            expect(result.packingListsUploaded).toBe(0)
        })

        it('removes the local copy of a list deleted on another device', async () => {
            const deletedList = makePackingList('deleted-list', { lastModified: beforeDelete })
            const db = makeDb({ questionSet: null, packingLists: [deletedList] })

            stubPod({ lists: [], deletions: makeDeletions('deleted-list') })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.deletePackingList).toHaveBeenCalledWith('deleted-list', { recordDeletion: false })
            expect(result.packingListsDeleted).toBe(1)
        })

        it('leaves lists without a tombstone alone', async () => {
            const keptList = makePackingList('kept-list')
            const db = makeDb({ questionSet: null, packingLists: [keptList] })

            stubPod({ lists: [], deletions: makeDeletions('some-other-list') })
            mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.deletePackingList).not.toHaveBeenCalled()
            expect(result.packingListsUploaded).toBe(1)
        })

        it('keeps a cached shared list even when its id is tombstoned', async () => {
            const sharedList = makePackingList('shared-list', {
                lastModified: beforeDelete,
                sharedFromPodUrl: 'https://someone-else.example/',
            })
            const db = makeDb({ questionSet: null, packingLists: [sharedList] })

            stubPod({ lists: [], deletions: makeDeletions('shared-list') })
            mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.deletePackingList).not.toHaveBeenCalled()
            expect(result.packingListsDeleted).toBe(0)
        })

        it('takes a tombstoned list off the pod as well', async () => {
            const podList = makePackingList('deleted-list', { lastModified: beforeDelete })
            const db = makeDb({ questionSet: null, packingLists: [] })

            stubPod({ lists: [podList], deletions: makeDeletions('deleted-list') })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(mockDeleteFile).toHaveBeenCalledWith(
                `${LISTS_CONTAINER_URL}deleted-list.ttl`,
                expect.objectContaining({ fetch: mockSession.fetch })
            )
            expect(db.savePackingList).not.toHaveBeenCalled()
            expect(result.packingListsSynced).toBe(0)
        })

        // Deleting is not final: a copy edited after the delete is the user
        // coming back to the list, and must not be deleted a second time.
        it('keeps a list edited after it was deleted, and drops the tombstone', async () => {
            const revivedList = makePackingList('revived-list', { lastModified: afterDelete })
            const db = makeDb({ questionSet: null, packingLists: [], deletions: makeDeletions('revived-list') })

            stubPod({ lists: [revivedList], deletions: makeDeletions('revived-list') })
            mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(mockDeleteFile).not.toHaveBeenCalled()
            expect(result.packingListsSynced).toBe(1)
            expect(db.saveDeletedPackingLists).toHaveBeenCalledWith(
                expect.objectContaining({ deletions: [] })
            )
        })

        it('pushes local tombstones the pod has not seen', async () => {
            const db = makeDb({ questionSet: null, packingLists: [], deletions: makeDeletions('deleted-here') })

            stubPod({ lists: [] })
            mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

            await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(mockOverwriteFile).toHaveBeenCalledWith(
                DELETIONS_URL,
                expect.any(Blob),
                expect.objectContaining({ fetch: mockSession.fetch, contentType: 'text/turtle' })
            )
        })

        it('saves pod tombstones locally so the next sync starts from them', async () => {
            const db = makeDb({ questionSet: null, packingLists: [] })

            stubPod({ lists: [], deletions: makeDeletions('deleted-elsewhere') })

            await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(db.saveDeletedPackingLists).toHaveBeenCalledWith(
                expect.objectContaining({ deletions: [{ listId: 'deleted-elsewhere', deletedAt }] })
            )
        })

        it('syncs normally when the pod has no tombstone file yet', async () => {
            const db = makeDb({ questionSet: null, packingLists: [] })

            stubPod({ lists: [makePackingList('list-1')] })

            const result = await syncAllDataFromPod(mockSession, POD_URL, db)

            expect(result.packingListsSynced).toBe(1)
            expect(result.packingListsDeleted).toBe(0)
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

        const result = await loadRdfFromPod(mockSession, url, (_ds, _u) => {
            return { id: 'test-id', name: 'Test', createdAt: new Date().toISOString(), items: [] }
        })

        expect(result.id).toBe('test-id')
        // The `fetch` passed to getSolidDataset is a conditional-GET wrapper
        // (see the loadRdfFromPod tests below), not the session's fetch
        // directly — assert it delegates to the session's fetch instead of
        // checking identity.
        const passedFetch = mockGetSolidDataset.mock.calls[0][1]?.fetch
        mockSession.fetch.mockResolvedValueOnce(new Response(null, { status: 200 }))
        await passedFetch?.(url)
        expect(mockSession.fetch).toHaveBeenCalledWith(url, expect.anything())
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

    it('uses globalThis.fetch when session is null (public access)', async () => {
        const url = 'https://pod.example.com/public.ttl'
        const list = makePackingList('pub-id')
        mockGetSolidDataset.mockResolvedValueOnce(
            packingListToDataset(list, url) as unknown as SolidDataset & WithServerResourceInfo
        )
        const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }))

        await loadRdfFromPod(null, url, (_ds, _u) => ({ id: 'pub-id', name: 'Public', createdAt: '', items: [] }))

        const passedFetch = mockGetSolidDataset.mock.calls[0][1]?.fetch
        await passedFetch?.(url)
        expect(globalFetchSpy).toHaveBeenCalledWith(url, expect.anything())
    })

    it('sends the previously seen ETag as If-None-Match on the next load of the same URL', async () => {
        const url = `${POD_URL}pack-me-up/packing-lists/etag-test.ttl`
        const list = makePackingList('etag-id')
        const dataset = packingListToDataset(list, url) as unknown as SolidDataset & WithServerResourceInfo

        // First load: the pod responds with an ETag, which getSolidDataset's
        // fetch wrapper should observe.
        mockGetSolidDataset.mockImplementationOnce(async (u, options) => {
            await options!.fetch!(u as string)
            return dataset
        })
        mockSession.fetch.mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"v1"' } }))
        await loadRdfFromPod(mockSession, url, () => ({ id: 'etag-id', name: '', createdAt: '', items: [] }))

        // Second load: getSolidDataset's fetch wrapper should now send
        // If-None-Match with the ETag observed above.
        mockGetSolidDataset.mockImplementationOnce(async (u, options) => {
            await options!.fetch!(u as string)
            return dataset
        })
        mockSession.fetch.mockResolvedValueOnce(new Response(null, { status: 200 }))
        await loadRdfFromPod(mockSession, url, () => ({ id: 'etag-id', name: '', createdAt: '', items: [] }))

        const secondCallHeaders = new Headers(mockSession.fetch.mock.calls[1][1]?.headers)
        expect(secondCallHeaders.get('If-None-Match')).toBe('"v1"')
    })

    it('returns the cached result without re-running the deserializer when the pod responds 304', async () => {
        const url = `${POD_URL}pack-me-up/packing-lists/not-modified.ttl`
        const list = makePackingList('cached-id')
        const dataset = packingListToDataset(list, url) as unknown as SolidDataset & WithServerResourceInfo
        const deserializer = vi.fn(() => ({ id: 'cached-id', name: 'Cached', createdAt: '', items: [] }))

        mockGetSolidDataset.mockImplementationOnce(async (u, options) => {
            await options!.fetch!(u as string)
            return dataset
        })
        mockSession.fetch.mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"v1"' } }))
        const first = await loadRdfFromPod(mockSession, url, deserializer)
        expect(deserializer).toHaveBeenCalledTimes(1)

        // Mirrors what getSolidDataset itself does for any non-2xx response
        // (see @inrupt/solid-client's internal_isUnsuccessfulResponse): a 304
        // makes it throw before ever reaching the parser.
        mockGetSolidDataset.mockImplementationOnce(async (u, options) => {
            const response = await options!.fetch!(u as string)
            if (!response.ok) throw { statusCode: response.status }
            return dataset
        })
        mockSession.fetch.mockResolvedValueOnce(new Response(null, { status: 304 }))
        const second = await loadRdfFromPod(mockSession, url, deserializer)

        expect(second).toEqual(first)
        expect(deserializer).toHaveBeenCalledTimes(1) // not called again for the 304
    })

    it('re-parses and returns fresh data when the pod content actually changed (new ETag)', async () => {
        const url = `${POD_URL}pack-me-up/packing-lists/changed.ttl`
        const datasetV1 = packingListToDataset(makePackingList('v1'), url) as unknown as SolidDataset & WithServerResourceInfo
        const datasetV2 = packingListToDataset(makePackingList('v2'), url) as unknown as SolidDataset & WithServerResourceInfo
        const deserializer = vi.fn((ds: SolidDataset) => ds === datasetV2
            ? { id: 'v2', name: 'Updated', createdAt: '', items: [] }
            : { id: 'v1', name: 'Original', createdAt: '', items: [] })

        mockGetSolidDataset.mockImplementationOnce(async (u, options) => {
            await options!.fetch!(u as string)
            return datasetV1
        })
        mockSession.fetch.mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"v1"' } }))
        const first = await loadRdfFromPod(mockSession, url, deserializer)
        expect(first.id).toBe('v1')

        // Another device changed the pod resource: server returns 200 with a
        // new ETag and body, same as a first-ever load.
        mockGetSolidDataset.mockImplementationOnce(async (u, options) => {
            await options!.fetch!(u as string)
            return datasetV2
        })
        mockSession.fetch.mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"v2"' } }))
        const second = await loadRdfFromPod(mockSession, url, deserializer)

        expect(second.id).toBe('v2')
        expect(deserializer).toHaveBeenCalledTimes(2)
    })
})

// ─── saveRdfToPod ────────────────────────────────────────────────────────────

describe('saveRdfToPod', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('serializes data and calls overwriteFile with Turtle content', async () => {
        const list = makePackingList('my-list')
        const url = `${POD_URL}pack-me-up/packing-lists/my-list.ttl`
        mockGetSolidDataset.mockResolvedValueOnce({} as unknown as SolidDataset & WithServerResourceInfo) // container exists
        mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

        await saveRdfToPod({
            session: mockSession,
            fileUrl: url,
            data: list,
            serializer: packingListToDataset,
        })

        expect(mockOverwriteFile).toHaveBeenCalledWith(
            url,
            expect.any(Blob),
            expect.objectContaining({ fetch: mockSession.fetch, contentType: 'text/turtle' })
        )
    })

    it('checks the parent container only once per session, not on every save', async () => {
        // Every save used to spend a round trip asking whether the container was
        // there. On a slow connection that doubled the cost of saving an edit.
        const url = `${POD_URL}pack-me-up/packing-lists/my-list.ttl`
        mockGetSolidDataset.mockResolvedValue({} as unknown as SolidDataset & WithServerResourceInfo)
        mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

        for (let i = 0; i < 3; i++) {
            await saveRdfToPod({
                session: mockSession,
                fileUrl: url,
                data: makePackingList('my-list'),
                serializer: packingListToDataset,
            })
        }

        expect(mockGetSolidDataset).toHaveBeenCalledOnce()
        expect(mockOverwriteFile).toHaveBeenCalledTimes(3)
    })

    it('skips container creation and proceeds if caller lacks read access (403) on foreign pod', async () => {
        const list = makePackingList('my-list')
        const url = `${POD_URL}pack-me-up/packing-lists/my-list.ttl`
        mockGetSolidDataset.mockRejectedValueOnce({ statusCode: 403 }) // no read access to container
        mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

        await saveRdfToPod({
            session: mockSession,
            fileUrl: url,
            data: list,
            serializer: packingListToDataset,
        })

        expect(mockCreateContainerAt).not.toHaveBeenCalled()
        expect(mockOverwriteFile).toHaveBeenCalledWith(url, expect.any(Blob), expect.any(Object))
    })

    it('creates the parent container if it does not exist before writing', async () => {
        const list = makePackingList('my-list')
        const url = `${POD_URL}pack-me-up/packing-lists/my-list.ttl`
        const containerUrl = `${POD_URL}pack-me-up/packing-lists/`
        mockGetSolidDataset.mockRejectedValueOnce({ statusCode: 404 }) // container missing
        mockCreateContainerAt.mockResolvedValueOnce({} as unknown as ReturnType<typeof createContainerAt> extends Promise<infer R> ? R : never)
        mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

        await saveRdfToPod({
            session: mockSession,
            fileUrl: url,
            data: list,
            serializer: packingListToDataset,
        })

        expect(mockCreateContainerAt).toHaveBeenCalledWith(containerUrl, expect.objectContaining({ fetch: mockSession.fetch }))
        expect(mockOverwriteFile).toHaveBeenCalledWith(url, expect.any(Blob), expect.any(Object))
    })

    it('throws AuthenticationError on 401', async () => {
        mockGetSolidDataset.mockResolvedValueOnce({} as unknown as SolidDataset & WithServerResourceInfo) // container exists
        mockOverwriteFile.mockRejectedValueOnce({ statusCode: 401 })
        await expect(
            saveRdfToPod({ session: mockSession, fileUrl: 'https://x.example.com/f.ttl', data: {}, serializer: () => createSolidDataset() })
        ).rejects.toThrow(AuthenticationError)
    })

    it('uses globalThis.fetch when session is null', async () => {
        const url = `${POD_URL}pack-me-up/packing-lists/my-list.ttl`
        const mockFetch = vi.fn() as typeof fetch
        vi.stubGlobal('fetch', mockFetch)
        mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

        await saveRdfToPod({
            session: null,
            fileUrl: url,
            data: makePackingList('my-list'),
            serializer: packingListToDataset,
        })

        expect(mockOverwriteFile).toHaveBeenCalledWith(
            url,
            expect.any(Blob),
            expect.objectContaining({ fetch: mockFetch, contentType: 'text/turtle' })
        )
        vi.unstubAllGlobals()
    })
})

// ─── deleteFileFromPod ───────────────────────────────────────────────────────

describe('deleteFileFromPod', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('calls deleteFile with the correct URL', async () => {
        const fileUrl = `${POD_URL}pack-me-up/packing-lists/abc.ttl`
        mockDeleteFile.mockResolvedValueOnce(undefined)

        await deleteFileFromPod(mockSession, fileUrl)

        expect(mockDeleteFile).toHaveBeenCalledWith(fileUrl, expect.objectContaining({ fetch: mockSession.fetch }))
    })

    it('treats 404 as success (idempotent delete)', async () => {
        mockDeleteFile.mockRejectedValueOnce({ statusCode: 404 })

        await expect(deleteFileFromPod(mockSession, `${POD_URL}pack-me-up/packing-lists/gone.ttl`)).resolves.toBeUndefined()
    })

    it('rethrows non-404 errors', async () => {
        mockDeleteFile.mockRejectedValueOnce({ statusCode: 500 })

        await expect(deleteFileFromPod(mockSession, `${POD_URL}pack-me-up/packing-lists/err.ttl`)).rejects.toMatchObject({ statusCode: 500 })
    })

    it('throws AuthenticationError on 403', async () => {
        mockDeleteFile.mockRejectedValueOnce({ statusCode: 403 })

        await expect(deleteFileFromPod(mockSession, `${POD_URL}pack-me-up/packing-lists/auth.ttl`)).rejects.toThrow(AuthenticationError)
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

        const { data } = await loadMultipleRdfFromPod<PackingList>(mockSession, LISTS_CONTAINER_URL, () => null as unknown as PackingList)

        expect(data).toHaveLength(0)
    })

    it('fetches the files in parallel rather than one round trip at a time', async () => {
        const urls = ['a', 'b', 'c'].map(id => `${LISTS_CONTAINER_URL}${id}.ttl`)
        mockGetContainedResourceUrlAll.mockReturnValueOnce(urls)

        let inFlight = 0
        let peakInFlight = 0
        const release: Array<() => void> = []

        mockGetSolidDataset.mockImplementation((url: string) => {
            if (url === LISTS_CONTAINER_URL) {
                return Promise.resolve({} as unknown as SolidDataset & WithServerResourceInfo)
            }
            inFlight++
            peakInFlight = Math.max(peakInFlight, inFlight)
            return new Promise(resolve => {
                release.push(() => {
                    inFlight--
                    resolve({} as unknown as SolidDataset & WithServerResourceInfo)
                })
            })
        })

        const pending = loadMultipleRdfFromPod(mockSession, LISTS_CONTAINER_URL,
            (_ds, url) => ({ id: url, name: '', createdAt: '', items: [] }))

        // Let the container listing settle so the file requests get issued.
        await vi.waitFor(() => expect(release).toHaveLength(urls.length))

        release.forEach(fn => fn())
        const { data, result } = await pending

        expect(peakInFlight).toBe(urls.length)
        expect(result.successCount).toBe(urls.length)
        expect(data).toHaveLength(urls.length)
    })

    it('keeps the loaded items in container order when the requests settle out of order', async () => {
        const urls = ['first', 'second'].map(id => `${LISTS_CONTAINER_URL}${id}.ttl`)
        mockGetContainedResourceUrlAll.mockReturnValueOnce(urls)

        const resolvers = new Map<string, () => void>()
        mockGetSolidDataset.mockImplementation((url: string) => {
            if (url === LISTS_CONTAINER_URL) {
                return Promise.resolve({} as unknown as SolidDataset & WithServerResourceInfo)
            }
            return new Promise(resolve => {
                resolvers.set(url, () => resolve({} as unknown as SolidDataset & WithServerResourceInfo))
            })
        })

        const pending = loadMultipleRdfFromPod(mockSession, LISTS_CONTAINER_URL,
            (_ds, url) => ({ id: url.split('/').pop()!.replace('.ttl', ''), name: '', createdAt: '', items: [] }))

        await vi.waitFor(() => expect(resolvers.size).toBe(urls.length))

        // Second file comes back first — the results must not follow arrival order.
        resolvers.get(urls[1])!()
        resolvers.get(urls[0])!()

        const { data } = await pending

        expect(data.map(l => l.id)).toEqual(['first', 'second'])
    })

    it('still reports the files that failed when others succeed', async () => {
        const urls = ['ok', 'bad'].map(id => `${LISTS_CONTAINER_URL}${id}.ttl`)
        mockGetContainedResourceUrlAll.mockReturnValueOnce(urls)

        mockGetSolidDataset.mockImplementation((url: string) => {
            if (url === LISTS_CONTAINER_URL) {
                return Promise.resolve({} as unknown as SolidDataset & WithServerResourceInfo)
            }
            if (url.endsWith('bad.ttl')) return Promise.reject({ statusCode: 500 })
            return Promise.resolve({} as unknown as SolidDataset & WithServerResourceInfo)
        })

        const onError = vi.fn()
        const { data, result } = await loadMultipleRdfFromPod(mockSession, LISTS_CONTAINER_URL,
            (_ds, url) => ({ id: url, name: '', createdAt: '', items: [] }), onError)

        expect(data).toHaveLength(1)
        expect(result.successCount).toBe(1)
        expect(result.failCount).toBe(1)
        expect(result.success).toBe(false)
        expect(onError).toHaveBeenCalledWith(urls[1], expect.anything())
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
        mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

        const result = await saveMultipleRdfToPod(mockSession, LISTS_CONTAINER_URL, lists, packingListToDataset)

        expect(mockOverwriteFile).toHaveBeenCalledWith(
            expect.stringContaining('list-1.ttl'),
            expect.any(Blob),
            expect.objectContaining({ contentType: 'text/turtle' })
        )
        expect(mockOverwriteFile).toHaveBeenCalledWith(
            expect.stringContaining('list-2.ttl'),
            expect.any(Blob),
            expect.objectContaining({ contentType: 'text/turtle' })
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
        mockOverwriteFile.mockResolvedValue({} as unknown as Response & { internal_resourceInfo: unknown })

        await saveMultipleRdfToPod(mockSession, LISTS_CONTAINER_URL, [activeList], packingListToDataset)

        expect(mockDeleteFile).toHaveBeenCalledWith(orphanUrl, expect.any(Object))
    })
})

// ─── deriveWebIdFromPodUrl ───────────────────────────────────────────────────

describe('deriveWebIdFromPodUrl', () => {
    it('appends /profile/card#me to a pod URL with trailing slash', () => {
        expect(deriveWebIdFromPodUrl('https://alice.solidcommunity.net/')).toBe(
            'https://alice.solidcommunity.net/profile/card#me'
        )
    })

    it('appends /profile/card#me to a pod URL without trailing slash', () => {
        expect(deriveWebIdFromPodUrl('https://alice.solidcommunity.net')).toBe(
            'https://alice.solidcommunity.net/profile/card#me'
        )
    })

    it('works for pod URLs with a path segment', () => {
        expect(deriveWebIdFromPodUrl('http://localhost:4001/alice/')).toBe(
            'http://localhost:4001/alice/profile/card#me'
        )
    })
})

// ─── grantCollaboratorAccess ─────────────────────────────────────────────────

describe('grantCollaboratorAccess', () => {
    const FILE_URL = 'https://alice.solidcommunity.net/pack-me-up/questions.ttl'
    const CONTAINER_URL = 'https://alice.solidcommunity.net/pack-me-up/packing-lists/'
    const COLLAB_WEB_ID = 'https://bob.solidcommunity.net/profile/card#me'
    const ACCESS_MODES = { read: true, write: true, append: true, control: false }
    const mockAcl = {} as never
    const mockResource = {} as never

    beforeEach(() => {
        mockGetResourceInfoWithAcl.mockResolvedValue(mockResource)
        mockHasAccessibleAcl.mockReturnValue(true)
        mockHasResourceAcl.mockReturnValue(true)
        mockGetResourceAcl.mockReturnValue(mockAcl)
        mockSetAgentResourceAccess.mockImplementation((acl: unknown) => acl as never)
        mockSetAgentDefaultAccess.mockImplementation((acl: unknown) => acl as never)
        mockSaveAclFor.mockResolvedValue(mockAcl)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('calls getResourceInfoWithAcl and saveAclFor for a file URL', async () => {
        await grantCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)

        expect(mockGetResourceInfoWithAcl).toHaveBeenCalledWith(FILE_URL, { fetch: mockSession.fetch })
        expect(mockSetAgentResourceAccess).toHaveBeenCalledWith(mockAcl, COLLAB_WEB_ID, ACCESS_MODES)
        expect(mockSetAgentDefaultAccess).not.toHaveBeenCalled()
        expect(mockSaveAclFor).toHaveBeenCalled()
    })

    it('also calls setAgentDefaultAccess for container URLs (URL ends with /)', async () => {
        await grantCollaboratorAccess(mockSession, CONTAINER_URL, COLLAB_WEB_ID)

        expect(mockSetAgentResourceAccess).toHaveBeenCalledWith(mockAcl, COLLAB_WEB_ID, ACCESS_MODES)
        expect(mockSetAgentDefaultAccess).toHaveBeenCalledWith(mockAcl, COLLAB_WEB_ID, ACCESS_MODES)
        expect(mockSaveAclFor).toHaveBeenCalled()
    })

    it('resolves successfully', async () => {
        await expect(grantCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).resolves.toBeUndefined()
    })

    it('throws AuthenticationError on 401', async () => {
        mockGetResourceInfoWithAcl.mockRejectedValue({ statusCode: 401 })

        await expect(grantCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).rejects.toThrow(AuthenticationError)
    })

    it('throws AuthenticationError on 403', async () => {
        mockGetResourceInfoWithAcl.mockRejectedValue({ statusCode: 403 })

        await expect(grantCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).rejects.toThrow(AuthenticationError)
    })

    it('re-throws other errors unchanged', async () => {
        const err = new Error('Network failure')
        mockGetResourceInfoWithAcl.mockRejectedValue(err)

        await expect(grantCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).rejects.toThrow('Network failure')
    })

    it('falls back to ACP path when WAC ACL is not accessible', async () => {
        mockHasAccessibleAcl.mockReturnValue(false)
        vi.mocked(universalAccess.setAgentAccess).mockResolvedValue({ read: true, write: true, append: true, controlRead: false, controlWrite: false })

        await expect(grantCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).resolves.toBeUndefined()
        expect(vi.mocked(universalAccess.setAgentAccess)).toHaveBeenCalledWith(
            FILE_URL, COLLAB_WEB_ID,
            { read: true, write: true, append: true, control: false },
            expect.objectContaining({ fetch: mockSession.fetch })
        )
    })

    it('falls back to ACP path when hasAccessibleAcl is true but no WAC ACL files exist', async () => {
        // This is the Inrupt PodSpaces scenario: Link rel="acl" header present (hasAccessibleAcl true)
        // but the "ACL" is actually an ACP ACR, not a WAC file (hasResourceAcl/hasFallbackAcl false)
        mockHasResourceAcl.mockReturnValue(false)
        mockHasFallbackAcl.mockReturnValue(false)
        vi.mocked(universalAccess.setAgentAccess).mockResolvedValue({ read: true, write: true, append: true, controlRead: false, controlWrite: false })

        await expect(grantCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).resolves.toBeUndefined()
        expect(vi.mocked(universalAccess.setAgentAccess)).toHaveBeenCalledWith(
            FILE_URL, COLLAB_WEB_ID,
            { read: true, write: true, append: true, control: false },
            expect.objectContaining({ fetch: mockSession.fetch })
        )
    })

    it('uses fallback ACL when no resource ACL exists', async () => {
        mockHasResourceAcl.mockReturnValue(false)
        mockHasFallbackAcl.mockReturnValue(true)
        mockCreateAclFromFallbackAcl.mockReturnValue(mockAcl)

        await expect(grantCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).resolves.toBeUndefined()
        expect(mockCreateAclFromFallbackAcl).toHaveBeenCalledWith(mockResource)
    })
})

// ─── revokeCollaboratorAccess ────────────────────────────────────────────────

describe('revokeCollaboratorAccess', () => {
    const FILE_URL = 'https://alice.solidcommunity.net/pack-me-up/questions.ttl'
    const CONTAINER_URL = 'https://alice.solidcommunity.net/pack-me-up/packing-lists/'
    const COLLAB_WEB_ID = 'https://bob.solidcommunity.net/profile/card#me'
    const mockAcl = {} as never
    const mockResource = {} as never

    const NO_ACCESS = { read: false, write: false, append: false, control: false }

    beforeEach(() => {
        mockGetResourceInfoWithAcl.mockResolvedValue(mockResource)
        mockHasResourceAcl.mockReturnValue(true)
        mockHasAccessibleAcl.mockReturnValue(true)
        mockGetResourceAcl.mockReturnValue(mockAcl)
        mockSetAgentResourceAccess.mockImplementation((acl: unknown) => acl as never)
        mockSetAgentDefaultAccess.mockImplementation((acl: unknown) => acl as never)
        mockSaveAclFor.mockResolvedValue(mockAcl)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('calls setAgentResourceAccess with all modes false for a file URL', async () => {
        await revokeCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)

        expect(mockSetAgentResourceAccess).toHaveBeenCalledWith(mockAcl, COLLAB_WEB_ID, NO_ACCESS)
        expect(mockSetAgentDefaultAccess).not.toHaveBeenCalled()
        expect(mockSaveAclFor).toHaveBeenCalled()
    })

    it('also calls setAgentDefaultAccess for container URLs', async () => {
        await revokeCollaboratorAccess(mockSession, CONTAINER_URL, COLLAB_WEB_ID)

        expect(mockSetAgentResourceAccess).toHaveBeenCalledWith(mockAcl, COLLAB_WEB_ID, NO_ACCESS)
        expect(mockSetAgentDefaultAccess).toHaveBeenCalledWith(mockAcl, COLLAB_WEB_ID, NO_ACCESS)
    })

    it('is a no-op when there is no resource ACL', async () => {
        mockHasResourceAcl.mockReturnValue(false)

        await expect(revokeCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).resolves.toBeUndefined()
        expect(mockSaveAclFor).not.toHaveBeenCalled()
    })

    it('throws AuthenticationError on 401', async () => {
        mockGetResourceInfoWithAcl.mockRejectedValue({ statusCode: 401 })

        await expect(revokeCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).rejects.toThrow(AuthenticationError)
    })

    it('throws AuthenticationError on 403', async () => {
        mockGetResourceInfoWithAcl.mockRejectedValue({ statusCode: 403 })

        await expect(revokeCollaboratorAccess(mockSession, FILE_URL, COLLAB_WEB_ID)).rejects.toThrow(AuthenticationError)
    })
})

// ─── grantPublicAccess ───────────────────────────────────────────────────────

describe('grantPublicAccess', () => {
    const FILE_URL = 'https://alice.solidcommunity.net/pack-me-up/packing-lists/abc.ttl'

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('calls setPublicAccess with read, write, and append true', async () => {
        mockSetPublicAccess.mockResolvedValue({ read: true, write: true, append: true, controlRead: false, controlWrite: false })

        await grantPublicAccess(mockSession, FILE_URL)

        expect(mockSetPublicAccess).toHaveBeenCalledWith(
            FILE_URL,
            { read: true, write: true, append: true },
            { fetch: mockSession.fetch }
        )
    })

    it('resolves successfully when setPublicAccess succeeds', async () => {
        mockSetPublicAccess.mockResolvedValue({ read: true, write: true, append: true, controlRead: false, controlWrite: false })

        await expect(grantPublicAccess(mockSession, FILE_URL)).resolves.toBeUndefined()
    })

    it('throws AuthenticationError on 401', async () => {
        mockSetPublicAccess.mockRejectedValue({ statusCode: 401 })

        await expect(grantPublicAccess(mockSession, FILE_URL)).rejects.toThrow(AuthenticationError)
    })

    it('throws AuthenticationError on 403', async () => {
        mockSetPublicAccess.mockRejectedValue({ statusCode: 403 })

        await expect(grantPublicAccess(mockSession, FILE_URL)).rejects.toThrow(AuthenticationError)
    })

    it('re-throws other errors unchanged', async () => {
        const err = new Error('Network failure')
        mockSetPublicAccess.mockRejectedValue(err)

        await expect(grantPublicAccess(mockSession, FILE_URL)).rejects.toThrow('Network failure')
    })

    it('throws a descriptive error when setPublicAccess returns null', async () => {
        mockSetPublicAccess.mockResolvedValue(null)

        await expect(grantPublicAccess(mockSession, FILE_URL)).rejects.toThrow(
            'grantPublicAccess: server does not support access control for this resource'
        )
    })
})

// ─── getCollaborators ────────────────────────────────────────────────────────

describe('getCollaborators', () => {
    const FILE_URL = 'https://alice.solidcommunity.net/pack-me-up/packing-lists/abc.json'

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns empty array when getAgentAccessAll returns null', async () => {
        mockGetAgentAccessAll.mockResolvedValue(null)

        const result = await getCollaborators(mockSession, FILE_URL)

        expect(result).toEqual([])
    })

    it('returns empty array when getAgentAccessAll returns empty object', async () => {
        mockGetAgentAccessAll.mockResolvedValue({})

        const result = await getCollaborators(mockSession, FILE_URL)

        expect(result).toEqual([])
    })

    it('returns WebIDs of agents with read access', async () => {
        mockGetAgentAccessAll.mockResolvedValue({
            'https://bob.solidcommunity.net/profile/card#me': { read: true, write: true, append: true, controlRead: false, controlWrite: false },
        })

        const result = await getCollaborators(mockSession, FILE_URL)

        expect(result).toEqual(['https://bob.solidcommunity.net/profile/card#me'])
    })

    it('excludes agents without read access', async () => {
        mockGetAgentAccessAll.mockResolvedValue({
            'https://bob.solidcommunity.net/profile/card#me': { read: false, write: false, append: false, controlRead: false, controlWrite: false },
        })

        const result = await getCollaborators(mockSession, FILE_URL)

        expect(result).toEqual([])
    })

    it('excludes the session owner webId', async () => {
        mockGetAgentAccessAll.mockResolvedValue({
            [mockSession.info.webId!]: { read: true, write: true, append: true, controlRead: false, controlWrite: false },
            'https://bob.solidcommunity.net/profile/card#me': { read: true, write: false, append: false, controlRead: false, controlWrite: false },
        })

        const result = await getCollaborators(mockSession, FILE_URL)

        expect(result).toEqual(['https://bob.solidcommunity.net/profile/card#me'])
    })

    it('throws AuthenticationError on 401', async () => {
        mockGetAgentAccessAll.mockRejectedValue({ statusCode: 401 })

        await expect(getCollaborators(mockSession, FILE_URL)).rejects.toThrow(AuthenticationError)
    })

    it('throws AuthenticationError on 403', async () => {
        mockGetAgentAccessAll.mockRejectedValue({ statusCode: 403 })

        await expect(getCollaborators(mockSession, FILE_URL)).rejects.toThrow(AuthenticationError)
    })

    it('re-throws other errors unchanged', async () => {
        const err = new Error('Network failure')
        mockGetAgentAccessAll.mockRejectedValue(err)

        await expect(getCollaborators(mockSession, FILE_URL)).rejects.toThrow('Network failure')
    })
})

// ─── getPodOwnerName ─────────────────────────────────────────────────────────

describe('getPodOwnerName', () => {
    const POD = 'https://pod.example.com/'
    const WEB_ID = 'https://pod.example.com/profile/card#me'
    const PROFILE_CARD_URL = 'https://pod.example.com/profile/card'

    it('returns the foaf:name from the profile card', async () => {
        const { buildThing, setThing, createSolidDataset } = await import('@inrupt/solid-client')
        const thing = buildThing({ url: WEB_ID })
            .addStringNoLocale('http://xmlns.com/foaf/0.1/name', 'Alice Smith')
            .build()
        const dataset = setThing(createSolidDataset(), thing)
        mockGetSolidDataset.mockResolvedValueOnce(dataset as unknown as SolidDataset & WithServerResourceInfo)

        const result = await getPodOwnerName(mockSession, POD)

        expect(result).toBe('Alice Smith')
        expect(mockGetSolidDataset).toHaveBeenCalledWith(PROFILE_CARD_URL, expect.objectContaining({ fetch: mockSession.fetch }))
    })

    it('returns null when profile card fetch fails', async () => {
        mockGetSolidDataset.mockRejectedValueOnce(new Error('Not found'))

        const result = await getPodOwnerName(mockSession, POD)

        expect(result).toBeNull()
    })

    it('returns null when profile card has no foaf:name', async () => {
        const { buildThing, setThing, createSolidDataset } = await import('@inrupt/solid-client')
        const thing = buildThing({ url: WEB_ID }).build()
        const dataset = setThing(createSolidDataset(), thing)
        mockGetSolidDataset.mockResolvedValueOnce(dataset as unknown as SolidDataset & WithServerResourceInfo)

        const result = await getPodOwnerName(mockSession, POD)

        expect(result).toBeNull()
    })

    it('uses an explicit WebID instead of deriving from the pod URL', async () => {
        const EXPLICIT_WEB_ID = 'https://id.example.com/alice'
        const { buildThing, setThing, createSolidDataset } = await import('@inrupt/solid-client')
        const thing = buildThing({ url: EXPLICIT_WEB_ID })
            .addStringNoLocale('http://xmlns.com/foaf/0.1/name', 'Alice')
            .build()
        const dataset = setThing(createSolidDataset(), thing)
        mockGetSolidDataset.mockResolvedValueOnce(dataset as unknown as SolidDataset & WithServerResourceInfo)

        const result = await getPodOwnerName(mockSession, POD, EXPLICIT_WEB_ID)

        expect(result).toBe('Alice')
        expect(mockGetSolidDataset).toHaveBeenCalledWith(EXPLICIT_WEB_ID, expect.objectContaining({ fetch: mockSession.fetch }))
    })
})

// ─── friendlyPodName ─────────────────────────────────────────────────────────

describe('friendlyPodName', () => {
    it('strips known service subdomain (storage.) from Inrupt UUID-path pods', () => {
        expect(friendlyPodName('https://storage.inrupt.com/d8c8c02b-b47c-48e9-b737-619f2958689f/')).toBe('inrupt.com')
    })

    it('strips pod. service subdomain', () => {
        expect(friendlyPodName('https://pod.inrupt.com/d8c8c02b-b47c-48e9-b737-619f2958689f/')).toBe('inrupt.com')
    })

    it('returns "segment on hostname" for a meaningful path segment', () => {
        expect(friendlyPodName('https://solidcommunity.net/alice/')).toBe('alice on solidcommunity.net')
    })

    it('treats subdomain as username when it is not a service subdomain', () => {
        expect(friendlyPodName('https://alice.solidcommunity.net/')).toBe('alice on solidcommunity.net')
    })

    it('returns base hostname when there is no path segment and no user subdomain', () => {
        expect(friendlyPodName('https://inrupt.com/')).toBe('inrupt.com')
    })

    it('returns the input unchanged when the URL is invalid', () => {
        expect(friendlyPodName('not-a-url')).toBe('not-a-url')
    })
})

// ─── getPrimaryPodUrl ────────────────────────────────────────────────────────

describe('getPrimaryPodUrl', () => {
    const CSS_WEB_ID = 'http://localhost:4000/testuser/profile/card#me'
    const ESS_WEB_ID = 'https://id.inrupt.com/hannahwprior'
    const ESS_POD_URL = 'https://storage.inrupt.com/d8c8c02b-b47c-48e9-b737-619f2958689f/'

    const sessionFor = (webId: string) => ({
        info: { isLoggedIn: true, webId },
        fetch: vi.fn(),
    } as unknown as Session)

    beforeEach(() => {
        localStorage.clear()
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns null when there is no session', async () => {
        expect(await getPrimaryPodUrl(null)).toBeNull()
    })

    it('returns null when the session is not logged in', async () => {
        const session = { info: { isLoggedIn: false, webId: ESS_WEB_ID }, fetch: vi.fn() } as unknown as Session

        expect(await getPrimaryPodUrl(session)).toBeNull()
        expect(mockGetPodUrlAll).not.toHaveBeenCalled()
    })

    it('uses the storage location advertised in the profile (pim:storage)', async () => {
        mockGetPodUrlAll.mockResolvedValueOnce([ESS_POD_URL])
        const session = sessionFor(ESS_WEB_ID)

        expect(await getPrimaryPodUrl(session)).toBe(ESS_POD_URL)
        expect(mockGetPodUrlAll).toHaveBeenCalledWith(ESS_WEB_ID, expect.objectContaining({ fetch: session.fetch }))
    })

    it('derives the Pod root from a CSS-style WebID when the profile has no pim:storage', async () => {
        mockGetPodUrlAll.mockResolvedValueOnce([])

        expect(await getPrimaryPodUrl(sessionFor(CSS_WEB_ID))).toBe('http://localhost:4000/testuser/')
    })

    it('returns null rather than guessing when an identity-provider WebID has no pim:storage', async () => {
        mockGetPodUrlAll.mockResolvedValueOnce([])

        // https://id.inrupt.com/ hosts identities, not storage — writing there 404s
        expect(await getPrimaryPodUrl(sessionFor(ESS_WEB_ID))).toBeNull()
    })

    it('returns null rather than guessing when the profile cannot be fetched', async () => {
        mockGetPodUrlAll.mockRejectedValueOnce(new TypeError('Failed to fetch'))

        expect(await getPrimaryPodUrl(sessionFor(ESS_WEB_ID))).toBeNull()
    })

    it('falls back to the last known Pod URL when the profile cannot be fetched', async () => {
        mockGetPodUrlAll.mockResolvedValueOnce([ESS_POD_URL])
        const session = sessionFor(ESS_WEB_ID)
        expect(await getPrimaryPodUrl(session)).toBe(ESS_POD_URL)

        mockGetPodUrlAll.mockRejectedValueOnce(new TypeError('Failed to fetch'))

        expect(await getPrimaryPodUrl(session)).toBe(ESS_POD_URL)
    })

    it('reads the WebID profile only once per session', async () => {
        // Resolving the pod URL is a network round trip, and it ran on every
        // save and every poll — for an answer that cannot change under us.
        mockGetPodUrlAll.mockResolvedValue([ESS_POD_URL])
        const session = sessionFor(ESS_WEB_ID)

        expect(await getPrimaryPodUrl(session)).toBe(ESS_POD_URL)
        expect(await getPrimaryPodUrl(session)).toBe(ESS_POD_URL)
        expect(await getPrimaryPodUrl(session)).toBe(ESS_POD_URL)

        expect(mockGetPodUrlAll).toHaveBeenCalledOnce()
    })

    it('resolves the profile once when several callers ask at the same time', async () => {
        // Opening the app fires a burst of these at once (page load, poll, save).
        mockGetPodUrlAll.mockResolvedValue([ESS_POD_URL])
        const session = sessionFor(ESS_WEB_ID)

        const results = await Promise.all([
            getPrimaryPodUrl(session),
            getPrimaryPodUrl(session),
            getPrimaryPodUrl(session),
        ])

        expect(results).toEqual([ESS_POD_URL, ESS_POD_URL, ESS_POD_URL])
        expect(mockGetPodUrlAll).toHaveBeenCalledOnce()
    })

    it('retries after a failure rather than caching the failure', async () => {
        mockGetPodUrlAll.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        const session = sessionFor(ESS_WEB_ID)
        expect(await getPrimaryPodUrl(session)).toBeNull()

        mockGetPodUrlAll.mockResolvedValueOnce([ESS_POD_URL])
        expect(await getPrimaryPodUrl(session)).toBe(ESS_POD_URL)
    })

    it('does not reuse another user\'s cached Pod URL', async () => {
        mockGetPodUrlAll.mockResolvedValueOnce([ESS_POD_URL])
        expect(await getPrimaryPodUrl(sessionFor(ESS_WEB_ID))).toBe(ESS_POD_URL)

        mockGetPodUrlAll.mockRejectedValueOnce(new TypeError('Failed to fetch'))

        expect(await getPrimaryPodUrl(sessionFor('https://id.inrupt.com/someoneelse'))).toBeNull()
    })
})

// ─── derivePodUrlFromWebId ───────────────────────────────────────────────────

describe('derivePodUrlFromWebId', () => {
    it('strips the profile document path from a WebID stored inside its Pod', () => {
        expect(derivePodUrlFromWebId('http://localhost:4000/testuser/profile/card#me'))
            .toBe('http://localhost:4000/testuser/')
    })

    it('handles a WebID at the root of a per-user host', () => {
        expect(derivePodUrlFromWebId('https://alice.solidcommunity.net/profile/card#me'))
            .toBe('https://alice.solidcommunity.net/')
    })

    it('returns null for an identity-provider WebID that says nothing about storage', () => {
        expect(derivePodUrlFromWebId('https://id.inrupt.com/hannahwprior')).toBeNull()
    })

    it('returns null for an invalid URL', () => {
        expect(derivePodUrlFromWebId('not-a-url')).toBeNull()
    })
})
