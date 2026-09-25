import {
    deleteFile,
    getContainedResourceUrlAll,
    getSolidDataset,
    overwriteFile,
    solidDatasetAsTurtle,
    universalAccess,
} from '@inrupt/solid-client'
import type { AppSession } from '../types/AppSession'
import { createInviteToken, isInviteToken } from './inviteToken'
import {
    datasetToInvite,
    inviteAcceptancePatch,
    inviteToDataset,
    type Invite,
    type InviteKind,
} from './rdfSerialization'
import { POD_CONTAINERS } from './solidPod'

/**
 * Invite links: the half of sharing that does not need an address first.
 *
 * Each invite is one resource whose URL carries the secret from the link, and
 * which is granted public Append and nothing else. That single choice is what
 * makes the rest fall out — see the long note in `rdfSerialization.ts` for why
 * this shape rather than a shared inbox, and what it buys.
 *
 * Nothing here is a security boundary on its own. A token proves only that
 * whoever used it was sent the link; the grant it leads to is decided by the
 * inviter's own client, against her own record of what she sent.
 */

/** Sits beside the other pack-me-up resources, so one namespace covers it. */
export const INVITES_CONTAINER = `${POD_CONTAINERS.ROOT}invites/`

export const inviteContainerUrl = (podUrl: string) => `${podUrl}${INVITES_CONTAINER}`

/** An invite as it exists on a Pod: the record plus where it lives. */
export interface StoredInvite extends Invite {
    url: string
}

/** Thrown when a Pod will not do the access control invites are built on. */
export class InviteAccessError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'InviteAccessError'
    }
}

/** Thrown when accepting an invite cannot succeed, with a reason to show. */
export class InviteAcceptError extends Error {
    constructor(message: string, readonly status: number) {
        super(message)
        this.name = 'InviteAcceptError'
    }
}

export function inviteUrlFor(podUrl: string, token: string): string {
    // The token becomes a path segment. Unchecked, a crafted one is a path
    // traversal into somebody's Pod, so this is the boundary that stops it.
    if (!isInviteToken(token)) throw new Error('Not an invite token')
    return `${inviteContainerUrl(podUrl)}${token}`
}

/**
 * Creates an invite and opens it for acceptance.
 *
 * Write first, grant second: granting first would publish an appendable URL
 * pointing at nothing. And if the grant fails the resource is removed again,
 * because an invite nobody can append to is a link that silently never works —
 * worse than no link at all, since the sender has no way to tell.
 */
export async function createInvite(
    session: AppSession,
    podUrl: string,
    details: { kind: InviteKind; listId?: string; label?: string },
): Promise<StoredInvite> {
    const invite: Invite = {
        token: createInviteToken(),
        kind: details.kind,
        createdAt: new Date().toISOString(),
        acceptedBy: [],
        ...(details.listId ? { listId: details.listId } : {}),
        ...(details.label ? { label: details.label } : {}),
    }
    const url = inviteUrlFor(podUrl, invite.token)

    const turtle = await solidDatasetAsTurtle(inviteToDataset(invite, url))
    await overwriteFile(url, new Blob([turtle], { type: 'text/turtle' }), {
        fetch: session.fetch,
        contentType: 'text/turtle',
    })

    let granted
    try {
        granted = await universalAccess.setPublicAccess(
            url,
            { read: false, append: true, write: false },
            { fetch: session.fetch },
        )
    } catch (error) {
        await deleteFile(url, { fetch: session.fetch }).catch(() => { /* best effort */ })
        throw error
    }

    if (granted === null || granted.append !== true) {
        await deleteFile(url, { fetch: session.fetch }).catch(() => { /* best effort */ })
        throw new InviteAccessError(
            "This Pod won't let the app set access control on an invite, so invite links aren't available here. " +
            'Sharing by address still works.',
        )
    }

    return { ...invite, url }
}

/**
 * Every invite currently on this Pod, with whoever has accepted each.
 *
 * One request per invite, which is fine because the number of invites a person
 * has outstanding is small — and unlike a separate index document, there is
 * nothing here that can disagree with reality.
 */
export async function listInvites(session: AppSession, podUrl: string): Promise<StoredInvite[]> {
    const containerUrl = inviteContainerUrl(podUrl)

    let container
    try {
        container = await getSolidDataset(containerUrl, { fetch: session.fetch })
    } catch {
        // No container is a Pod that has never made an invite, which is the
        // normal state of most Pods.
        return []
    }

    const urls = getContainedResourceUrlAll(container)
    const settled = await Promise.allSettled(
        urls.map(async url => {
            const dataset = await getSolidDataset(url, { fetch: session.fetch })
            const invite = datasetToInvite(dataset, url)
            return invite ? { ...invite, url } : null
        }),
    )

    // Anything unreadable or unrecognisable is skipped rather than failing the
    // list: one bad resource in the container must not hide the rest.
    return settled
        .map(result => (result.status === 'fulfilled' ? result.value : null))
        .filter((invite): invite is StoredInvite => invite !== null)
}

/**
 * Accepts an invite by appending your WebID to it.
 *
 * Raw `fetch` rather than solid-client: this is a SPARQL Update patch that
 * only inserts, which is the one shape Append permits, and solid-client's
 * save helpers want to read the resource first — which is exactly what the
 * person accepting is not allowed to do. See `inviteAcceptancePatch` for why
 * SPARQL Update rather than N3-Patch.
 */
export async function acceptInvite(session: AppSession, inviteUrl: string, webId: string): Promise<void> {
    const response = await session.fetch(inviteUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: inviteAcceptancePatch(inviteUrl, webId),
    })

    if (response.ok) return

    // The commonest failure by far is a link whose invite has been revoked or
    // already tidied away, and it deserves its own words — "403 Forbidden"
    // tells the reader nothing they can act on.
    if (response.status === 404 || response.status === 410) {
        throw new InviteAcceptError('This invite link no longer exists. Ask them to send you a new one.', response.status)
    }
    if (response.status === 401 || response.status === 403) {
        throw new InviteAcceptError('This invite link is not accepting replies. Ask them to send you a new one.', response.status)
    }
    throw new InviteAcceptError(`Could not accept this invite (${response.status}).`, response.status)
}

/** Revoking an invite is deleting it: the link stops working immediately. */
export async function deleteInvite(session: AppSession, inviteUrl: string): Promise<void> {
    await deleteFile(inviteUrl, { fetch: session.fetch })
}

/**
 * The link that gets sent.
 *
 * It carries what the invite *is* as well as where it lives, because the
 * person opening it cannot read the resource — so without this the page would
 * have nothing to show them but a URL. None of it is trusted: it decides the
 * wording on one screen, and where the invitee's app looks for the share once
 * access arrives (`acceptedInvites.ts`), while what is actually granted is
 * decided later by the inviter's own client from her own copy of the invite.
 * A list invite carries the list's id for that reason — nothing else could
 * tell the invitee's device which list to open.
 */
export function buildInviteLink(origin: string, podUrl: string, ownerWebId: string, invite: Invite): string {
    const params = new URLSearchParams({
        pod: podUrl,
        owner: ownerWebId,
        kind: invite.kind,
    })
    if (invite.listId) params.set('list', invite.listId)
    if (invite.label) params.set('label', invite.label)
    return `${origin}/#/invite/${invite.token}?${params.toString()}`
}
