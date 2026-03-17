import { createContext, ReactNode, useContext, useState, useEffect } from 'react'
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
    const [isResolvingPod, setIsResolvingPod] = useState(false)

    useEffect(() => {
        // While session is still initialising, wait
        if (isLoading) {
            return
        }

        if (!isLoggedIn || !webId) {
            // Not logged in — use the local namespace immediately
            setDb(PackingAppDatabase.getInstance(LOCAL_NAMESPACE))
            return
        }

        // Logged in — resolve the pod URL to use as namespace
        let cancelled = false
        setIsResolvingPod(true)

        getPrimaryPodUrl(session).then(podUrl => {
            if (cancelled) return

            const namespace = podUrl
                ? PackingAppDatabase.sanitizePodUrl(podUrl)
                : PackingAppDatabase.sanitizePodUrl(webId)

            setDb(PackingAppDatabase.getInstance(namespace))
            setIsResolvingPod(false)
        })

        return () => {
            cancelled = true
        }
    }, [isLoggedIn, webId, session, isLoading])

    if (isLoading || isResolvingPod || !db) {
        return null
    }

    return (
        <DatabaseContext.Provider value={{ db }}>
            {children}
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
