import { createContext, ReactNode, useContext, useState, useEffect, Fragment } from 'react'
import { PackingAppDatabase, LOCAL_NAMESPACE } from '../services/database'
import { useSolidPod } from './SolidPodContext'
import { getPrimaryPodUrl } from '../services/solidPod'

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
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
    const { isLoggedIn, webId, session, isLoading } = useSolidPod()
    const [db, setDb] = useState<PackingAppDatabase | null>(null)
    const [namespace, setNamespace] = useState<string | null>(null)
    const [isResolvingPod, setIsResolvingPod] = useState(false)

    useEffect(() => {
        // While session is still initialising, wait
        if (isLoading) {
            return
        }

        if (!isLoggedIn || !webId) {
            // Not logged in — use the local namespace immediately
            setNamespace(LOCAL_NAMESPACE)
            setDb(PackingAppDatabase.getInstance(LOCAL_NAMESPACE))
            return
        }

        // Logged in — resolve the pod URL to use as namespace
        let cancelled = false
        setIsResolvingPod(true)

        getPrimaryPodUrl(session).then(podUrl => {
            if (cancelled) return

            const resolvedNamespace = podUrl
                ? PackingAppDatabase.sanitizePodUrl(podUrl)
                : PackingAppDatabase.sanitizePodUrl(webId)

            setNamespace(resolvedNamespace)
            setDb(PackingAppDatabase.getInstance(resolvedNamespace))
            setIsResolvingPod(false)
        })

        return () => {
            cancelled = true
        }
    }, [isLoggedIn, webId, session, isLoading])

    if (isLoading || isResolvingPod || !db || !namespace) {
        return null
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
