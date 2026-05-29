import { useState, useEffect, useCallback } from 'react'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { useSyncCoordinator } from './useSyncCoordinator'
import { usePodSync } from './usePodSync'
import { POD_CONTAINERS } from '../services/solidPod'
import { sharedListsWithMeToDataset, datasetToSharedListsWithMe } from '../services/rdfSerialization'
import type { SharedListsWithMe } from '../services/rdfSerialization'

export function useSharedListsSync() {
    const { db } = useDatabase()
    const { isLoggedIn } = useSolidPod()
    const [sharedListsWithMe, setSharedListsWithMe] = useState<SharedListsWithMe | null>(null)

    useEffect(() => {
        db.getSharedListsWithMe()
            .then(data => setSharedListsWithMe(data))
            .catch(() => setSharedListsWithMe({ lists: [], lastModified: new Date().toISOString() }))
    }, [db])

    const { saveWithSyncPrevention } = useSyncCoordinator<SharedListsWithMe>({
        currentData: sharedListsWithMe,
        saveToLocalDb: (data) => db.saveSharedListsWithMe(data),
        updateFormAndState: (data) => setSharedListsWithMe(data),
    })

    const { saveToPod } = usePodSync<SharedListsWithMe>({
        pathConfig: {
            container: POD_CONTAINERS.SHARED_LISTS_WITH_ME,
            filename: '',
        },
        rdf: { serialize: sharedListsWithMeToDataset, deserialize: datasetToSharedListsWithMe },
        enabled: isLoggedIn,
    })

    const saveSharedListsWithMe = useCallback(
        async (updated: SharedListsWithMe) => {
            const saved = await saveWithSyncPrevention(updated, saveToPod)
            if (saved) setSharedListsWithMe(saved)
            return saved
        },
        [saveWithSyncPrevention, saveToPod]
    )

    return { sharedListsWithMe, saveSharedListsWithMe }
}
