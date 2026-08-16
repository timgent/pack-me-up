import { AppSession as Session } from '../types/AppSession'
import { getPodUrlAll, overwriteFile, getSolidDataset, getContainedResourceUrlAll, getFile, deleteFile, solidDatasetAsTurtle, universalAccess, getResourceInfoWithAcl, hasResourceAcl, hasFallbackAcl, hasAccessibleAcl, getResourceAcl, createAclFromFallbackAcl, saveAclFor, setAgentResourceAccess, setAgentDefaultAccess, createContainerAt, acp_ess_2, getThing, getStringNoLocale } from '@inrupt/solid-client'
import type { SolidDataset, Access } from '@inrupt/solid-client'
const { getAgentAccessAll, setPublicAccess, getPublicAccess } = universalAccess
import { PackingAppDatabase } from './database'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList } from '../create-packing-list/types'
import { packingListToDataset, datasetToPackingList, datasetToQuestionSet, datasetToSharedWithMe, datasetToSharedListsWithMe } from './rdfSerialization'
import type { SharedWithMeList, SharedListsWithMe } from './rdfSerialization'

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
    SHARED_WITH_ME: 'pack-me-up/shared-with-me.ttl',
    SHARED_LISTS_WITH_ME: 'pack-me-up/shared-lists-with-me.ttl',
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SERVICE_SUBDOMAINS = new Set(['storage', 'pod', 'pods', 'www', 'app'])

export function friendlyPodName(podUrl: string): string {
    try {
        const url = new URL(podUrl)
        const parts = url.hostname.split('.')
        // Strip known service subdomain prefixes (storage.inrupt.com → inrupt.com)
        const cleanHostname = parts.length >= 3 && SERVICE_SUBDOMAINS.has(parts[0])
            ? parts.slice(1).join('.')
            : url.hostname

        const firstSegment = url.pathname.split('/').find(s => s.length > 0)
        if (firstSegment && !UUID_RE.test(firstSegment)) {
            return `${firstSegment} on ${cleanHostname}`
        }

        // Treat first subdomain as username when it isn't a service subdomain
        // e.g. alice.solidcommunity.net → "alice on solidcommunity.net"
        if (parts.length >= 3 && !SERVICE_SUBDOMAINS.has(parts[0])) {
            return `${parts[0]} on ${parts.slice(1).join('.')}`
        }

        return cleanHostname
    } catch {
        return podUrl
    }
}

export function friendlyWebIdName(webId: string): string {
    try {
        const url = new URL(webId)
        url.hash = ''
        // Strip well-known profile path suffixes so the identity root is used,
        // but preserve meaningful path segments (e.g. /timgent on id.inrupt.com)
        url.pathname = url.pathname
            .replace(/\/profile\/card\/?$/, '/')
            .replace(/\/profile\/?$/, '/')
        return friendlyPodName(url.toString())
    } catch {
        return webId
    }
}

export function resolveOwnerDisplayName(
    foafName: string | null | undefined,
    ownerWebId: string | null | undefined,
    podUrl: string,
): string {
    return foafName ?? (ownerWebId ? friendlyWebIdName(ownerWebId) : null) ?? friendlyPodName(podUrl)
}

export function buildSharedListPath(listId: string, podUrl: string, ownerWebId?: string): string {
    const base = `/view-lists/${listId}?pod=${encodeURIComponent(podUrl)}`
    return ownerWebId ? `${base}&owner=${encodeURIComponent(ownerWebId)}` : base
}

export function buildSharedListUrl(listId: string, podUrl: string, ownerWebId?: string): string {
    return `${window.location.origin}/#${buildSharedListPath(listId, podUrl, ownerWebId)}`
}

export function deriveWebIdFromPodUrl(podUrl: string): string {
    const base = podUrl.replace(/\/+$/, '')
    return `${base}/profile/card#me`
}

export async function getPodOwnerName(session: Session, podUrl: string, explicitWebId?: string): Promise<string | null> {
    const webId = explicitWebId ?? deriveWebIdFromPodUrl(podUrl)
    const profileCardUrl = webId.replace(/#.*$/, '')
    try {
        const dataset = await getSolidDataset(profileCardUrl, { fetch: session.fetch })
        const profile = getThing(dataset, webId)
        if (!profile) return null
        return getStringNoLocale(profile, 'http://xmlns.com/foaf/0.1/name') ?? null
    } catch {
        return null
    }
}

/**
 * Derives the Pod root from a WebID that lives inside the Pod it describes —
 * the `.../profile/card#me` convention used by CSS and NSS.
 *
 * Returns null for every other WebID shape. A WebID minted by an identity
 * provider (e.g. https://id.inrupt.com/alice) says nothing about where that
 * user's storage lives — it is on a different host entirely
 * (https://storage.inrupt.com/<uuid>/). Guessing a Pod root from it sends every
 * read and write to the identity provider, which 404s.
 */
export function derivePodUrlFromWebId(webId: string): string | null {
    try {
        const url = new URL(webId)
        url.hash = ''
        const path = url.pathname
        if (path.endsWith('/profile/card')) {
            url.pathname = path.slice(0, -'profile/card'.length)
            return url.toString()
        }
    } catch { /* ignore URL parse errors */ }
    return null
}

export async function grantCollaboratorAccess(
    session: Session,
    resourceUrl: string,
    collaboratorWebId: string
): Promise<void> {
    const accessModes: Access = { read: true, write: true, append: true, control: false }
    const isContainer = resourceUrl.endsWith('/')
    try {
        const resourceWithOldAcl = await getResourceInfoWithAcl(resourceUrl, { fetch: session.fetch })
        // hasAccessibleAcl narrows aclUrl from string|undefined to string, required by saveAclFor/createAclFromFallbackAcl.
        // hasResourceAcl/hasFallbackAcl distinguish real WAC ACL files from ACP ACRs that also appear via rel="acl".
        if (hasAccessibleAcl(resourceWithOldAcl) && hasResourceAcl(resourceWithOldAcl)) {
            // WAC path: resource ACL exists
            let aclDataset = getResourceAcl(resourceWithOldAcl)
            aclDataset = setAgentResourceAccess(aclDataset, collaboratorWebId, accessModes)
            if (isContainer) aclDataset = setAgentDefaultAccess(aclDataset, collaboratorWebId, accessModes)
            await saveAclFor(resourceWithOldAcl, aclDataset, { fetch: session.fetch })
        } else if (hasAccessibleAcl(resourceWithOldAcl) && hasFallbackAcl(resourceWithOldAcl)) {
            // WAC path: create resource ACL from inherited fallback
            let aclDataset = createAclFromFallbackAcl(resourceWithOldAcl)
            aclDataset = setAgentResourceAccess(aclDataset, collaboratorWebId, accessModes)
            if (isContainer) aclDataset = setAgentDefaultAccess(aclDataset, collaboratorWebId, accessModes)
            await saveAclFor(resourceWithOldAcl, aclDataset, { fetch: session.fetch })
        } else {
            // ACP path (Inrupt PodSpaces / ESS): hasAccessibleAcl true but no WAC files, or no acl link at all.
            // universalAccess handles ACP internally. For containers, also propagate via memberAccessControl.
            const result = await universalAccess.setAgentAccess(resourceUrl, collaboratorWebId, accessModes, { fetch: session.fetch })
            if (result === null) {
                throw new Error('grantCollaboratorAccess: server does not support access control for this resource')
            }
            if (isContainer) {
                await addAcpMemberAccess(session, resourceUrl)
            }
        }
    } catch (error) {
        if (isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

export async function grantPublicAccess(
    session: Session,
    fileUrl: string
): Promise<void> {
    try {
        const result = await setPublicAccess(
            fileUrl,
            { read: true, write: true, append: true },
            { fetch: session.fetch }
        )
        if (result === null) {
            throw new Error('grantPublicAccess: server does not support access control for this resource')
        }
    } catch (error) {
        if (isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

export async function isPubliclyAccessible(
    session: Session,
    fileUrl: string
): Promise<boolean> {
    try {
        const result = await getPublicAccess(fileUrl, { fetch: session.fetch })
        return result?.read === true
    } catch (error) {
        if (isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

export async function revokePublicAccess(
    session: Session,
    fileUrl: string
): Promise<void> {
    try {
        const result = await setPublicAccess(
            fileUrl,
            { read: false, write: false, append: false },
            { fetch: session.fetch }
        )
        if (result === null) {
            throw new Error('revokePublicAccess: server does not support access control for this resource')
        }
    } catch (error) {
        if (isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

export async function revokeCollaboratorAccess(
    session: Session,
    resourceUrl: string,
    collaboratorWebId: string
): Promise<void> {
    const noAccess: Access = { read: false, write: false, append: false, control: false }
    const isContainer = resourceUrl.endsWith('/')
    try {
        const resourceWithOldAcl = await getResourceInfoWithAcl(resourceUrl, { fetch: session.fetch })
        if (hasAccessibleAcl(resourceWithOldAcl) && hasResourceAcl(resourceWithOldAcl)) {
            // WAC path: resource ACL exists, modify it directly
            let aclDataset = getResourceAcl(resourceWithOldAcl)
            aclDataset = setAgentResourceAccess(aclDataset, collaboratorWebId, noAccess)
            if (isContainer) aclDataset = setAgentDefaultAccess(aclDataset, collaboratorWebId, noAccess)
            await saveAclFor(resourceWithOldAcl, aclDataset, { fetch: session.fetch })
        } else if (hasAccessibleAcl(resourceWithOldAcl) && hasFallbackAcl(resourceWithOldAcl)) {
            // WAC path: no resource ACL yet — nothing to revoke
            return
        } else {
            // ACP path (Inrupt PodSpaces / ESS)
            await universalAccess.setAgentAccess(resourceUrl, collaboratorWebId, noAccess, { fetch: session.fetch })
        }
    } catch (error) {
        if (isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

// Special agent URIs that represent public/authenticated access rather than named people
const SYSTEM_AGENT_URIS = new Set([
    'http://www.w3.org/ns/solid/acp#PublicAgent',       // ACP public agent
    'http://xmlns.com/foaf/0.1/Agent',                  // WAC foaf:Agent (public)
    'http://www.w3.org/ns/auth/acl#AuthenticatedAgent', // WAC authenticated-user wildcard
])

export async function getCollaborators(
    session: Session,
    fileUrl: string
): Promise<string[]> {
    try {
        const accessMap = await getAgentAccessAll(fileUrl, { fetch: session.fetch })
        if (!accessMap) return []
        return Object.entries(accessMap)
            .filter(([webId, modes]) =>
                webId !== session.info.webId &&
                !SYSTEM_AGENT_URIS.has(webId) &&
                modes.read === true
            )
            .map(([webId]) => webId)
    } catch (error) {
        if (isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

export async function grantFullCollaboratorAccess(
    session: Session,
    podUrl: string,
    collaboratorWebId: string
): Promise<void> {
    const packMeUpUrl = `${podUrl}${POD_CONTAINERS.ROOT}`
    await ensureContainerExists(session, packMeUpUrl)

    // WAC servers (CSS, NSS): one container-level grant with acl:default inheritance covers everything.
    // grantCollaboratorAccess handles WAC vs ACP detection internally.
    // On WAC (CSS/NSS), acl:default on the container propagates to all children.
    // On ACP (Inrupt PodSpaces/ESS), grantCollaboratorAccess adds memberAccessControl
    // so child resources inherit the policy automatically.
    await grantCollaboratorAccess(session, packMeUpUrl, collaboratorWebId)
}

export async function revokeFullCollaboratorAccess(
    session: Session,
    podUrl: string,
    collaboratorWebId: string
): Promise<void> {
    const packMeUpUrl = `${podUrl}${POD_CONTAINERS.ROOT}`
    try {
        await revokeCollaboratorAccess(session, packMeUpUrl, collaboratorWebId)
    } catch (err) {
        if (getStatusCode(err) === 404) return // container doesn't exist, nothing to revoke
        throw err
    }
}

export async function getFullCollaborators(
    session: Session,
    podUrl: string
): Promise<string[]> {
    const packMeUpUrl = `${podUrl}${POD_CONTAINERS.ROOT}`
    try {
        return await getCollaborators(session, packMeUpUrl)
    } catch (err) {
        // Container doesn't exist yet → no collaborators have been granted access
        if (getStatusCode(err) === 404) return []
        throw err
    }
}

// After universalAccess.setAgentAccess sets policies on an ACP container, copy those
// policies into memberAccessControl so all child resources inherit them automatically.
async function addAcpMemberAccess(session: Session, containerUrl: string): Promise<void> {
    try {
        const resourceWithAcr = await acp_ess_2.getSolidDatasetWithAcr(containerUrl, { fetch: session.fetch })
        // hasAccessibleAcr narrows to WithAccessibleAcr (non-null ACR) required by the policy functions
        if (!acp_ess_2.hasAccessibleAcr(resourceWithAcr)) return
        const policyUrls = acp_ess_2.getPolicyUrlAll(resourceWithAcr)
        let updated: typeof resourceWithAcr = resourceWithAcr
        for (const policyUrl of policyUrls) {
            updated = acp_ess_2.addMemberPolicyUrl(updated, policyUrl)
        }
        await acp_ess_2.saveAcrFor(updated, { fetch: session.fetch })
    } catch (err) {
        console.warn('addAcpMemberAccess: could not set memberAccessControl', err)
    }
}

async function ensureContainerExists(session: Session, containerUrl: string): Promise<void> {
    try {
        await getSolidDataset(containerUrl, { fetch: session.fetch })
    } catch (err) {
        const status = getStatusCode(err)
        // No read access — assume the container exists and let the write reveal any real problem
        if (status === 401 || status === 403) return
        if (status !== 404) throw err
        try {
            await createContainerAt(containerUrl, { fetch: session.fetch })
        } catch (createErr) {
            // 409 Conflict = container was created concurrently; ignore
            if (getStatusCode(createErr) !== 409) throw createErr
        }
    }
}

export async function verifyForeignPodAccess(
    session: Session,
    foreignPodUrl: string
): Promise<boolean> {
    try {
        await getSolidDataset(`${foreignPodUrl}${POD_CONTAINERS.PACKING_LISTS}`, { fetch: session.fetch })
        return true
    } catch (err: unknown) {
        const status = getStatusCode(err)
        if (status === 403 || status === 401 || status === 404) return false
        throw err
    }
}

function getStatusCode(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null) return undefined
    const code = (err as { statusCode?: unknown }).statusCode
    return typeof code === 'number' ? code : undefined
}

const POD_URL_CACHE_PREFIX = 'pod-url:'

/**
 * The last Pod URL we successfully resolved for a WebID. Used only when the
 * profile document can't be read, so a momentary network blip doesn't leave the
 * app with no idea where the Pod is (which would also switch the local database
 * namespace, making the user's lists look like they had vanished).
 */
function readCachedPodUrl(webId: string): string | null {
    try {
        return localStorage.getItem(`${POD_URL_CACHE_PREFIX}${webId}`)
    } catch {
        return null
    }
}

function cachePodUrl(webId: string, podUrl: string): void {
    try {
        localStorage.setItem(`${POD_URL_CACHE_PREFIX}${webId}`, podUrl)
    } catch { /* storage unavailable (private browsing, quota) — caching is best-effort */ }
}

/**
 * Validates session and retrieves the user's primary Pod URL.
 *
 * The `pim:storage` triple in the WebID profile is the only authoritative source
 * for where a Pod lives, so an unreadable profile means "unknown", never "guess
 * from the WebID host".
 *
 * @returns Pod URL if it can be determined, null otherwise
 */
export async function getPrimaryPodUrl(session: Session | null): Promise<string | null> {
    if (!session || !session.info.isLoggedIn || !session.info.webId) {
        return null
    }

    const webId = session.info.webId

    let podUrls: string[]
    try {
        podUrls = await getPodUrlAll(webId, { fetch: session.fetch })
    } catch (err) {
        // The profile document itself couldn't be fetched (transient network
        // error, DPoP nonce race, expired token). We know nothing about the
        // Pod's location, so reuse the last known one and otherwise give up —
        // callers report "no pod" and retry on the next sync.
        console.warn('getPrimaryPodUrl: could not read the WebID profile', err)
        return readCachedPodUrl(webId)
    }

    if (podUrls && podUrls.length > 0) {
        cachePodUrl(webId, podUrls[0])
        return podUrls[0]
    }

    // Profile was readable but declares no pim:storage — the case for CSS v7,
    // where the WebID sits inside the Pod it belongs to.
    const derivedPodUrl = derivePodUrlFromWebId(webId)
    if (derivedPodUrl) {
        cachePodUrl(webId, derivedPodUrl)
        return derivedPodUrl
    }

    return readCachedPodUrl(webId)
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
        if (getStatusCode(error) === 404) return
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
    session: Session | null
    fileUrl: string
    data: T
    serializer: (data: T, datasetUrl: string) => SolidDataset
}

/**
 * Last-seen ETag + deserialized result per URL, so a poll that finds nothing
 * changed can skip both the RDF parse and the deserializer walk entirely.
 *
 * Module-level and unbounded: keyed by full URL, so switching pods just adds
 * inert entries for the old one rather than serving stale data, and the
 * number of distinct RDF resources a session polls is small.
 */
const lastSeenByUrl = new Map<string, { etag: string; result: unknown }>()

/**
 * Loads an RDF dataset from a Pod URL and deserializes it via the provided function.
 *
 * Sends a conditional GET (`If-None-Match` against the ETag of whatever we
 * last parsed from this URL) so a poll that finds nothing changed gets back
 * a body-less 304 instead of the full resource. That matters because parsing
 * a Turtle response into a SolidDataset is expensive for a graph of any real
 * size — @inrupt/solid-client builds it by copying the accumulated
 * graphs/subjects/predicates structure once per quad — and a page that polls
 * on a timer (see `usePodSync`'s `pollInterval`) was paying that cost on
 * every tick even when the pod hadn't changed since the last one. See
 * docs/questions-page-mobile-performance.md for the investigation that found
 * this. A 304 makes `getSolidDataset` throw (it treats any non-2xx as an
 * error) before it ever reaches the parser, which is exactly the point —
 * the cached result from last time is still correct and is returned instead.
 */
export async function loadRdfFromPod<T>(
    session: Session | null,
    fileUrl: string,
    deserializer: (dataset: SolidDataset, datasetUrl: string) => T
): Promise<T> {
    const fetchFn = session?.fetch ?? globalThis.fetch
    const lastSeen = lastSeenByUrl.get(fileUrl)
    let observedEtag: string | null = null
    const conditionalFetch: typeof fetch = (input, init) => {
        const headers = new Headers(init?.headers)
        if (lastSeen) headers.set('If-None-Match', lastSeen.etag)
        return fetchFn(input, { ...init, headers }).then(response => {
            observedEtag = response.headers.get('etag')
            return response
        })
    }
    try {
        const dataset = await getSolidDataset(fileUrl, { fetch: conditionalFetch })
        const result = deserializer(dataset, fileUrl)
        if (observedEtag) lastSeenByUrl.set(fileUrl, { etag: observedEtag, result })
        else lastSeenByUrl.delete(fileUrl)
        return result
    } catch (error: unknown) {
        if (getStatusCode(error) === 304 && lastSeen) return lastSeen.result as T
        if (session && isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

/**
 * Serializes data to RDF (Turtle) and saves it as a full PUT at the given Pod URL.
 *
 * Uses overwriteFile with solidDatasetAsTurtle to avoid SPARQL UPDATE (PATCH),
 * which produces truncated Turtle on CSS v7 when adding new triples.
 */
export async function saveRdfToPod<T>(options: SaveRdfToPodOptions<T>): Promise<void> {
    const { session, fileUrl, data, serializer } = options
    const fetchFn = session?.fetch ?? globalThis.fetch
    try {
        if (session) {
            const containerUrl = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1)
            await ensureContainerExists(session, containerUrl)
        }
        const newDataset = serializer(data, fileUrl)
        const turtleContent = await solidDatasetAsTurtle(newDataset)
        const blob = new Blob([turtleContent], { type: 'text/turtle' })
        await overwriteFile(fileUrl, blob, { fetch: fetchFn, contentType: 'text/turtle' })
    } catch (error: unknown) {
        if (session && isAuthenticationError(error)) handlePodError(error)
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
    /** true if the shared-with-me list was synced from pod */
    sharedWithMeSynced: boolean
    /** true if the shared-lists-with-me list was synced from pod */
    sharedListsWithMeSynced: boolean
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
    let sharedWithMeSynced = false
    let sharedListsWithMeSynced = false

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
        return { questionSetSynced, packingListsSynced, packingListsUploaded, sharedWithMeSynced, sharedListsWithMeSynced }
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

    // ── 3. SharedWithMe ──────────────────────────────────────────────────────
    try {
        const podSwm = await loadRdfFromPod<SharedWithMeList>(
            session,
            `${podUrl}${POD_CONTAINERS.SHARED_WITH_ME}`,
            datasetToSharedWithMe,
        )
        let localSwm: SharedWithMeList | null = null
        try { localSwm = await db.getSharedWithMe() } catch { /* not_found = ok */ }
        const podTime = new Date(podSwm.lastModified).getTime()
        const localTime = localSwm ? new Date(localSwm.lastModified).getTime() : 0
        if (!localSwm || podTime > localTime) {
            await db.saveSharedWithMe(podSwm)
            sharedWithMeSynced = true
        }
    } catch (err: unknown) {
        if (err instanceof AuthenticationError) throw err
        const status = getStatusCode(err)
        if (status !== 404) console.error('syncAllDataFromPod: error syncing shared-with-me', err)
        // 404 = no shared-with-me yet → silently skip
    }

    // ── 4. SharedListsWithMe ─────────────────────────────────────────────────
    try {
        const podSlwm = await loadRdfFromPod<SharedListsWithMe>(
            session,
            `${podUrl}${POD_CONTAINERS.SHARED_LISTS_WITH_ME}`,
            datasetToSharedListsWithMe,
        )
        let localSlwm: SharedListsWithMe | null = null
        try { localSlwm = await db.getSharedListsWithMe() } catch { /* not_found = ok */ }
        const podTime = new Date(podSlwm.lastModified).getTime()
        const localTime = localSlwm ? new Date(localSlwm.lastModified).getTime() : 0
        if (!localSlwm || podTime > localTime) {
            await db.saveSharedListsWithMe(podSlwm)
            sharedListsWithMeSynced = true
        }
    } catch (err: unknown) {
        if (err instanceof AuthenticationError) throw err
        const status = getStatusCode(err)
        if (status !== 404) console.error('syncAllDataFromPod: error syncing shared-lists-with-me', err)
        // 404 = no shared-lists-with-me yet → silently skip
    }

    return { questionSetSynced, packingListsSynced, packingListsUploaded, sharedWithMeSynced, sharedListsWithMeSynced }
}
