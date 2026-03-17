import { createContext, ReactNode, useContext, useState, useEffect, Fragment } from 'react'
import { PackingAppDatabase, LOCAL_NAMESPACE } from '../services/database'
import { useSolidPod } from './SolidPodContext'
import { getPrimaryPodUrl, hasPodData } from '../services/solidPod'
import { ConfirmationDialog } from './ConfirmationDialog'

interface DatabaseContextValue {
    db: PackingAppDatabase
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

            if (!dismissed && podUrl) {
                const [podHasRemoteData, localEmpty] = await Promise.all([
                    hasPodData(session, podUrl),
                    local.isEmpty()
                ])
                if (!podHasRemoteData && !localEmpty) {
                    if (cancelled) return
                    setLocalDb(local)
                    setNamespace(resolvedNamespace)
                    setDb(podDb)
                    setShowMigrationPrompt(true)
                    setIsResolvingPod(false)
                    return
                }
            }

            if (cancelled) return
            setNamespace(resolvedNamespace)
            setDb(podDb)
            setIsResolvingPod(false)
        })

        return () => {
            cancelled = true
        }
    }, [isLoggedIn, webId, session, isLoading])

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
        <DatabaseContext.Provider value={{ db }}>
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
export function useDatabase(): DatabaseContextValue {
    const context = useContext(DatabaseContext)
    if (context === undefined) {
        throw new Error('useDatabase must be used within a DatabaseProvider')
    }
    return context
}
