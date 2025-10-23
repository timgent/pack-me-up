import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { SyncService } from '../services/sync/SyncService'
import { SyncState, SyncResult, ConflictStrategy } from '../services/sync/types'
import { packingAppDb } from '../services/database'
import { useSolidPod } from './SolidPodContext'

interface SyncContextValue {
    syncService: SyncService | null
    syncState: SyncState | null
    syncAll: () => Promise<SyncResult>
    syncQuestionSet: () => Promise<SyncResult>
    resolveConflict: (conflictId: string, strategy: ConflictStrategy) => Promise<void>
    setAutoSync: (enabled: boolean) => void
    setSyncInterval: (minutes: number) => void
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined)

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session } = useSolidPod()
    const [syncService] = useState(() => new SyncService(packingAppDb))
    const [syncState, setSyncState] = useState<SyncState | null>(null)

    // Initialize sync service when session changes
    useEffect(() => {
        syncService.initialize(session).catch(err => {
            console.error('Error initializing sync service:', err)
        })

        syncService.updateSession(session)

        // Subscribe to sync state changes
        const unsubscribe = syncService.onSyncStateChange(state => {
            setSyncState(state)
        })

        // Set initial state
        setSyncState(syncService.getSyncState())

        return () => {
            unsubscribe()
        }
    }, [session, syncService])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            syncService.destroy()
        }
    }, [syncService])

    const syncAll = useCallback(async () => {
        return await syncService.syncAll()
    }, [syncService])

    const syncQuestionSet = useCallback(async () => {
        return await syncService.syncQuestionSet()
    }, [syncService])

    const resolveConflict = useCallback(
        async (conflictId: string, strategy: ConflictStrategy) => {
            await syncService.resolveConflict(conflictId, strategy)
        },
        [syncService]
    )

    const setAutoSync = useCallback(
        (enabled: boolean) => {
            syncService.setAutoSync(enabled)
        },
        [syncService]
    )

    const setSyncInterval = useCallback(
        (minutes: number) => {
            syncService.setSyncInterval(minutes)
        },
        [syncService]
    )

    const value: SyncContextValue = {
        syncService,
        syncState,
        syncAll,
        syncQuestionSet,
        resolveConflict,
        setAutoSync,
        setSyncInterval,
    }

    return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export const useSync = (): SyncContextValue => {
    const context = useContext(SyncContext)
    if (!context) {
        throw new Error('useSync must be used within a SyncProvider')
    }
    return context
}
