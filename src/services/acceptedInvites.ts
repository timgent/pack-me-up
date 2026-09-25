import { POD_CONTAINERS } from './solidPod'
import type { SharedListsWithMe, SharedWithMeList } from './rdfSerialization'

/**
 * The invitee's own record of an invite they accepted.
 *
 * Accepting writes to the *sharer's* Pod and nothing else, and access only
 * arrives when the sharer's app next runs — so without this, the invitee's
 * Sharing page had nothing to show for an invite they had accepted, before the
 * grant or after it, and "it'll show up under Shared with me" was a promise
 * nothing kept. Recording it at acceptance gives the page something to say
 * straight away; whether access has arrived yet is worked out live there.
 *
 * Everything here came out of the link, and none of it is trusted to grant
 * anything — the sharer's own copy of the invite decides that. These values
 * only decide where the invitee's app *looks*, and a tampered one points at
 * something that will not open.
 */
export type AcceptedInvite = {
    podUrl: string
    ownerWebId: string
    /** From their profile card, when it has one. */
    ownerName: string | null
} & (
    | { kind: 'full-setup' }
    | { kind: 'list'; listId?: string; label?: string }
)

/**
 * A list id from a link, or null. It becomes a path segment on somebody's Pod,
 * so anything not shaped like an id — a `../`, a slash, a URL — is refused.
 */
export function invitedListId(value: string | null | undefined): string | null {
    if (!value) return null
    return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null
}

/**
 * The shared-with-me documents with an accepted invite added. Each is null when
 * it needs no change, so the caller writes only what actually changed.
 */
export function withAcceptedInvite(
    invite: AcceptedInvite,
    sharedWithMe: SharedWithMeList,
    sharedListsWithMe: SharedListsWithMe,
    now: string,
): { sharedWithMe: SharedWithMeList | null; sharedListsWithMe: SharedListsWithMe | null } {
    if (invite.kind === 'full-setup') {
        if (sharedWithMe.contexts.some(c => c.podUrl === invite.podUrl)) {
            return { sharedWithMe: null, sharedListsWithMe: null }
        }
        return {
            sharedWithMe: {
                contexts: [...sharedWithMe.contexts, {
                    podUrl: invite.podUrl,
                    webId: invite.ownerWebId,
                    ...(invite.ownerName ? { label: invite.ownerName } : {}),
                    addedAt: now,
                }],
                lastModified: now,
            },
            sharedListsWithMe: null,
        }
    }

    const listId = invite.listId
    if (!listId || sharedListsWithMe.lists.some(l => l.listId === listId)) {
        return { sharedWithMe: null, sharedListsWithMe: null }
    }
    return {
        sharedWithMe: null,
        sharedListsWithMe: {
            lists: [...sharedListsWithMe.lists, {
                listId,
                listUrl: `${invite.podUrl}${POD_CONTAINERS.PACKING_LISTS}${listId}.ttl`,
                podUrl: invite.podUrl,
                ownerWebId: invite.ownerWebId,
                ...(invite.label ? { label: invite.label } : {}),
                addedAt: now,
            }],
            lastModified: now,
        },
    }
}
