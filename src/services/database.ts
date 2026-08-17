import PouchDB from 'pouchdb'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList } from '../create-packing-list/types'
import type { SharedWithMeList, SharedListsWithMe, DeletedPackingLists } from './rdfSerialization'
import { emptyDeletedPackingLists, withDeletion } from '../utils/packingListDeletions'

export type DocumentType = 'question-set' | 'packing-list' | 'shared-with-me' | 'shared-lists-with-me' | 'deleted-packing-lists'

export interface BaseDocument {
    _id: string
    _rev?: string
    docType: DocumentType
    createdAt: string
    updatedAt: string
}

export interface QuestionSetDocument extends BaseDocument {
    docType: 'question-set'
    data: Omit<PackingListQuestionSet, '_id' | '_rev'>
}

export interface PackingListDocument extends BaseDocument {
    docType: 'packing-list'
    data: Omit<PackingList, 'id' | '_rev'>
}

export interface SharedWithMeDocument extends BaseDocument {
    docType: 'shared-with-me'
    data: SharedWithMeList
}

export interface SharedListsWithMeDocument extends BaseDocument {
    docType: 'shared-lists-with-me'
    data: SharedListsWithMe
}

export interface DeletedPackingListsDocument extends BaseDocument {
    docType: 'deleted-packing-lists'
    data: DeletedPackingLists
}

export type AppDocument = QuestionSetDocument | PackingListDocument | SharedWithMeDocument | SharedListsWithMeDocument | DeletedPackingListsDocument

/**
 * Namespace used when the user is not logged into a pod.
 * Data saved here is local to this browser only.
 */
export const LOCAL_NAMESPACE = 'local'

/** Every database this app creates is named `packing-app-data--<namespace>`. */
export const DATABASE_NAME_PREFIX = 'packing-app-data--'

export function databaseNameForNamespace(namespace: string): string {
    return `${DATABASE_NAME_PREFIX}${namespace}`
}

/**
 * Pre-namespace database names, still present on devices that used the app
 * before `migrateFromLegacyDatabases` moved their contents across. Migration
 * copies rather than deletes, so these survive and must be cleaned up by
 * anything claiming to delete all local data.
 */
export const LEGACY_DATABASE_NAMES = ['packing-list-question-set', 'packing-lists'] as const

function hasName(err: unknown): err is { name: string } {
    return typeof err === 'object' && err !== null && 'name' in err
}

/**
 * Thrown when a document isn't in the local database.
 *
 * A real Error rather than an object literal: a plain `{ name, message }` that
 * reaches `Sentry.captureException` is reported as "Object captured as
 * exception with keys: message, name" — no message, no app stack frames,
 * nothing to act on. `name` stays `'not_found'` so that PouchDB's own
 * `err.name === 'not_found'` convention, which callers across the app check
 * against, keeps working unchanged.
 */
export class NotFoundError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'not_found'
    }
}

/**
 * Builds a document's `data` payload from an entity by *omitting* the keys the
 * document itself owns (`id` / `_id` / `_rev`), plus any explicitly-undefined
 * values so absent fields stay absent in PouchDB.
 *
 * Deliberately an omit-list rather than an allowlist: an allowlist has to be
 * remembered every time a field is added to the type, and forgetting it drops
 * the field silently, with no type error. That is exactly what happened to
 * `nights`, `questionAnswers` and `selectedPeopleIds` (#260). Derived this way,
 * new fields are persisted by default.
 */
function toDocumentData<T extends object, K extends keyof T & string>(
    entity: T,
    omitKeys: readonly K[]
): Omit<T, K> {
    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(entity)) {
        if ((omitKeys as readonly string[]).includes(key)) continue
        if (value === undefined) continue
        data[key] = value
    }
    return data as Omit<T, K>
}

export class PackingAppDatabase {
    private db: PouchDB.Database<AppDocument>
    private static instances: Map<string, PackingAppDatabase> = new Map()

    private constructor(namespace: string) {
        this.db = new PouchDB<AppDocument>(databaseNameForNamespace(namespace))
        console.log('PouchDB instance created:', {
            name: this.db.name,
            namespace,
            timestamp: new Date().toISOString()
        })
    }

    /**
     * Returns the database instance for the given namespace.
     * Use LOCAL_NAMESPACE for anonymous (not logged in) users.
     * Use sanitizePodUrl(podUrl) for logged-in users.
     *
     * The same instance is returned for the same namespace (cached).
     */
    public static getInstance(namespace: string): PackingAppDatabase {
        if (!PackingAppDatabase.instances.has(namespace)) {
            PackingAppDatabase.instances.set(namespace, new PackingAppDatabase(namespace))
        }
        return PackingAppDatabase.instances.get(namespace)!
    }

    /**
     * Drops every cached instance, so the next `getInstance` call opens a fresh
     * handle. Needed after the underlying databases are destroyed — a cached
     * instance would otherwise keep serving a database that no longer exists.
     */
    public static forgetAllInstances(): void {
        PackingAppDatabase.instances.clear()
    }

    /**
     * Converts a pod URL into a safe, human-readable database namespace.
     * Example: 'https://timgent.solidcommunity.net/' -> 'timgent.solidcommunity.net'
     */
    public static sanitizePodUrl(podUrl: string): string {
        return podUrl
            .replace(/^https?:\/\//, '')  // strip protocol
            .replace(/\/+$/, '')           // strip trailing slashes
            .replace(/\//g, '_')           // replace remaining slashes with underscores
    }


    public async getQuestionSet(): Promise<PackingListQuestionSet> {
        try {
            const doc = await this.db.get('question-set:1')
            if (doc.docType !== 'question-set') {
                throw new Error('Invalid document type for question set')
            }
            return {
                ...doc.data,
                _id: '1',
                _rev: doc._rev,
            }
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') {
                throw new NotFoundError('Question set not found')
            }
            throw err
        }
    }

    public async saveQuestionSet(questionSet: PackingListQuestionSet): Promise<{ rev: string }> {
        const docId = 'question-set:1'
        const now = new Date().toISOString()
        const MAX_RETRIES = 3

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                let existingDoc: QuestionSetDocument | undefined
                try {
                    const doc = await this.db.get(docId)
                    if (doc.docType === 'question-set') {
                        existingDoc = doc
                    }
                } catch (err: unknown) {
                    if (!hasName(err) || err.name !== 'not_found') {
                        throw err
                    }
                }

                const docToSave: QuestionSetDocument = {
                    _id: docId,
                    // Always use the freshly-fetched _rev to avoid stale-rev conflicts.
                    // The component state _rev can lag behind PouchDB while a pod save is
                    // still in-flight, causing 409s on rapid question-set updates.
                    _rev: existingDoc?._rev,
                    docType: 'question-set',
                    createdAt: existingDoc?.createdAt || now,
                    updatedAt: now,
                    data: toDocumentData(questionSet, ['_id', '_rev'])
                }

                const result = await this.db.put(docToSave)
                return { rev: result.rev }
            } catch (err) {
                if (hasName(err) && err.name === 'conflict' && attempt < MAX_RETRIES) {
                    continue
                }
                console.error('Error saving question set:', err)
                throw err
            }
        }
        throw new Error('saveQuestionSet: max retries exceeded')
    }

    public async getPackingList(id: string): Promise<PackingList> {
        try {
            const doc = await this.db.get(`packing-list:${id}`)
            if (doc.docType !== 'packing-list') {
                throw new Error('Invalid document type for packing list')
            }
            return {
                ...doc.data,
                id,
                _rev: doc._rev,
            }
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') {
                throw new NotFoundError('Packing list not found')
            }
            throw err
        }
    }

    public async savePackingList(packingList: PackingList): Promise<{ rev: string }> {
        const docId = `packing-list:${packingList.id}`
        const now = new Date().toISOString()
        const MAX_RETRIES = 3

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                let existingDoc: PackingListDocument | undefined
                try {
                    const doc = await this.db.get(docId)
                    if (doc.docType === 'packing-list') {
                        existingDoc = doc
                    }
                } catch (err: unknown) {
                    if (!hasName(err) || err.name !== 'not_found') {
                        throw err
                    }
                }

                const docToSave: PackingListDocument = {
                    _id: docId,
                    // Always use the freshly-fetched _rev to avoid stale-rev conflicts.
                    // The component state _rev can lag behind PouchDB while a pod save is
                    // still in-flight, causing 409s on rapid checkbox toggles.
                    _rev: existingDoc?._rev,
                    docType: 'packing-list',
                    createdAt: existingDoc?.createdAt || now,
                    updatedAt: now,
                    data: toDocumentData(packingList, ['id', '_rev'])
                }

                const result = await this.db.put(docToSave)
                return { rev: result.rev }
            } catch (err) {
                if (hasName(err) && err.name === 'conflict' && attempt < MAX_RETRIES) {
                    continue
                }
                console.error('Error saving packing list:', err)
                throw err
            }
        }
        throw new Error('savePackingList: max retries exceeded')
    }

    public async getAllPackingLists(): Promise<PackingList[]> {
        try {
            const result = await this.db.allDocs({
                include_docs: true,
                startkey: 'packing-list:',
                endkey: 'packing-list:\ufff0'
            })

            const packingLists: PackingList[] = []

            for (const row of result.rows) {
                if (row.doc && row.doc.docType === 'packing-list') {
                    const packingListId = row.id.replace('packing-list:', '')
                    // Spread the whole stored payload — see toDocumentData — so
                    // reading can't drop a field the write kept (#260).
                    const packingList: PackingList = {
                        ...row.doc.data,
                        id: packingListId,
                        _rev: row.doc._rev,
                    }
                    packingLists.push(packingList)
                }
            }

            return packingLists.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        } catch (err) {
            console.error('Error fetching all packing lists:', err)
            throw err
        }
    }

    /**
     * Removes a packing list and, by default, records a tombstone for it.
     *
     * The tombstone is what stops another device that still holds the list from
     * treating it as "local-only, never uploaded" and pushing it back to the pod
     * Recording is the default precisely so a new caller cannot forget
     * it; pass `recordDeletion: false` only for a list whose id is not ours to
     * tombstone — a cached copy of somebody else's shared list, whose id lives
     * in their pod and may legitimately come back.
     */
    public async deletePackingList(
        id: string,
        options: { recordDeletion?: boolean } = {}
    ): Promise<void> {
        const { recordDeletion = true } = options
        try {
            const doc = await this.db.get(`packing-list:${id}`)
            await this.db.remove(doc)
        } catch (err) {
            console.error('Error deleting packing list:', err)
            throw err
        }
        if (recordDeletion) {
            await this.recordPackingListDeletion(id)
        }
    }

    /**
     * Returns the deletion tombstones for this namespace.
     *
     * Unlike the other getters this resolves to an empty registry rather than
     * throwing when nothing has been written: having deleted nothing yet is the
     * normal state, and every caller would otherwise have to catch not_found.
     */
    public async getDeletedPackingLists(): Promise<DeletedPackingLists> {
        try {
            const doc = await this.db.get('deleted-packing-lists:1')
            if (doc.docType !== 'deleted-packing-lists') {
                throw new Error('Invalid document type for deleted-packing-lists')
            }
            return doc.data
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') {
                return emptyDeletedPackingLists()
            }
            throw err
        }
    }

    public async saveDeletedPackingLists(data: DeletedPackingLists): Promise<{ rev: string }> {
        const docId = 'deleted-packing-lists:1'
        const now = new Date().toISOString()
        const MAX_RETRIES = 3

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                let existingDoc: DeletedPackingListsDocument | undefined
                try {
                    const doc = await this.db.get(docId)
                    if (doc.docType === 'deleted-packing-lists') {
                        existingDoc = doc
                    }
                } catch (err: unknown) {
                    if (!hasName(err) || err.name !== 'not_found') {
                        throw err
                    }
                }

                const docToSave: DeletedPackingListsDocument = {
                    _id: docId,
                    _rev: existingDoc?._rev,
                    docType: 'deleted-packing-lists',
                    createdAt: existingDoc?.createdAt || now,
                    updatedAt: now,
                    data,
                }

                const result = await this.db.put(docToSave)
                return { rev: result.rev }
            } catch (err) {
                if (hasName(err) && err.name === 'conflict' && attempt < MAX_RETRIES) {
                    continue
                }
                console.error('Error saving deleted packing lists:', err)
                throw err
            }
        }
        throw new Error('saveDeletedPackingLists: max retries exceeded')
    }

    public async recordPackingListDeletion(
        id: string,
        deletedAt: string = new Date().toISOString()
    ): Promise<void> {
        const registry = await this.getDeletedPackingLists()
        await this.saveDeletedPackingLists(withDeletion(registry, id, deletedAt))
    }

    public async getSharedWithMe(): Promise<SharedWithMeList> {
        try {
            const doc = await this.db.get('shared-with-me:1')
            if (doc.docType !== 'shared-with-me') {
                throw new Error('Invalid document type for shared-with-me')
            }
            return doc.data
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') {
                throw new NotFoundError('SharedWithMe not found')
            }
            throw err
        }
    }

    public async saveSharedWithMe(list: SharedWithMeList): Promise<{ rev: string }> {
        const docId = 'shared-with-me:1'
        const now = new Date().toISOString()
        const MAX_RETRIES = 3

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                let existingDoc: SharedWithMeDocument | undefined
                try {
                    const doc = await this.db.get(docId)
                    if (doc.docType === 'shared-with-me') {
                        existingDoc = doc
                    }
                } catch (err: unknown) {
                    if (!hasName(err) || err.name !== 'not_found') {
                        throw err
                    }
                }

                const docToSave: SharedWithMeDocument = {
                    _id: docId,
                    _rev: existingDoc?._rev,
                    docType: 'shared-with-me',
                    createdAt: existingDoc?.createdAt || now,
                    updatedAt: now,
                    data: list,
                }

                const result = await this.db.put(docToSave)
                return { rev: result.rev }
            } catch (err) {
                if (hasName(err) && err.name === 'conflict' && attempt < MAX_RETRIES) {
                    continue
                }
                console.error('Error saving shared-with-me:', err)
                throw err
            }
        }
        throw new Error('saveSharedWithMe: max retries exceeded')
    }

    public async getSharedListsWithMe(): Promise<SharedListsWithMe> {
        try {
            const doc = await this.db.get('shared-lists-with-me:1')
            if (doc.docType !== 'shared-lists-with-me') {
                throw new Error('Invalid document type for shared-lists-with-me')
            }
            return doc.data
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') {
                throw new NotFoundError('SharedListsWithMe not found')
            }
            throw err
        }
    }

    public async saveSharedListsWithMe(data: SharedListsWithMe): Promise<{ rev: string }> {
        const docId = 'shared-lists-with-me:1'
        const now = new Date().toISOString()
        const MAX_RETRIES = 3

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                let existingDoc: SharedListsWithMeDocument | undefined
                try {
                    const doc = await this.db.get(docId)
                    if (doc.docType === 'shared-lists-with-me') {
                        existingDoc = doc
                    }
                } catch (err: unknown) {
                    if (!hasName(err) || err.name !== 'not_found') {
                        throw err
                    }
                }

                const docToSave: SharedListsWithMeDocument = {
                    _id: docId,
                    _rev: existingDoc?._rev,
                    docType: 'shared-lists-with-me',
                    createdAt: existingDoc?.createdAt || now,
                    updatedAt: now,
                    data,
                }

                const result = await this.db.put(docToSave)
                return { rev: result.rev }
            } catch (err) {
                if (hasName(err) && err.name === 'conflict' && attempt < MAX_RETRIES) {
                    continue
                }
                console.error('Error saving shared-lists-with-me:', err)
                throw err
            }
        }
        throw new Error('saveSharedListsWithMe: max retries exceeded')
    }

    public async migrateFromLegacyDatabases(): Promise<{ migrated: boolean, questionSets: number, packingLists: number }> {
        const [legacyQuestionDbName, legacyPackingListsDbName] = LEGACY_DATABASE_NAMES
        const legacyQuestionDb = new PouchDB(legacyQuestionDbName)
        const legacyPackingListsDb = new PouchDB(legacyPackingListsDbName)

        let questionSets = 0
        let packingLists = 0

        try {
            try {
                const questionSet = await legacyQuestionDb.get<PackingListQuestionSet>('1')
                await this.saveQuestionSet(questionSet)
                questionSets = 1
                console.log('Migrated question set successfully')
            } catch (err: unknown) {
                if (!hasName(err) || err.name !== 'not_found') {
                    console.warn('Could not migrate question set:', err)
                }
            }

            try {
                const result = await legacyPackingListsDb.allDocs<PackingList>({ include_docs: true })
                for (const row of result.rows) {
                    if (row.doc) {
                        await this.savePackingList(row.doc)
                        packingLists++
                    }
                }
                console.log(`Migrated ${packingLists} packing lists successfully`)
            } catch (err: unknown) {
                if (!hasName(err) || err.name !== 'not_found') {
                    console.warn('Could not migrate packing lists:', err)
                }
            }

            return { migrated: true, questionSets, packingLists }
        } catch (err) {
            console.error('Migration failed:', err)
            throw err
        }
    }

    public getInfo() {
        return this.db.info()
    }

    public async isEmpty(): Promise<boolean> {
        const info = await this.getInfo()
        return info.doc_count === 0
    }

    public async copyAllDataFrom(source: PackingAppDatabase): Promise<void> {
        try {
            const questionSet = await source.getQuestionSet()
            await this.saveQuestionSet({ ...questionSet, _rev: undefined })
        } catch (err: unknown) {
            if (!hasName(err) || err.name !== 'not_found') throw err
        }

        const lists = await source.getAllPackingLists()
        for (const list of lists) {
            await this.savePackingList({ ...list, _rev: undefined })
        }

        // Tombstones travel with the data: dropping them here would let the
        // copied-into namespace re-upload lists the user has already deleted.
        const deletions = await source.getDeletedPackingLists()
        if (deletions.deletions.length > 0) {
            await this.saveDeletedPackingLists(deletions)
        }
    }
}
