import { Session } from '@inrupt/solid-client-authn-browser'
import { PackingAppDatabase } from '../database'
import {
    SyncState,
    SyncOptions,
    SyncResult,
    ConflictInfo,
    ConflictStrategy,
    DEFAULT_SYNC_SETTINGS,
    DataTypeSyncStatus,
} from './types'
import {
    getDeviceId,
    compareTimestamps,
    hasUnsyncedLocalChanges,
    retryWithBackoff,
} from './utils'
import { loadFileFromPod, saveFileToPod, POD_CONTAINERS } from '../solidPod'
import { PackingListQuestionSet } from '../../edit-questions/types'

type SyncStateChangeListener = (state: SyncState) => void

/**
 * Service for managing sync between local PouchDB and Solid Pod
 */
export class SyncService {
    private db: PackingAppDatabase
    private session: Session | null = null
    private syncState: SyncState
    private listeners: Set<SyncStateChangeListener> = new Set()
    private syncIntervalId: NodeJS.Timeout | null = null
    private options: SyncOptions

    constructor(db: PackingAppDatabase) {
        this.db = db

        // Initialize sync state
        this.syncState = {
            questionSet: {
                status: 'idle',
                lastSyncedAt: null,
                pendingChanges: false,
            },
            packingLists: {
                status: 'idle',
                lastSyncedAt: null,
                pendingChanges: false,
                conflicts: [],
            },
            online: navigator.onLine,
            podConnected: false,
            autoSyncEnabled: DEFAULT_SYNC_SETTINGS.autoSyncEnabled,
            syncInterval: DEFAULT_SYNC_SETTINGS.syncInterval * 60 * 1000, // Convert to ms
        }

        // Default options
        this.options = {
            autoSyncEnabled: DEFAULT_SYNC_SETTINGS.autoSyncEnabled,
            syncInterval: DEFAULT_SYNC_SETTINGS.syncInterval * 60 * 1000,
            conflictStrategy: DEFAULT_SYNC_SETTINGS.defaultConflictResolution,
            enableBackups: true,
        }

        // Listen for online/offline events
        window.addEventListener('online', this.handleOnline)
        window.addEventListener('offline', this.handleOffline)
    }

    /**
     * Initialize the sync service
     */
    public async initialize(session: Session | null, options?: Partial<SyncOptions>): Promise<void> {
        this.session = session
        this.syncState.podConnected = !!session?.info.isLoggedIn

        if (options) {
            this.options = { ...this.options, ...options }
            this.syncState.autoSyncEnabled = this.options.autoSyncEnabled
            this.syncState.syncInterval = this.options.syncInterval
        }

        // Start periodic sync if enabled
        if (this.options.autoSyncEnabled && this.session) {
            this.startPeriodicSync()
        }

        this.notifyListeners()
    }

    /**
     * Update session (e.g., when user logs in/out)
     */
    public updateSession(session: Session | null): void {
        this.session = session
        this.syncState.podConnected = !!session?.info.isLoggedIn

        if (this.session && this.options.autoSyncEnabled) {
            this.startPeriodicSync()
        } else {
            this.stopPeriodicSync()
        }

        this.notifyListeners()
    }

    /**
     * Sync all data (question set only for Phase 1)
     */
    public async syncAll(): Promise<SyncResult> {
        if (!this.canSync()) {
            return {
                success: false,
                synced: 0,
                conflicts: 0,
                errors: ['Not online or not logged in to Pod'],
            }
        }

        return await this.syncQuestionSet()
    }

    /**
     * Sync question set between local and Pod
     */
    public async syncQuestionSet(): Promise<SyncResult> {
        if (!this.canSync()) {
            return {
                success: false,
                synced: 0,
                conflicts: 0,
                errors: ['Not online or not logged in to Pod'],
            }
        }

        this.updateDataTypeStatus('questionSet', 'syncing')

        try {
            const podUrl = await this.getPodUrl()
            const fileUrl = `${podUrl}${POD_CONTAINERS.QUESTIONS}`

            // Try to load from Pod
            let podData: PackingListQuestionSet | null = null
            try {
                podData = await loadFileFromPod<PackingListQuestionSet>({
                    session: this.session!,
                    fileUrl,
                })
            } catch (err: any) {
                // File doesn't exist in Pod yet
                if (err.status === 404 || err.message?.includes('not found')) {
                    console.log('Question set not found in Pod, will upload local version')
                } else {
                    throw err
                }
            }

            // Try to load local data
            let localData: PackingListQuestionSet | null = null
            try {
                localData = await this.db.getQuestionSet()
            } catch (err: any) {
                if (err.name !== 'not_found') {
                    throw err
                }
            }

            // Determine sync action
            if (!podData && !localData) {
                // No data on either side
                this.updateDataTypeStatus('questionSet', 'idle')
                return { success: true, synced: 0, conflicts: 0, errors: [] }
            } else if (!podData && localData) {
                // Upload local to Pod
                await this.uploadQuestionSetToPod(localData)
                this.updateDataTypeStatus('questionSet', 'idle', new Date().toISOString())
                return { success: true, synced: 1, conflicts: 0, errors: [] }
            } else if (podData && !localData) {
                // Download from Pod
                await this.db.saveQuestionSet(podData)
                this.updateDataTypeStatus('questionSet', 'idle', new Date().toISOString())
                return { success: true, synced: 1, conflicts: 0, errors: [] }
            } else {
                // Both exist, compare timestamps
                const result = await this.resolveQuestionSetConflict(localData!, podData!)
                this.updateDataTypeStatus('questionSet', 'idle', new Date().toISOString())
                return result
            }
        } catch (err: any) {
            console.error('Error syncing question set:', err)
            this.updateDataTypeStatus('questionSet', 'error')

            return {
                success: false,
                synced: 0,
                conflicts: 0,
                errors: [err.message || 'Unknown error'],
            }
        }
    }

    /**
     * Resolve conflict between local and Pod question sets
     */
    private async resolveQuestionSetConflict(
        local: PackingListQuestionSet,
        remote: PackingListQuestionSet
    ): Promise<SyncResult> {
        // Get document metadata from database - this has the timestamps
        const localDoc = await this.db.getQuestionSetDocument()
        const localTimestamp = localDoc.updatedAt || localDoc.createdAt
        // TODO: In future, store timestamps in Pod data. For now, assume Pod data is always older
        const remoteTimestamp = localDoc.createdAt // Assume Pod data is from creation time

        const comparison = compareTimestamps(localTimestamp, remoteTimestamp)

        if (comparison === 'equal') {
            // Already in sync
            return { success: true, synced: 0, conflicts: 0, errors: [] }
        }

        // Check if local has unsynced changes
        const hasLocalChanges = hasUnsyncedLocalChanges(localDoc)

        if (comparison === 'after' && hasLocalChanges) {
            // Local is newer and has changes, upload to Pod
            await this.uploadQuestionSetToPod(local)
            return { success: true, synced: 1, conflicts: 0, errors: [] }
        } else if (comparison === 'before') {
            // Remote is newer, check if local has unsynced changes
            if (hasLocalChanges) {
                // True conflict - both have changes
                this.addConflict('question-set', 'question-set:1', local, remote)
                return { success: false, synced: 0, conflicts: 1, errors: ['Conflict detected'] }
            } else {
                // Safe to download from Pod
                await this.db.saveQuestionSet(remote)
                return { success: true, synced: 1, conflicts: 0, errors: [] }
            }
        } else {
            // Local is newer but no changes, or equal - download from Pod to be safe
            await this.db.saveQuestionSet(remote)
            return { success: true, synced: 1, conflicts: 0, errors: [] }
        }
    }

    /**
     * Upload question set to Pod
     */
    private async uploadQuestionSetToPod(questionSet: PackingListQuestionSet): Promise<void> {
        const podUrl = await this.getPodUrl()
        const containerPath = `${podUrl}${POD_CONTAINERS.ROOT}`
        const filename = 'packing-list-questions.json'

        await retryWithBackoff(async () => {
            await saveFileToPod({
                session: this.session!,
                containerPath,
                filename,
                data: questionSet,
            })
        })

        // Update sync metadata
        await this.db.updateQuestionSetSyncMetadata(new Date().toISOString())
    }

    /**
     * Sync packing list (placeholder for Phase 2)
     */
    public async syncPackingList(_id: string): Promise<SyncResult> {
        // TODO: Implement in Phase 2
        return {
            success: false,
            synced: 0,
            conflicts: 0,
            errors: ['Packing list sync not yet implemented'],
        }
    }

    /**
     * Sync all packing lists (placeholder for Phase 2)
     */
    public async syncAllPackingLists(): Promise<SyncResult> {
        // TODO: Implement in Phase 2
        return {
            success: false,
            synced: 0,
            conflicts: 0,
            errors: ['Packing list sync not yet implemented'],
        }
    }

    /**
     * Get all conflicts
     */
    public getConflicts(): ConflictInfo[] {
        return this.syncState.packingLists.conflicts
    }

    /**
     * Resolve a conflict
     */
    public async resolveConflict(conflictId: string, strategy: ConflictStrategy): Promise<void> {
        const conflict = this.syncState.packingLists.conflicts.find(
            c => c.documentId === conflictId
        )

        if (!conflict) {
            throw new Error('Conflict not found')
        }

        switch (strategy) {
            case 'keep-local':
                if (conflict.documentType === 'question-set') {
                    await this.uploadQuestionSetToPod(conflict.localVersion)
                }
                break

            case 'keep-remote':
                if (conflict.documentType === 'question-set') {
                    await this.db.saveQuestionSet(conflict.remoteVersion)
                }
                break

            case 'last-write-wins':
                // Already handled in resolveQuestionSetConflict
                break

            // TODO: Implement merge strategy
            case 'merge':
                throw new Error('Merge strategy not yet implemented')

            default:
                throw new Error(`Unknown conflict strategy: ${strategy}`)
        }

        // Mark conflict as resolved
        conflict.resolved = true
        this.notifyListeners()
    }

    /**
     * Set auto-sync enabled/disabled
     */
    public setAutoSync(enabled: boolean): void {
        this.options.autoSyncEnabled = enabled
        this.syncState.autoSyncEnabled = enabled

        if (enabled && this.session) {
            this.startPeriodicSync()
        } else {
            this.stopPeriodicSync()
        }

        this.notifyListeners()
    }

    /**
     * Set sync interval
     */
    public setSyncInterval(minutes: number): void {
        const ms = minutes * 60 * 1000
        this.options.syncInterval = ms
        this.syncState.syncInterval = ms

        // Restart periodic sync with new interval
        if (this.options.autoSyncEnabled && this.session) {
            this.stopPeriodicSync()
            this.startPeriodicSync()
        }

        this.notifyListeners()
    }

    /**
     * Get current sync state
     */
    public getSyncState(): SyncState {
        return { ...this.syncState }
    }

    /**
     * Subscribe to sync state changes
     */
    public onSyncStateChange(callback: SyncStateChangeListener): () => void {
        this.listeners.add(callback)

        // Return unsubscribe function
        return () => {
            this.listeners.delete(callback)
        }
    }

    /**
     * Get device ID
     */
    public getDeviceId(): string {
        return getDeviceId()
    }

    /**
     * Get last sync time for a document
     */
    public getLastSyncTime(docId?: string): string | null {
        if (docId === 'question-set:1') {
            return this.syncState.questionSet.lastSyncedAt
        }
        return null
    }

    /**
     * Cleanup resources
     */
    public destroy(): void {
        this.stopPeriodicSync()
        window.removeEventListener('online', this.handleOnline)
        window.removeEventListener('offline', this.handleOffline)
        this.listeners.clear()
    }

    // Private helper methods

    private canSync(): boolean {
        return this.syncState.online && this.syncState.podConnected && !!this.session
    }

    private async getPodUrl(): Promise<string> {
        if (!this.session) {
            throw new Error('No active session')
        }

        // This will be implemented using the existing solidPod service
        const { getPrimaryPodUrl } = await import('../solidPod')
        const podUrl = await getPrimaryPodUrl(this.session)

        if (!podUrl) {
            throw new Error('Could not get Pod URL')
        }

        return podUrl
    }

    private startPeriodicSync(): void {
        this.stopPeriodicSync()

        this.syncIntervalId = setInterval(() => {
            if (this.canSync()) {
                this.syncAll().catch(err => {
                    console.error('Periodic sync error:', err)
                })
            }
        }, this.options.syncInterval)
    }

    private stopPeriodicSync(): void {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId)
            this.syncIntervalId = null
        }
    }

    private handleOnline = (): void => {
        this.syncState.online = true
        this.notifyListeners()

        // Trigger sync if auto-sync is enabled
        if (this.options.autoSyncEnabled && this.canSync()) {
            this.syncAll().catch(err => {
                console.error('Sync on reconnect error:', err)
            })
        }
    }

    private handleOffline = (): void => {
        this.syncState.online = false
        this.notifyListeners()
    }

    private updateDataTypeStatus(
        dataType: 'questionSet' | 'packingLists',
        status: DataTypeSyncStatus['status'],
        lastSyncedAt?: string
    ): void {
        this.syncState[dataType].status = status
        if (lastSyncedAt) {
            this.syncState[dataType].lastSyncedAt = lastSyncedAt
        }
        this.notifyListeners()
    }

    private addConflict(
        documentType: 'question-set' | 'packing-list',
        documentId: string,
        localVersion: any,
        remoteVersion: any
    ): void {
        const conflict: ConflictInfo = {
            documentId,
            documentType,
            localVersion,
            remoteVersion,
            detectedAt: new Date().toISOString(),
            resolved: false,
        }

        this.syncState.packingLists.conflicts.push(conflict)
        this.updateDataTypeStatus('questionSet', 'conflict')
    }

    private notifyListeners(): void {
        const state = this.getSyncState()
        this.listeners.forEach(listener => listener(state))
    }
}
