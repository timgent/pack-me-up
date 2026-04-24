import { createContext, ReactNode, useContext, useState, useEffect, useRef, Fragment } from 'react'
import { PackingAppDatabase, LOCAL_NAMESPACE } from '../services/database'
import { useSolidPod } from './SolidPodContext'
import { getPrimaryPodUrl, hasPodData, syncAllDataFromPod } from '../services/solidPod'
import { ConfirmationDialog } from './ConfirmationDialog'

interface DatabaseContextValue {
    db: PackingAppDatabase
    /** Increments each time the background login sync completes, so components can re-fetch. */
    loginSyncVersion: number
    /** True while the background login sync is in progress; components can show a loading state. */
    loginSyncInProgress: boolean
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
    const [loginSyncVersion, setLoginSyncVersion] = useState(0)
    const [loginSyncInProgress, setLoginSyncInProgress] = useState(false)

    // Track the namespace we have already synced so that session-object refreshes
    // (which change the `session` reference without changing the actual identity)
    // do not trigger a second full syncAllDataFromPod call.
    const syncedNamespaceRef = useRef<string | null>(null)

    useEffect(() => {
        // While session is still initialising, wait
        if (isLoading) {
            return
        }

        if (!isLoggedIn || !webId) {
            // Not logged in — use the local namespace immediately
            syncedNamespaceRef.current = null
            setShowMigrationPrompt(false)
            setNamespace(LOCAL_NAMESPACE)
            setDb(PackingAppDatabase.getInstance(LOCAL_NAMESPACE))
            return
        }

        // Logged in — resolve the pod URL to use as namespace.
        // Skip the expensive resolution step if we have already completed it for
        // this identity (handles OIDC session-object refreshes that re-fire the effect).
        const alreadySynced = syncedNamespaceRef.current !== null
        let cancelled = false
        if (!alreadySynced) {
            setIsResolvingPod(true)
        }

        getPrimaryPodUrl(session).then(async podUrl => {
            if (cancelled) return

            const resolvedNamespace = podUrl
                ? PackingAppDatabase.sanitizePodUrl(podUrl)
                : PackingAppDatabase.sanitizePodUrl(webId)

            // Session refreshed with same identity — nothing to do.
            if (syncedNamespaceRef.current === resolvedNamespace) {
                if (!alreadySynced) setIsResolvingPod(false)
                return
            }

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
                    setShowMigrationPrompt(true)
                    setIsResolvingPod(false)
                    return
                }
            }

            if (cancelled) return
            setNamespace(resolvedNamespace)
            setDb(podDb)
            setIsResolvingPod(false)

            // Background sync: pull latest data from pod into local DB.
            // Only run once per namespace (login event), not on every session refresh.
            // Fire-and-forget – a sync failure must not block the app.
            if (podUrl && session) {
                syncedNamespaceRef.current = resolvedNamespace
                setLoginSyncInProgress(true)
                syncAllDataFromPod(session, podUrl, podDb)
                    .then(() => {
                        setLoginSyncVersion(v => v + 1)
                        setLoginSyncInProgress(false)
                    })
                    .catch(err => {
                        console.error('Background login sync failed:', err)
                        setLoginSyncInProgress(false)
                    })
            }
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
                    // Mark as dismissed so a full-page reload doesn't re-prompt
                    // (local data was copied; pod will be out of sync until next
                    // explicit save, but hasPodData checks the remote pod)
                    localStorage.setItem(`pod-migration-dismissed-${namespace}`, 'true')
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
        <DatabaseContext.Provider value={{ db, loginSyncVersion, loginSyncInProgress }}>
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
