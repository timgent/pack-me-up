import { createContext, ReactNode, useContext, useState, useEffect, Fragment, useMemo } from 'react'
import { PackingAppDatabase, LOCAL_NAMESPACE } from '../services/database'
import { useSolidPod } from './SolidPodContext'
import { getPrimaryPodUrl, hasPodData, saveFileToPod, deleteFileFromPod, POD_CONTAINERS } from '../services/solidPod'
import { ConfirmationDialog } from './ConfirmationDialog'
import { PackingList } from '../create-packing-list/types'
import { PackingListQuestionSet } from '../edit-questions/types'

interface DatabaseContextValue {
    db: PackingAppDatabase
    savePackingList(list: PackingList): Promise<{ rev: string }>
    loadPackingList(id: string): Promise<PackingList>
    listPackingLists(): Promise<PackingList[]>
    deletePackingList(id: string): Promise<void>
    saveQuestionSet(qs: PackingListQuestionSet): Promise<{ rev: string }>
    loadQuestionSet(): Promise<PackingListQuestionSet>
}

const DatabaseContext = createContext<DatabaseContextValue | undefined>(undefined)

/**
 * Provides a PouchDB instance namespaced to the current pod identity.
 *
 * - Not logged in → uses the 'local' namespace (packing-app-data--local)
 * - Logged into a pod → uses the pod URL as namespace (e.g. packing-app-data--timgent.solidcommunity.net)
 *
 * This ensures that local data and pod data are always kept in separate databases,
 * preventing accidental overwrites between identities.
 *
 * Children are not rendered until the database is ready.
 *
 * On first login to a pod with an empty database, the user is offered a one-time
 * choice to copy their local data to the pod.
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
    const { isLoggedIn, webId, session, isLoading } = useSolidPod()
    const [db, setDb] = useState<PackingAppDatabase | null>(null)
    const [namespace, setNamespace] = useState<string | null>(null)
    const [isResolvingPod, setIsResolvingPod] = useState(false)
    const [showMigrationPrompt, setShowMigrationPrompt] = useState(false)
    const [localDb, setLocalDb] = useState<PackingAppDatabase | null>(null)
    const [resolvedPodUrl, setResolvedPodUrl] = useState<string | null>(null)

    useEffect(() => {
        // While session is still initialising, wait
        if (isLoading) {
            return
        }

        if (!isLoggedIn || !webId) {
            // Not logged in — use the local namespace immediately
            setShowMigrationPrompt(false)
            setNamespace(LOCAL_NAMESPACE)
            setDb(PackingAppDatabase.getInstance(LOCAL_NAMESPACE))
            setResolvedPodUrl(null)
            return
        }

        // Logged in — resolve the pod URL to use as namespace
        let cancelled = false
        setIsResolvingPod(true)

        getPrimaryPodUrl(session).then(async podUrl => {
            if (cancelled) return

            const resolvedNamespace = podUrl
                ? PackingAppDatabase.sanitizePodUrl(podUrl)
                : PackingAppDatabase.sanitizePodUrl(webId)

            const podDb = PackingAppDatabase.getInstance(resolvedNamespace)
            const local = PackingAppDatabase.getInstance(LOCAL_NAMESPACE)

            const dismissedKey = `pod-migration-dismissed-${resolvedNamespace}`
            const dismissed = localStorage.getItem(dismissedKey) === 'true'

            if (!dismissed && podUrl && session) {
                const [podHasRemoteData, localEmpty] = await Promise.all([
                    hasPodData(session, podUrl),
                    local.isEmpty()
                ])
                if (!podHasRemoteData && !localEmpty) {
                    if (cancelled) return
                    setLocalDb(local)
                    setNamespace(resolvedNamespace)
                    setDb(podDb)
                    setResolvedPodUrl(podUrl)
                    setShowMigrationPrompt(true)
                    setIsResolvingPod(false)
                    return
                }
            }

            if (cancelled) return
            setNamespace(resolvedNamespace)
            setDb(podDb)
            setResolvedPodUrl(podUrl)
            setIsResolvingPod(false)
        })

        return () => {
            cancelled = true
        }
    }, [isLoggedIn, webId, session, isLoading])

    const contextValue = useMemo<DatabaseContextValue | null>(() => {
        if (!db) return null
        return {
            db,
            async savePackingList(list: PackingList) {
                const result = await db.savePackingList(list)
                if (isLoggedIn && session && resolvedPodUrl) {
                    await saveFileToPod({
                        session,
                        containerPath: `${resolvedPodUrl}${POD_CONTAINERS.PACKING_LISTS}`,
                        filename: `${list.id}.json`,
                        data: list,
                    })
                }
                return result
            },
            async loadPackingList(id: string) {
                return db.getPackingList(id)
            },
            async listPackingLists() {
                return db.getAllPackingLists()
            },
            async deletePackingList(id: string) {
                await db.deletePackingList(id)
                if (isLoggedIn && session && resolvedPodUrl) {
                    await deleteFileFromPod(session, `${resolvedPodUrl}${POD_CONTAINERS.PACKING_LISTS}${id}.json`)
                }
            },
            async saveQuestionSet(qs: PackingListQuestionSet) {
                const result = await db.saveQuestionSet(qs)
                if (isLoggedIn && session && resolvedPodUrl) {
                    await saveFileToPod({
                        session,
                        containerPath: `${resolvedPodUrl}${POD_CONTAINERS.ROOT}`,
                        filename: 'packing-list-questions.json',
                        data: qs,
                    })
                }
                return result
            },
            async loadQuestionSet() {
                return db.getQuestionSet()
            },
        }
    }, [db, isLoggedIn, session, resolvedPodUrl])

    if (isLoading || isResolvingPod || !db || !namespace) {
        return null
    }

    if (showMigrationPrompt && localDb) {
        return (
            <ConfirmationDialog
                isOpen
                title="You have local data"
                message={"You have data saved locally in this browser.\nWould you like to copy it to your Pod so it's available across all your devices?"}
                confirmText="Use my local data"
                cancelText="Start fresh"
                onConfirm={async () => {
                    await db.copyAllDataFrom(localDb)
                    setShowMigrationPrompt(false)
                }}
                onClose={() => {
                    localStorage.setItem(`pod-migration-dismissed-${namespace}`, 'true')
                    setShowMigrationPrompt(false)
                }}
            />
        )
    }

    // The Fragment key causes all children to remount whenever the active database
    // namespace changes (e.g. login / logout). This ensures every page re-fetches
    // its data from the correct database instead of showing stale state.
    return (
        <DatabaseContext.Provider value={contextValue!}>
            <Fragment key={namespace}>
                {children}
            </Fragment>
        </DatabaseContext.Provider>
    )
}

/**
 * Returns the PouchDB instance for the current pod identity.
 * Must be used within a DatabaseProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useDatabase(): DatabaseContextValue {
    const context = useContext(DatabaseContext)
    if (context === undefined) {
        throw new Error('useDatabase must be used within a DatabaseProvider')
    }
    return context
}
