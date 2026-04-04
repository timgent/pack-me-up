import { Session } from '@inrupt/solid-client-authn-browser'
import { getPodUrlAll, saveFileInContainer, overwriteFile, getSolidDataset, getContainedResourceUrlAll, getFile, deleteFile } from '@inrupt/solid-client'

/**
 * Pod container paths under the user's Pod root
 */
export const POD_CONTAINERS = {
    ROOT: 'pack-me-up/',
    QUESTIONS: 'pack-me-up/packing-list-questions.json',
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

    const podUrls = await getPodUrlAll(session.info.webId, { fetch: session.fetch })

    if (!podUrls || podUrls.length === 0) {
        return null
    }

    return podUrls[0]
}

/**
 * Checks whether the user's Solid Pod contains any data saved by this app.
 * Checks the questions file first, then the packing lists container.
 * Uses remote requests so it works correctly on any device, regardless of local cache state.
 */
export async function hasPodData(session: Session, podUrl: string): Promise<boolean> {
    try {
        await getFile(`${podUrl}${POD_CONTAINERS.QUESTIONS}`, { fetch: session.fetch })
        return true
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) !== 404) throw err
    }

    try {
        const dataset = await getSolidDataset(`${podUrl}${POD_CONTAINERS.PACKING_LISTS}`, { fetch: session.fetch })
        return getContainedResourceUrlAll(dataset).some(url => url.endsWith('.json'))
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
    const file = new File([blob], filename, { type: 'application/json' })

    // Try saveFileInContainer first (creates new file in container)
    try {
        await saveFileInContainer(
            containerPath,
            file,
            {
                fetch: session.fetch,
                slug: filename
            }
        )
    } catch (saveError: unknown) {
        // Check for authentication errors first
        if (isAuthenticationError(saveError)) {
            handlePodError(saveError)
        }

        // If container doesn't exist (404) or file already exists (409),
        // use overwriteFile instead
        const saveStatusCode = getStatusCode(saveError)
        if (saveStatusCode === 404 || saveStatusCode === 409) {
            try {
                const fileUrl = `${containerPath}${filename}`
                await overwriteFile(fileUrl, blob, {
                    fetch: session.fetch,
                    contentType: 'application/json'
                })
            } catch (overwriteError: unknown) {
                // Check for authentication errors in overwrite
                if (isAuthenticationError(overwriteError)) {
                    handlePodError(overwriteError)
                }
                throw overwriteError
            }
        } else {
            throw saveError
        }
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

    const loadedData: T[] = []
    let successCount = 0
    let failCount = 0

    // Load each file
    for (const fileUrl of jsonFileUrls) {
        try {
            const file = await getFile(fileUrl, { fetch: session.fetch })
            const text = await file.text()
            const item = JSON.parse(text) as T

            loadedData.push(item)
            successCount++

            if (onFileLoaded) {
                onFileLoaded(item)
            }
        } catch (error: unknown) {
            // Check for authentication errors
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
