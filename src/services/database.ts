import PouchDB from 'pouchdb'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList } from '../create-packing-list/types'
import type { SharedWithMeList, SharedListsWithMe } from './rdfSerialization'

export type DocumentType = 'question-set' | 'packing-list' | 'shared-with-me' | 'shared-lists-with-me'

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
    data: Omit<PackingList, 'id'>
}

export interface SharedWithMeDocument extends BaseDocument {
    docType: 'shared-with-me'
    data: SharedWithMeList
}

export interface SharedListsWithMeDocument extends BaseDocument {
    docType: 'shared-lists-with-me'
    data: SharedListsWithMe
}

export type AppDocument = QuestionSetDocument | PackingListDocument | SharedWithMeDocument | SharedListsWithMeDocument

/**
 * Namespace used when the user is not logged into a pod.
 * Data saved here is local to this browser only.
 */
export const LOCAL_NAMESPACE = 'local'

function hasName(err: unknown): err is { name: string } {
    return typeof err === 'object' && err !== null && 'name' in err
}

export class PackingAppDatabase {
    private db: PouchDB.Database<AppDocument>
    private static instances: Map<string, PackingAppDatabase> = new Map()

    private constructor(namespace: string) {
        this.db = new PouchDB<AppDocument>(`packing-app-data--${namespace}`)
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
                _id: '1',
                _rev: doc._rev,
                ...doc.data
            }
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') {
                throw { name: 'not_found', message: 'Question set not found' }
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
                    data: {
                        people: questionSet.people,
                        alwaysNeededItems: questionSet.alwaysNeededItems,
                        questions: questionSet.questions
                    }
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
                id,
                _rev: doc._rev,
                ...doc.data
            }
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') {
                throw { name: 'not_found', message: 'Packing list not found' }
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
                    data: {
                        name: packingList.name,
                        createdAt: packingList.createdAt,
                        lastModified: packingList.lastModified,
                        sharedFromPodUrl: packingList.sharedFromPodUrl,
                        ownerWebId: packingList.ownerWebId,
                        items: packingList.items,
                        deletedItems: packingList.deletedItems,
                        guests: packingList.guests,
                    }
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
                    const packingList: PackingList = {
                        id: packingListId,
                        _rev: row.doc._rev,
                        name: row.doc.data.name,
                        createdAt: row.doc.data.createdAt,
                        lastModified: row.doc.data.lastModified,
                        sharedFromPodUrl: row.doc.data.sharedFromPodUrl,
                        ownerWebId: row.doc.data.ownerWebId,
                        items: row.doc.data.items,
                        deletedItems: row.doc.data.deletedItems,
                        guests: row.doc.data.guests,
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

    public async deletePackingList(id: string): Promise<void> {
        try {
            const doc = await this.db.get(`packing-list:${id}`)
            await this.db.remove(doc)
        } catch (err) {
            console.error('Error deleting packing list:', err)
            throw err
        }
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
                throw { name: 'not_found', message: 'SharedWithMe not found' }
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
                throw { name: 'not_found', message: 'SharedListsWithMe not found' }
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
        const legacyQuestionDb = new PouchDB('packing-list-question-set')
        const legacyPackingListsDb = new PouchDB('packing-lists')

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
    }
}
