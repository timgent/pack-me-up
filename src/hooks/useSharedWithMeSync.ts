import { useState, useEffect, useCallback } from 'react'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { useSyncCoordinator } from './useSyncCoordinator'
import { usePodSync } from './usePodSync'
import { POD_CONTAINERS } from '../services/solidPod'
import { sharedWithMeToDataset, datasetToSharedWithMe } from '../services/rdfSerialization'
import type { SharedWithMeList } from '../services/rdfSerialization'

export function useSharedWithMeSync() {
    const { db } = useDatabase()
    const { isLoggedIn } = useSolidPod()
    const [sharedWithMe, setSharedWithMe] = useState<SharedWithMeList | null>(null)

    useEffect(() => {
        db.getSharedWithMe()
            .then(data => setSharedWithMe(data))
            .catch(() => setSharedWithMe({ contexts: [], lastModified: new Date().toISOString() }))
    }, [db])

    const { saveWithSyncPrevention } = useSyncCoordinator<SharedWithMeList>({
        currentData: sharedWithMe,
        saveToLocalDb: (data) => db.saveSharedWithMe(data),
        updateFormAndState: (data) => setSharedWithMe(data),
    })

    const { saveToPod } = usePodSync<SharedWithMeList>({
        pathConfig: {
            container: POD_CONTAINERS.SHARED_WITH_ME,
            filename: '',
        },
        rdf: { serialize: sharedWithMeToDataset, deserialize: datasetToSharedWithMe },
        enabled: isLoggedIn,
    })

    const saveSharedWithMe = useCallback(
        async (updated: SharedWithMeList) => {
            const saved = await saveWithSyncPrevention(updated, saveToPod)
            if (saved) setSharedWithMe(saved)
            return saved
        },
        [saveWithSyncPrevention, saveToPod]
    )

    return { sharedWithMe, saveSharedWithMe }
}
