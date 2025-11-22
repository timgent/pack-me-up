import { packingAppDb } from './database'

const DEFAULT_DB_NAME = 'packing-app-data'

/**
 * Creates a hash from a string (simple hash for database naming)
 */
function simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
}

/**
 * Creates a sanitized database name from a webId
 */
function createUserDatabaseName(webId: string): string {
    const hash = simpleHash(webId)
    return `${DEFAULT_DB_NAME}-user-${hash}`
}

/**
 * Database manager for handling user-specific PouchDB namespacing
 */
class DatabaseManager {
    private currentWebId: string | null = null
    private isUserDatabase: boolean = false

    /**
     * Switches to user-specific database when logging in
     * If the user database is empty, migrates data from the default database
     */
    async switchToUserDatabase(webId: string): Promise<void> {
        if (this.currentWebId === webId && this.isUserDatabase) {
            console.log('Already using user-specific database for', webId)
            return
        }

        const userDbName = createUserDatabaseName(webId)

        // First, check if we need to migrate data from the default database
        // We need to check this BEFORE switching, so we know if migration is needed
        let needsMigration = false
        let dataToMigrate = null

        // Temporarily switch to user database to check if it's empty
        const currentDbName = packingAppDb.getCurrentDatabaseName()
        await packingAppDb.switchDatabase(userDbName)

        const isEmpty = await packingAppDb.isEmpty()
        if (isEmpty) {
            console.log('User database is empty, will migrate data from default database')
            needsMigration = true

            // Switch to default database to export data
            await packingAppDb.switchDatabase(DEFAULT_DB_NAME)
            dataToMigrate = await packingAppDb.exportAllData()

            console.log('Exported data from default database:', {
                hasQuestionSet: !!dataToMigrate.questionSet,
                packingListsCount: dataToMigrate.packingLists.length
            })

            // Switch back to user database
            await packingAppDb.switchDatabase(userDbName)
        } else if (currentDbName !== userDbName) {
            // If not empty and we were on a different database, just make sure we're on the user database
            await packingAppDb.switchDatabase(userDbName)
        }

        // Import data if migration is needed
        if (needsMigration && dataToMigrate) {
            const result = await packingAppDb.importData(dataToMigrate)
            console.log('Migrated data to user database:', result)
        }

        this.currentWebId = webId
        this.isUserDatabase = true

        console.log('Switched to user-specific database:', {
            webId,
            dbName: userDbName,
            migrated: needsMigration,
            timestamp: new Date().toISOString()
        })
    }

    /**
     * Switches back to default database (on explicit logout)
     */
    async switchToDefaultDatabase(): Promise<void> {
        if (!this.isUserDatabase) {
            console.log('Already using default database')
            return
        }

        await packingAppDb.switchDatabase(DEFAULT_DB_NAME)

        this.currentWebId = null
        this.isUserDatabase = false

        console.log('Switched to default database:', {
            dbName: DEFAULT_DB_NAME,
            timestamp: new Date().toISOString()
        })
    }

    /**
     * Gets the current database status
     */
    getStatus() {
        return {
            currentWebId: this.currentWebId,
            isUserDatabase: this.isUserDatabase,
            currentDbName: packingAppDb.getCurrentDatabaseName()
        }
    }
}

export const databaseManager = new DatabaseManager()
