import { Session } from '@inrupt/solid-client-authn-browser'
import { packingAppDb } from './database'
import { getPrimaryPodUrl, loadFileFromPod, loadMultipleFilesFromPod, POD_CONTAINERS } from './solidPod'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList } from '../create-packing-list/types'

/**
 * Result of syncing all data from pod
 */
export interface SyncAllResult {
    questions: {
        synced: boolean
        source: 'pod' | 'local' | 'none'
    }
    packingLists: {
        synced: number
        skipped: number
        total: number
    }
}

/**
 * Compares timestamps and returns true if pod data is newer
 */
function isPodDataNewer(podUpdatedAt: string | undefined, localUpdatedAt: string | undefined): boolean {
    // If pod has no timestamp, local wins
    if (!podUpdatedAt) return false

    // If local has no timestamp, pod wins
    if (!localUpdatedAt) return true

    // Compare timestamps
    return new Date(podUpdatedAt) > new Date(localUpdatedAt)
}

/**
 * Syncs all data from pod to local database on login
 * Uses "last edited wins" strategy based on updatedAt timestamps
 */
export async function syncAllFromPod(session: Session): Promise<SyncAllResult> {
    const result: SyncAllResult = {
        questions: {
            synced: false,
            source: 'none'
        },
        packingLists: {
            synced: 0,
            skipped: 0,
            total: 0
        }
    }

    try {
        const podUrl = await getPrimaryPodUrl(session)

        if (!podUrl) {
            console.log('No pod URL found, skipping sync')
            return result
        }

        console.log('Starting sync from pod...')

        // Sync questions
        await syncQuestions(session, podUrl, result)

        // Sync packing lists
        await syncPackingLists(session, podUrl, result)

        console.log('Sync from pod completed:', result)
        return result
    } catch (error: any) {
        console.error('Error syncing from pod:', error)
        // Don't throw - allow the app to continue even if sync fails
        return result
    }
}

/**
 * Syncs question set from pod
 */
async function syncQuestions(session: Session, podUrl: string, result: SyncAllResult): Promise<void> {
    try {
        // Load questions from pod
        const questionsUrl = `${podUrl}${POD_CONTAINERS.QUESTIONS}`
        const podQuestions = await loadFileFromPod<PackingListQuestionSet & { updatedAt?: string }>({
            session,
            fileUrl: questionsUrl
        })

        // Load local questions with metadata
        const localQuestions = await packingAppDb.getQuestionSetWithMetadata()

        // Determine which version to keep using "last edited wins"
        if (!localQuestions) {
            // No local data, use pod data
            await packingAppDb.saveQuestionSet(podQuestions)
            result.questions.synced = true
            result.questions.source = 'pod'
            console.log('Synced questions from pod (no local data)')
        } else {
            if (isPodDataNewer(podQuestions.updatedAt, localQuestions.updatedAt)) {
                // Pod data is newer, overwrite local
                await packingAppDb.saveQuestionSet({
                    ...podQuestions,
                    _rev: localQuestions._rev // Preserve revision
                })
                result.questions.synced = true
                result.questions.source = 'pod'
                console.log('Synced questions from pod (pod newer)')
            } else {
                // Local data is newer or same, keep local
                result.questions.synced = false
                result.questions.source = 'local'
                console.log('Kept local questions (local newer or same)')
            }
        }
    } catch (error: any) {
        // 404 means no questions in pod yet
        if (error.statusCode === 404) {
            result.questions.source = 'local'
            console.log('No questions found in pod')
        } else {
            console.error('Error syncing questions:', error)
            throw error
        }
    }
}

/**
 * Syncs all packing lists from pod
 */
async function syncPackingLists(session: Session, podUrl: string, result: SyncAllResult): Promise<void> {
    try {
        // Load all packing lists from pod
        const packingListsContainerUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`
        const { data: podPackingLists } = await loadMultipleFilesFromPod<PackingList & { updatedAt?: string }>({
            session,
            containerPath: packingListsContainerUrl
        })

        result.packingLists.total = podPackingLists.length

        if (podPackingLists.length === 0) {
            console.log('No packing lists found in pod')
            return
        }

        // Load all local packing lists with metadata
        const localPackingLists = await packingAppDb.getAllPackingListsWithMetadata()
        const localPackingListsMap = new Map(
            localPackingLists.map(pl => [pl.id, pl])
        )

        // Sync each packing list using "last edited wins"
        for (const podList of podPackingLists) {
            const localList = localPackingListsMap.get(podList.id)

            if (!localList) {
                // No local version, use pod version
                await packingAppDb.savePackingList(podList)
                result.packingLists.synced++
                console.log(`Synced packing list ${podList.id} from pod (no local version)`)
            } else {
                // Compare timestamps
                if (isPodDataNewer(podList.updatedAt, localList.updatedAt)) {
                    // Pod version is newer, overwrite local
                    await packingAppDb.savePackingList({
                        ...podList,
                        _rev: localList._rev // Preserve revision
                    })
                    result.packingLists.synced++
                    console.log(`Synced packing list ${podList.id} from pod (pod newer)`)
                } else {
                    // Local version is newer or same, keep local
                    result.packingLists.skipped++
                    console.log(`Kept local packing list ${podList.id} (local newer or same)`)
                }
            }
        }

        console.log(`Synced ${result.packingLists.synced} packing lists, skipped ${result.packingLists.skipped}`)
    } catch (error: any) {
        // 404 means no packing lists container yet
        if (error.statusCode === 404) {
            console.log('No packing lists container found in pod')
        } else {
            console.error('Error syncing packing lists:', error)
            throw error
        }
    }
}
