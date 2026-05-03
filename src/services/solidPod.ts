import { Session } from '@inrupt/solid-client-authn-browser'
import { getPodUrlAll, overwriteFile, getSolidDataset, getContainedResourceUrlAll, getFile, deleteFile, saveSolidDatasetAt } from '@inrupt/solid-client'
import type { SolidDataset } from '@inrupt/solid-client'
import { PackingAppDatabase } from './database'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList } from '../create-packing-list/types'
import { packingListToDataset, datasetToPackingList, datasetToQuestionSet } from './rdfSerialization'

/**
 * Pod container paths under the user's Pod root
 */
export const POD_CONTAINERS = {
    ROOT: 'pack-me-up/',
    QUESTIONS: 'pack-me-up/packing-list-questions.ttl',
    QUESTIONS_LEGACY_JSON: 'pack-me-up/packing-list-questions.json',
    MIGRATION_MARKER: 'pack-me-up/migrated-to-rdf.ttl',
    PACKING_LISTS: 'pack-me-up/packing-lists/',
    BACKUPS: 'pack-me-up/backups/',
} as const

/**
 * User-facing error messages for Pod operations
 */
export const POD_ERROR_MESSAGES = {
    NOT_LOGGED_IN: 'You must be logged in to save to Pod',
    NOT_LOGGED_IN_LOAD: 'You must be logged in to load from Pod',
    NO_POD_FOUND: 'No pod found for your account',
    SAVE_FAILED: 'Failed to save to Pod. Please try again.',
    LOAD_FAILED: 'Failed to load from Pod. Please try again.',
    NO_DATA_FOUND: (resourceType: string) => `No ${resourceType} found in Pod`,
    SESSION_EXPIRED: 'Your session has expired. Please log in again to continue syncing.',
} as const

/**
 * Result of a Pod sync operation
 */
export interface PodSyncResult {
    success: boolean
    successCount: number
    failCount: number
    totalCount: number
}

/**
 * Options for saving data to Pod
 */
export interface SaveToPodOptions {
    session: Session
    containerPath: string
    filename: string
    data: unknown
    onError?: (error: Error) => void
}

/**
 * Options for loading data from Pod
 */
export interface LoadFromPodOptions {
    session: Session
    fileUrl: string
    onError?: (error: Error) => void
}

/**
 * Options for batch loading files from a Pod container
 */
export interface LoadMultipleFromPodOptions<T> {
    session: Session
    containerPath: string
    onFileLoaded?: (data: T) => void
    onError?: (fileUrl: string, error: Error) => void
}

/**
 * Custom error class for authentication failures
 */
export class AuthenticationError extends Error {
    constructor(message: string, public originalError?: unknown) {
        super(message)
        this.name = 'AuthenticationError'
    }
}

/**
 * Checks if an error is an authentication error (401 or 403)
 * These errors typically indicate an expired or invalid session
 */
export function isAuthenticationError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false
    const statusCode = (error as { statusCode?: unknown }).statusCode
    return statusCode === 401 || statusCode === 403
}

/**
 * Wraps an error, converting authentication errors to AuthenticationError
 * This makes it easier to detect and handle session expiration in the UI
 */
export function handlePodError(error: unknown): never {
    if (isAuthenticationError(error)) {
        throw new AuthenticationError(POD_ERROR_MESSAGES.SESSION_EXPIRED, error)
    }
    throw error
}

function getStatusCode(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null) return undefined
    const code = (err as { statusCode?: unknown }).statusCode
    return typeof code === 'number' ? code : undefined
}

/**
 * Validates session and retrieves the user's primary Pod URL
 * @returns Pod URL if valid, null otherwise
 */
export async function getPrimaryPodUrl(session: Session | null): Promise<string | null> {
    if (!session || !session.info.isLoggedIn || !session.info.webId) {
        return null
    }

    try {
        const podUrls = await getPodUrlAll(session.info.webId, { fetch: session.fetch })
        if (podUrls && podUrls.length > 0) {
            return podUrls[0]
        }
    } catch {
        // getPodUrlAll failed (e.g. CSS v7 doesn't expose pim:storage) — fall through to derivation
    }

    // Fallback: derive Pod URL from WebID using CSS convention.
    // WebID = http://host/podName/profile/card#me → Pod = http://host/podName/
    // This covers CSS v7 installations that don't include pim:storage in the profile.
    try {
        const url = new URL(session.info.webId)
        url.hash = ''
        const path = url.pathname
        if (path.endsWith('/profile/card')) {
            url.pathname = path.slice(0, -'profile/card'.length)
            return url.toString()
        }
        // Generic fallback: use the first path segment as Pod root
        const firstSegment = path.split('/').find(s => s.length > 0)
        if (firstSegment) {
            url.pathname = '/' + firstSegment + '/'
            return url.toString()
        }
    } catch { /* ignore URL parse errors */ }

    return null
}

/**
 * Checks whether the user's Solid Pod contains any data saved by this app.
 * Checks for migration marker, RDF questions file, then legacy JSON questions file,
 * then the packing lists container. Works for both pre- and post-migration pods.
 */
export async function hasPodData(session: Session, podUrl: string): Promise<boolean> {
    // Check migration marker (fast path for migrated pods)
    try {
        await getFile(`${podUrl}${POD_CONTAINERS.MIGRATION_MARKER}`, { fetch: session.fetch })
        return true
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) !== 404) throw err
    }

    // Check RDF questions file
    try {
        await getFile(`${podUrl}${POD_CONTAINERS.QUESTIONS}`, { fetch: session.fetch })
        return true
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) !== 404) throw err
    }

    // Check legacy JSON questions file
    try {
        await getFile(`${podUrl}${POD_CONTAINERS.QUESTIONS_LEGACY_JSON}`, { fetch: session.fetch })
        return true
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) !== 404) throw err
    }

    try {
        const dataset = await getSolidDataset(`${podUrl}${POD_CONTAINERS.PACKING_LISTS}`, { fetch: session.fetch })
        return getContainedResourceUrlAll(dataset).some(url => url.endsWith('.ttl') || url.endsWith('.json'))
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) === 404) return false
        throw err
    }
}

/**
 * Saves a file to a Pod container with automatic fallback to overwrite
 * Handles both saveFileInContainer (creates) and overwriteFile (updates) strategies
 */
export async function saveFileToPod(options: SaveToPodOptions): Promise<void> {
    const { session, containerPath, filename, data } = options

    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })

    // Use overwriteFile (PUT) directly to the exact URL — this creates the file if it
    // doesn't exist or replaces it if it does, regardless of server-side slug behaviour.
    // This avoids CSS v7's saveFileInContainer creating a duplicate instead of 409-ing.
    try {
        const fileUrl = `${containerPath}${filename}`
        await overwriteFile(fileUrl, blob, {
            fetch: session.fetch,
            contentType: 'application/json'
        })
    } catch (error: unknown) {
        if (isAuthenticationError(error)) {
            handlePodError(error)
        }
        throw error
    }
}

/**
 * Deletes a single file from a Pod
 */
export async function deleteFileFromPod(session: Session, fileUrl: string): Promise<void> {
    try {
        await deleteFile(fileUrl, { fetch: session.fetch })
    } catch (error) {
        if (isAuthenticationError(error)) {
            handlePodError(error)
        }
        throw error
    }
}

/**
 * Loads a single file from a Pod
 */
export async function loadFileFromPod<T>(options: LoadFromPodOptions): Promise<T> {
    const { session, fileUrl } = options

    try {
        const file = await getFile(fileUrl, { fetch: session.fetch })
        const text = await file.text()
        return JSON.parse(text) as T
    } catch (error: unknown) {
        // Check for authentication errors
        if (isAuthenticationError(error)) {
            handlePodError(error)
        }
        throw error
    }
}

// ── RDF Pod operations ────────────────────────────────────────────────────────

export interface SaveRdfToPodOptions<T> {
    session: Session
    fileUrl: string
    data: T
    serializer: (data: T, datasetUrl: string) => SolidDataset
}

/**
 * Loads an RDF dataset from a Pod URL and deserializes it via the provided function.
 */
export async function loadRdfFromPod<T>(
    session: Session,
    fileUrl: string,
    deserializer: (dataset: SolidDataset, datasetUrl: string) => T
): Promise<T> {
    try {
        const dataset = await getSolidDataset(fileUrl, { fetch: session.fetch })
        return deserializer(dataset, fileUrl)
    } catch (error: unknown) {
        if (isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

/**
 * Serializes data to RDF and saves it as a dataset at the given Pod URL.
 */
export async function saveRdfToPod<T>(options: SaveRdfToPodOptions<T>): Promise<void> {
    const { session, fileUrl, data, serializer } = options
    try {
        const dataset = serializer(data, fileUrl)
        await saveSolidDatasetAt(fileUrl, dataset, { fetch: session.fetch })
    } catch (error: unknown) {
        if (isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

/**
 * Loads all .ttl files from a Pod container, deserializing each via the provided function.
 */
export async function loadMultipleRdfFromPod<T>(
    session: Session,
    containerUrl: string,
    deserializer: (dataset: SolidDataset, datasetUrl: string) => T,
    onError?: (fileUrl: string, error: Error) => void
): Promise<{ data: T[]; result: PodSyncResult }> {
    let dataset
    try {
        dataset = await getSolidDataset(containerUrl, { fetch: session.fetch })
    } catch (error: unknown) {
        if (isAuthenticationError(error)) handlePodError(error)
        if (getStatusCode(error) === 404) {
            return { data: [], result: { success: false, successCount: 0, failCount: 0, totalCount: 0 } }
        }
        throw error
    }

    const ttlUrls = getContainedResourceUrlAll(dataset).filter(url => url.endsWith('.ttl'))

    if (ttlUrls.length === 0) {
        return { data: [], result: { success: true, successCount: 0, failCount: 0, totalCount: 0 } }
    }

    const loadedData: T[] = []
    let successCount = 0
    let failCount = 0

    for (const fileUrl of ttlUrls) {
        try {
            const fileDataset = await getSolidDataset(fileUrl, { fetch: session.fetch })
            loadedData.push(deserializer(fileDataset, fileUrl))
            successCount++
        } catch (error: unknown) {
            if (isAuthenticationError(error)) handlePodError(error)
            console.error(`loadMultipleRdfFromPod: error loading ${fileUrl}`, error)
            failCount++
            if (onError) onError(fileUrl, error instanceof Error ? error : new Error(String(error)))
        }
    }

    return {
        data: loadedData,
        result: { success: failCount === 0, successCount, failCount, totalCount: ttlUrls.length }
    }
}

/**
 * Saves an array of items as .ttl files in a Pod container, deleting orphaned .ttl files.
 */
export async function saveMultipleRdfToPod<T extends { id: string }>(
    session: Session,
    containerUrl: string,
    items: T[],
    serializer: (item: T, datasetUrl: string) => SolidDataset
): Promise<PodSyncResult> {
    let successCount = 0
    let failCount = 0
    let deleteCount = 0

    // Detect and remove orphaned .ttl files
    try {
        const dataset = await getSolidDataset(containerUrl, { fetch: session.fetch })
        const ttlUrls = getContainedResourceUrlAll(dataset).filter(url => url.endsWith('.ttl'))
        const currentIds = new Set(items.map(item => item.id))

        for (const fileUrl of ttlUrls) {
            const filename = fileUrl.split('/').pop()
            const itemId = filename?.replace('.ttl', '')
            if (itemId && !currentIds.has(itemId)) {
                try {
                    await deleteFile(fileUrl, { fetch: session.fetch })
                    deleteCount++
                } catch (error: unknown) {
                    if (isAuthenticationError(error)) handlePodError(error)
                    console.error(`saveMultipleRdfToPod: error deleting ${fileUrl}`, error)
                    failCount++
                }
            }
        }
    } catch (error: unknown) {
        if (isAuthenticationError(error)) handlePodError(error)
        if (getStatusCode(error) !== 404) console.error('saveMultipleRdfToPod: error checking container', error)
    }

    for (const item of items) {
        try {
            const fileUrl = `${containerUrl}${item.id}.ttl`
            await saveRdfToPod({ session, fileUrl, data: item, serializer })
            successCount++
        } catch (error: unknown) {
            if (error instanceof AuthenticationError) throw error
            console.error(`saveMultipleRdfToPod: error saving ${item.id}`, error)
            failCount++
        }
    }

    return { success: failCount === 0, successCount, failCount, totalCount: items.length + deleteCount }
}

/**
 * Saves multiple items as separate files in a Pod container
 * Returns a sync result with success/failure counts
 * Also removes files from the pod that no longer exist in the items array
 */
export async function saveMultipleFilesToPod<T extends { id: string }>(
    session: Session,
    containerUrl: string,
    items: T[]
): Promise<PodSyncResult> {
    let successCount = 0
    let failCount = 0
    let deleteCount = 0

    // Get existing files in the container to identify orphaned files
    try {
        const dataset = await getSolidDataset(containerUrl, { fetch: session.fetch })
        const fileUrls = getContainedResourceUrlAll(dataset)
        const jsonFileUrls = fileUrls.filter(url => url.endsWith('.json'))

        // Create a set of current item IDs for efficient lookup
        const currentItemIds = new Set(items.map(item => item.id))

        // Delete files that no longer correspond to current items
        for (const fileUrl of jsonFileUrls) {
            const filename = fileUrl.split('/').pop()
            const itemId = filename?.replace('.json', '')

            if (itemId && !currentItemIds.has(itemId)) {
                try {
                    await deleteFile(fileUrl, { fetch: session.fetch })
                    deleteCount++
                } catch (error: unknown) {
                    // Check for authentication errors
                    if (isAuthenticationError(error)) {
                        handlePodError(error)
                    }
                    console.error(`Error deleting file ${fileUrl}:`, error)
                    failCount++
                }
            }
        }
    } catch (error: unknown) {
        // Check for authentication errors
        if (isAuthenticationError(error)) {
            handlePodError(error)
        }
        // If container doesn't exist (404), that's fine - no files to delete
        if (getStatusCode(error) !== 404) {
            console.error('Error checking for orphaned files:', error)
        }
    }

    // Save current items
    for (const item of items) {
        try {
            await saveFileToPod({
                session,
                containerPath: containerUrl,
                filename: `${item.id}.json`,
                data: item
            })
            successCount++
        } catch (error: unknown) {
            // Authentication errors should bubble up immediately
            if (error instanceof AuthenticationError) {
                throw error
            }
            console.error(`Error saving item ${item.id}:`, error)
            failCount++
        }
    }

    return {
        success: failCount === 0,
        successCount,
        failCount,
        totalCount: items.length + deleteCount
    }
}

/**
 * Loads all JSON files from a Pod container
 * Returns an array of parsed data and sync stats
 */
export async function loadMultipleFilesFromPod<T>(
    options: LoadMultipleFromPodOptions<T>
): Promise<{ data: T[], result: PodSyncResult }> {
    const { session, containerPath, onFileLoaded, onError } = options

    // Get the container dataset to list all files
    let dataset
    try {
        dataset = await getSolidDataset(containerPath, { fetch: session.fetch })
    } catch (error: unknown) {
        // Check for authentication errors
        if (isAuthenticationError(error)) {
            handlePodError(error)
        }
        if (getStatusCode(error) === 404) {
            return {
                data: [],
                result: {
                    success: false,
                    successCount: 0,
                    failCount: 0,
                    totalCount: 0
                }
            }
        }
        throw error
    }

    const fileUrls = getContainedResourceUrlAll(dataset)
    const jsonFileUrls = fileUrls.filter(url => url.endsWith('.json'))

    if (jsonFileUrls.length === 0) {
        return {
            data: [],
            result: {
                success: true,
                successCount: 0,
                failCount: 0,
                totalCount: 0
            }
        }
    }

    // Load all files in parallel for faster sync
    const settled = await Promise.allSettled(
        jsonFileUrls.map(fileUrl =>
            getFile(fileUrl, { fetch: session.fetch })
                .then(file => file.text())
                .then(text => ({ fileUrl, item: JSON.parse(text) as T }))
        )
    )

    const loadedData: T[] = []
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < settled.length; i++) {
        const result = settled[i]
        const fileUrl = jsonFileUrls[i]
        if (result.status === 'fulfilled') {
            loadedData.push(result.value.item)
            successCount++
            if (onFileLoaded) {
                onFileLoaded(result.value.item)
            }
        } else {
            const error = result.reason
            // Re-throw authentication errors immediately
            if (isAuthenticationError(error)) {
                handlePodError(error)
            }
            console.error(`Error loading file ${fileUrl}:`, error)
            failCount++
            if (onError) {
                onError(fileUrl, error instanceof Error ? error : new Error(String(error)))
            }
        }
    }

    return {
        data: loadedData,
        result: {
            success: failCount === 0,
            successCount,
            failCount,
            totalCount: jsonFileUrls.length
        }
    }
}

/**
 * Result of a full sync from Pod to local DB
 */
export interface SyncAllResult {
    /** true if the pod question set was newer than local and was saved */
    questionSetSynced: boolean
    /** number of packing lists downloaded from pod and saved locally */
    packingListsSynced: number
    /** number of local-only packing lists uploaded to pod */
    packingListsUploaded: number
}

/**
 * Performs a full one-way sync from the Solid Pod into the local database.
 *
 * - Question set: pod wins if it is newer than the local copy (fallback-to-pod
 *   strategy). If no local copy exists, the pod data is always saved.
 * - Packing lists: all lists present on the pod are saved locally (pod wins for
 *   any conflicting IDs). Local-only lists (not yet on the pod) are uploaded so
 *   data is never lost.
 *
 * 404 responses are treated as "no data" and handled gracefully.
 * Authentication errors (401/403) are re-thrown immediately.
 * Other non-critical errors are logged and skipped so one failure does not
 * prevent the rest of the sync from completing.
 */
export async function syncAllDataFromPod(
    session: Session,
    podUrl: string,
    db: PackingAppDatabase
): Promise<SyncAllResult> {
    let questionSetSynced = false
    let packingListsSynced = 0
    let packingListsUploaded = 0

    const containerUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`

    // ── Download question set and packing lists in parallel ──────────────────
    const [podQsResult, podListsResult] = await Promise.allSettled([
        loadRdfFromPod<PackingListQuestionSet>(
            session,
            `${podUrl}${POD_CONTAINERS.QUESTIONS}`,
            datasetToQuestionSet,
        ),
        loadMultipleRdfFromPod<PackingList>(
            session,
            containerUrl,
            datasetToPackingList,
        ),
    ])

    // ── 1. Question set ──────────────────────────────────────────────────────
    if (podQsResult.status === 'fulfilled') {
        try {
            const podQs = podQsResult.value
            let localQs: PackingListQuestionSet | null = null
            try {
                localQs = await db.getQuestionSet()
            } catch {
                // not_found is expected for a fresh login
            }

            const podTime = podQs.lastModified ? new Date(podQs.lastModified).getTime() : 0
            const localTime = localQs?.lastModified ? new Date(localQs.lastModified).getTime() : 0

            // Fallback-to-pod: save when there is no local copy OR pod is newer
            if (!localQs || podTime > localTime) {
                await db.saveQuestionSet({ ...podQs, _rev: undefined })
                questionSetSynced = true
            }
        } catch (err: unknown) {
            if (err instanceof AuthenticationError) throw err
            console.error('syncAllDataFromPod: error syncing question set', err)
        }
    } else {
        const err = podQsResult.reason
        if (err instanceof AuthenticationError) throw err
        const status = getStatusCode(err)
        if (status !== 404) {
            console.error('syncAllDataFromPod: error syncing question set', err)
        }
        // 404 = no question set on pod yet → silently skip
    }

    // ── 2. Packing lists ─────────────────────────────────────────────────────
    if (podListsResult.status === 'rejected') {
        const err = podListsResult.reason
        if (err instanceof AuthenticationError) throw err
        console.error('syncAllDataFromPod: error loading packing lists', err)
        return { questionSetSynced, packingListsSynced, packingListsUploaded }
    }

    const { data: podLists } = podListsResult.value
    const podListIds = new Set(podLists.map((l) => l.id))

    // Save all pod lists to local DB in parallel (pod wins for conflicting IDs)
    const saveResults = await Promise.allSettled(
        podLists.map(podList => db.savePackingList({ ...podList, _rev: undefined }))
    )
    for (let i = 0; i < saveResults.length; i++) {
        if (saveResults[i].status === 'fulfilled') {
            packingListsSynced++
        } else {
            console.error(`syncAllDataFromPod: error saving packing list ${podLists[i].id}`, (saveResults[i] as PromiseRejectedResult).reason)
        }
    }

    // Upload any local-only lists to the pod so they are not lost
    const localLists = await db.getAllPackingLists()
    for (const localList of localLists) {
        if (podListIds.has(localList.id)) continue
        try {
            await saveRdfToPod({
                session,
                fileUrl: `${containerUrl}${localList.id}.ttl`,
                data: localList,
                serializer: packingListToDataset,
            })
            packingListsUploaded++
        } catch (err) {
            if (err instanceof AuthenticationError) throw err
            console.error(`syncAllDataFromPod: error uploading local list ${localList.id}`, err)
        }
    }

    return { questionSetSynced, packingListsSynced, packingListsUploaded }
}
