import PouchDB from 'pouchdb'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList } from '../create-packing-list/types'

export type DocumentType = 'question-set' | 'packing-list'

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

export type AppDocument = QuestionSetDocument | PackingListDocument

export class PackingAppDatabase {
    private db: PouchDB.Database<AppDocument>
    private static instance: PackingAppDatabase
    private currentDbName: string

    private constructor(dbName: string = 'packing-app-data') {
        this.currentDbName = dbName
        this.db = new PouchDB<AppDocument>(dbName)
        console.log('Consolidated PouchDB instance created:', {
            name: this.db.name,
            timestamp: new Date().toISOString()
        })
    }

    public static getInstance(): PackingAppDatabase {
        if (!PackingAppDatabase.instance) {
            PackingAppDatabase.instance = new PackingAppDatabase()
        }
        return PackingAppDatabase.instance
    }

    /**
     * Switches to a different database. This closes the current database
     * and opens a new one with the specified name.
     */
    public async switchDatabase(dbName: string): Promise<void> {
        if (this.currentDbName === dbName) {
            console.log('Already using database:', dbName)
            return
        }

        console.log('Switching database from', this.currentDbName, 'to', dbName)

        // Close the current database
        await this.db.close()

        // Open the new database
        this.currentDbName = dbName
        this.db = new PouchDB<AppDocument>(dbName)

        console.log('Switched to database:', {
            name: this.db.name,
            timestamp: new Date().toISOString()
        })
    }

    /**
     * Gets the current database name
     */
    public getCurrentDatabaseName(): string {
        return this.currentDbName
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
        } catch (err: any) {
            if (err.name === 'not_found') {
                throw { name: 'not_found', message: 'Question set not found' }
            }
            throw err
        }
    }

    public async saveQuestionSet(questionSet: PackingListQuestionSet): Promise<{ rev: string }> {
        const docId = 'question-set:1'
        const now = new Date().toISOString()

        try {
            let existingDoc: QuestionSetDocument | undefined
            try {
                const doc = await this.db.get(docId)
                if (doc.docType === 'question-set') {
                    existingDoc = doc
                }
            } catch (err: any) {
                if (err.name !== 'not_found') {
                    throw err
                }
            }

            const docToSave: QuestionSetDocument = {
                _id: docId,
                _rev: questionSet._rev || existingDoc?._rev,
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
            console.error('Error saving question set:', err)
            throw err
        }
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
        } catch (err: any) {
            if (err.name === 'not_found') {
                throw { name: 'not_found', message: 'Packing list not found' }
            }
            throw err
        }
    }

    public async savePackingList(packingList: PackingList): Promise<{ rev: string }> {
        const docId = `packing-list:${packingList.id}`
        const now = new Date().toISOString()

        try {
            let existingDoc: PackingListDocument | undefined
            try {
                const doc = await this.db.get(docId)
                if (doc.docType === 'packing-list') {
                    existingDoc = doc
                }
            } catch (err: any) {
                if (err.name !== 'not_found') {
                    throw err
                }
            }

            const docToSave: PackingListDocument = {
                _id: docId,
                _rev: packingList._rev || existingDoc?._rev,
                docType: 'packing-list',
                createdAt: existingDoc?.createdAt || now,
                updatedAt: now,
                data: {
                    name: packingList.name,
                    createdAt: packingList.createdAt,
                    items: packingList.items
                }
            }

            const result = await this.db.put(docToSave)
            return { rev: result.rev }
        } catch (err) {
            console.error('Error saving packing list:', err)
            throw err
        }
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
                        items: row.doc.data.items
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
            } catch (err: any) {
                if (err.name !== 'not_found') {
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
            } catch (err: any) {
                if (err.name !== 'not_found') {
                    console.warn('Could not migrate packing lists:', err)
                }
            }

            return { migrated: true, questionSets, packingLists }
        } catch (err) {
            console.error('Migration failed:', err)
            throw err
        }
    }

    /**
     * Gets the question set with metadata (including updatedAt timestamp)
     */
    public async getQuestionSetWithMetadata(): Promise<(PackingListQuestionSet & { updatedAt: string }) | null> {
        try {
            const doc = await this.db.get('question-set:1')
            if (doc.docType !== 'question-set') {
                throw new Error('Invalid document type for question set')
            }
            return {
                _id: '1',
                _rev: doc._rev,
                ...doc.data,
                updatedAt: doc.updatedAt
            }
        } catch (err: any) {
            if (err.name === 'not_found') {
                return null
            }
            throw err
        }
    }

    /**
     * Gets all packing lists with metadata (including updatedAt timestamps)
     */
    public async getAllPackingListsWithMetadata(): Promise<(PackingList & { updatedAt: string })[]> {
        try {
            const result = await this.db.allDocs({
                include_docs: true,
                startkey: 'packing-list:',
                endkey: 'packing-list:\ufff0'
            })

            const packingLists: (PackingList & { updatedAt: string })[] = []

            for (const row of result.rows) {
                if (row.doc && row.doc.docType === 'packing-list') {
                    const packingListId = row.id.replace('packing-list:', '')
                    const packingList: PackingList & { updatedAt: string } = {
                        id: packingListId,
                        _rev: row.doc._rev,
                        name: row.doc.data.name,
                        createdAt: row.doc.data.createdAt,
                        items: row.doc.data.items,
                        updatedAt: row.doc.updatedAt
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
     * Checks if the current database is empty (no documents)
     */
    public async isEmpty(): Promise<boolean> {
        try {
            const result = await this.db.allDocs({ limit: 1 })
            return result.rows.length === 0
        } catch (err) {
            console.error('Error checking if database is empty:', err)
            throw err
        }
    }

    /**
     * Exports all data from the current database
     */
    public async exportAllData(): Promise<{ questionSet?: PackingListQuestionSet & { updatedAt?: string }, packingLists: (PackingList & { updatedAt?: string })[] }> {
        const data: { questionSet?: PackingListQuestionSet & { updatedAt?: string }, packingLists: (PackingList & { updatedAt?: string })[] } = {
            packingLists: []
        }

        try {
            // Export question set with timestamp
            try {
                const doc = await this.db.get('question-set:1')
                if (doc.docType === 'question-set') {
                    data.questionSet = {
                        _id: '1',
                        _rev: doc._rev,
                        ...doc.data,
                        updatedAt: doc.updatedAt
                    }
                }
            } catch (err: any) {
                if (err.name !== 'not_found') {
                    console.warn('Could not export question set:', err)
                }
            }

            // Export all packing lists with timestamps
            const result = await this.db.allDocs({
                include_docs: true,
                startkey: 'packing-list:',
                endkey: 'packing-list:\ufff0'
            })

            for (const row of result.rows) {
                if (row.doc && row.doc.docType === 'packing-list') {
                    const packingListId = row.id.replace('packing-list:', '')
                    const packingList: PackingList & { updatedAt?: string } = {
                        id: packingListId,
                        _rev: row.doc._rev,
                        name: row.doc.data.name,
                        createdAt: row.doc.data.createdAt,
                        items: row.doc.data.items,
                        updatedAt: row.doc.updatedAt
                    }
                    data.packingLists.push(packingList)
                }
            }

            return data
        } catch (err) {
            console.error('Error exporting data:', err)
            throw err
        }
    }

    /**
     * Imports data into the current database
     */
    public async importData(data: { questionSet?: PackingListQuestionSet, packingLists: PackingList[] }): Promise<{ questionSets: number, packingLists: number }> {
        let questionSets = 0
        let packingLists = 0

        try {
            // Import question set if it exists
            if (data.questionSet) {
                // Remove _rev to avoid conflicts when importing to a new database
                const { _rev, ...questionSetWithoutRev } = data.questionSet
                await this.saveQuestionSet(questionSetWithoutRev as PackingListQuestionSet)
                questionSets = 1
                console.log('Imported question set successfully')
            }

            // Import packing lists
            for (const packingList of data.packingLists) {
                // Remove _rev to avoid conflicts when importing to a new database
                const { _rev, ...packingListWithoutRev } = packingList
                await this.savePackingList(packingListWithoutRev as PackingList)
                packingLists++
            }
            console.log(`Imported ${packingLists} packing lists successfully`)

            return { questionSets, packingLists }
        } catch (err) {
            console.error('Error importing data:', err)
            throw err
        }
    }

    public getInfo() {
        return this.db.info()
    }
}

export const packingAppDb = PackingAppDatabase.getInstance()