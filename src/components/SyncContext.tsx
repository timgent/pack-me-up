import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { SyncService } from '../services/sync/SyncService'
import { SyncState, SyncResult, ConflictStrategy } from '../services/sync/types'
import { packingAppDb } from '../services/database'
import { useSolidPod } from './SolidPodContext'
import { useToast } from './ToastContext'

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
    const { session, isLoggedIn, isLoading } = useSolidPod()
    const { showToast } = useToast()
    const [syncService] = useState(() => new SyncService(packingAppDb))
    const [syncState, setSyncState] = useState<SyncState | null>(null)
    const previousLoginState = useRef<boolean>(false)
    const hasSyncedOnLogin = useRef<boolean>(false)

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

    // Trigger sync when user logs in
    useEffect(() => {
        const justLoggedIn = !previousLoginState.current && isLoggedIn

        // Only sync if:
        // 1. User just logged in
        // 2. Session is available and fully loaded
        // 3. Haven't already synced on this login
        if (justLoggedIn && session && !isLoading && !hasSyncedOnLogin.current) {
            console.log('User just logged in, scheduling sync...')
            hasSyncedOnLogin.current = true

            // Small delay to ensure redirect is complete and DOM is ready
            const syncTimeout = setTimeout(() => {
                console.log('Starting login sync...')
                showToast('Syncing with your Pod...', 'info')

                syncService.syncAll()
                    .then(result => {
                        if (result.success) {
                            if (result.synced > 0) {
                                showToast(`Synced ${result.synced} item${result.synced !== 1 ? 's' : ''} successfully`, 'success')
                            } else {
                                showToast('Everything is up to date', 'success')
                            }
                        } else if (result.conflicts > 0) {
                            showToast(`Sync completed with ${result.conflicts} conflict${result.conflicts !== 1 ? 's' : ''}. Please review.`, 'warning')
                        } else {
                            showToast('Sync completed with errors: ' + result.errors.join(', '), 'error')
                        }
                    })
                    .catch(err => {
                        console.error('Error during login sync:', err)
                        showToast('Failed to sync with Pod: ' + err.message, 'error')
                    })
            }, 500) // 500ms delay to ensure everything is ready

            return () => clearTimeout(syncTimeout)
        }

        // Reset sync flag when user logs out
        if (!isLoggedIn) {
            hasSyncedOnLogin.current = false
        }

        previousLoginState.current = isLoggedIn
    }, [isLoggedIn, session, isLoading, syncService, showToast])

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
