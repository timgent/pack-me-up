import { useEffect, useState } from 'react'
import { packingAppDb } from '../services/database'

/**
 * Component to handle app initialization tasks
 * Currently handles sync metadata migration
 */
export const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [initialized, setInitialized] = useState(false)

    useEffect(() => {
        const initialize = async () => {
            try {
                // Run sync metadata migration
                const result = await packingAppDb.migrateSyncMetadata()
                console.log('Sync metadata migration:', result)

                setInitialized(true)
            } catch (err) {
                console.error('Error during app initialization:', err)
                // Continue anyway - app should still work
                setInitialized(true)
            }
        }

        initialize()
    }, [])

    // Show nothing while initializing, or could show a loading spinner
    if (!initialized) {
        return null
    }

    return <>{children}</>
}
