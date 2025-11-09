import PouchDB from 'pouchdb'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList } from '../create-packing-list/types'
import { packingAppDb } from './database'

export interface MigrationResult {
    success: boolean
    questionSetsFound: number
    questionSetsMigrated: number
    packingListsFound: number
    packingListsMigrated: number
    errors: string[]
    backupCreated: boolean
}

export interface BackupData {
    questionSets: PackingListQuestionSet[]
    packingLists: PackingList[]
    timestamp: string
    version: string
}

export class DatabaseMigration {
    private static readonly BACKUP_KEY = 'packing-app-backup'

    public static async createBackup(): Promise<BackupData> {
        const legacyQuestionDb = new PouchDB('packing-list-question-set')
        const legacyPackingListsDb = new PouchDB('packing-lists')

        const backup: BackupData = {
            questionSets: [],
            packingLists: [],
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        }

        try {
            const questionSet = await legacyQuestionDb.get<PackingListQuestionSet>('1')
            backup.questionSets.push(questionSet)
        } catch (err: unknown) {
            const error = err as { name?: string };
            if (error.name !== 'not_found') {
                console.warn('Could not backup question set:', err)
            }
        }

        try {
            const result = await legacyPackingListsDb.allDocs<PackingList>({ include_docs: true })
            for (const row of result.rows) {
                if (row.doc) {
                    backup.packingLists.push(row.doc)
                }
            }
        } catch (err: unknown) {
            console.warn('Could not backup packing lists:', err)
        }

        localStorage.setItem(DatabaseMigration.BACKUP_KEY, JSON.stringify(backup))
        console.log('Backup created successfully:', {
            questionSets: backup.questionSets.length,
            packingLists: backup.packingLists.length,
            timestamp: backup.timestamp
        })

        return backup
    }

    public static getBackup(): BackupData | null {
        try {
            const backupStr = localStorage.getItem(DatabaseMigration.BACKUP_KEY)
            if (!backupStr) return null
            return JSON.parse(backupStr) as BackupData
        } catch (err) {
            console.error('Error retrieving backup:', err)
            return null
        }
    }

    public static async restoreFromBackup(): Promise<boolean> {
        const backup = DatabaseMigration.getBackup()
        if (!backup) {
            throw new Error('No backup found')
        }

        const legacyQuestionDb = new PouchDB('packing-list-question-set')
        const legacyPackingListsDb = new PouchDB('packing-lists')

        try {
            for (const questionSet of backup.questionSets) {
                await legacyQuestionDb.put({
                    _id: '1',
                    ...questionSet
                })
            }

            for (const packingList of backup.packingLists) {
                await legacyPackingListsDb.put({
                    _id: packingList.id,
                    ...packingList
                })
            }

            console.log('Backup restored successfully')
            return true
        } catch (err) {
            console.error('Error restoring backup:', err)
            throw err
        }
    }

    public static async checkMigrationNeeded(): Promise<{ needed: boolean, hasLegacyData: boolean, hasNewData: boolean }> {
        const legacyQuestionDb = new PouchDB('packing-list-question-set')
        const legacyPackingListsDb = new PouchDB('packing-lists')

        let hasLegacyData = false
        let hasNewData = false

        try {
            await legacyQuestionDb.get('1')
            hasLegacyData = true
        } catch (err: unknown) {
            const error = err as { name?: string };
            if (error.name !== 'not_found') {
                console.warn('Error checking legacy question set:', err)
            }
        }

        try {
            const result = await legacyPackingListsDb.allDocs({ limit: 1 })
            if (result.rows.length > 0) {
                hasLegacyData = true
            }
        } catch (err) {
            console.warn('Error checking legacy packing lists:', err)
        }

        try {
            await packingAppDb.getQuestionSet()
            hasNewData = true
        } catch (err: unknown) {
            const error = err as { name?: string };
            if (error.name !== 'not_found') {
                console.warn('Error checking new question set:', err)
            }
        }

        try {
            const lists = await packingAppDb.getAllPackingLists()
            if (lists.length > 0) {
                hasNewData = true
            }
        } catch (err) {
            console.warn('Error checking new packing lists:', err)
        }

        const needed = hasLegacyData && !hasNewData

        return { needed, hasLegacyData, hasNewData }
    }

    public static async performMigration(): Promise<MigrationResult> {
        const result: MigrationResult = {
            success: false,
            questionSetsFound: 0,
            questionSetsMigrated: 0,
            packingListsFound: 0,
            packingListsMigrated: 0,
            errors: [],
            backupCreated: false
        }

        try {
            const backup = await DatabaseMigration.createBackup()
            result.backupCreated = true
            result.questionSetsFound = backup.questionSets.length
            result.packingListsFound = backup.packingLists.length

            const migrationResult = await packingAppDb.migrateFromLegacyDatabases()
            result.questionSetsMigrated = migrationResult.questionSets
            result.packingListsMigrated = migrationResult.packingLists

            const verification = await DatabaseMigration.verifyMigration(backup)
            if (!verification.success) {
                result.errors.push(...verification.errors)
                throw new Error('Migration verification failed')
            }

            result.success = true
            console.log('Migration completed successfully:', result)

        } catch (err: unknown) {
            const error = err as { message?: string };
            result.errors.push(`Migration failed: ${error.message || 'Unknown error'}`)
            console.error('Migration failed:', err)
        }

        return result
    }

    private static async verifyMigration(backup: BackupData): Promise<{ success: boolean, errors: string[] }> {
        const errors: string[] = []

        try {
            if (backup.questionSets.length > 0) {
                const migratedQuestionSet = await packingAppDb.getQuestionSet()
                const originalQuestionSet = backup.questionSets[0]

                if (migratedQuestionSet.people.length !== originalQuestionSet.people.length) {
                    errors.push('Question set people count mismatch')
                }
                if (migratedQuestionSet.questions.length !== originalQuestionSet.questions.length) {
                    errors.push('Question set questions count mismatch')
                }
                if (migratedQuestionSet.alwaysNeededItems.length !== originalQuestionSet.alwaysNeededItems.length) {
                    errors.push('Question set always needed items count mismatch')
                }
            }

            const migratedLists = await packingAppDb.getAllPackingLists()
            if (migratedLists.length !== backup.packingLists.length) {
                errors.push(`Packing lists count mismatch: expected ${backup.packingLists.length}, got ${migratedLists.length}`)
            }

            for (const originalList of backup.packingLists) {
                const migratedList = migratedLists.find(list => list.id === originalList.id)
                if (!migratedList) {
                    errors.push(`Packing list ${originalList.id} not found in migrated data`)
                } else {
                    if (migratedList.items.length !== originalList.items.length) {
                        errors.push(`Packing list ${originalList.id} items count mismatch`)
                    }
                    if (migratedList.name !== originalList.name) {
                        errors.push(`Packing list ${originalList.id} name mismatch`)
                    }
                }
            }

        } catch (err: unknown) {
            const error = err as { message?: string };
            errors.push(`Verification error: ${error.message || 'Unknown error'}`)
        }

        return { success: errors.length === 0, errors }
    }

    public static clearBackup(): void {
        localStorage.removeItem(DatabaseMigration.BACKUP_KEY)
        console.log('Backup cleared')
    }
}