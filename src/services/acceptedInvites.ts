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
        const existing = sharedWithMe.contexts.find(c => c.podUrl === invite.podUrl)
        // Already waiting: nothing to add. Already recorded but not waiting —
        // shared before, perhaps revoked, now invited again — is a wait again
        // until the new grant lands; if it never went away, the Sharing page
        // sees it open and clears the wait at once.
        if (existing?.awaitingAccess) return { sharedWithMe: null, sharedListsWithMe: null }
        return {
            sharedWithMe: {
                contexts: existing
                    ? sharedWithMe.contexts.map(c => (c === existing ? { ...c, awaitingAccess: true } : c))
                    : [...sharedWithMe.contexts, {
                        podUrl: invite.podUrl,
                        webId: invite.ownerWebId,
                        ...(invite.ownerName ? { label: invite.ownerName } : {}),
                        addedAt: now,
                        awaitingAccess: true,
                    }],
                lastModified: now,
            },
            sharedListsWithMe: null,
        }
    }

    const listId = invite.listId
    if (!listId) return { sharedWithMe: null, sharedListsWithMe: null }
    const existing = sharedListsWithMe.lists.find(l => l.listId === listId)
    if (existing?.awaitingAccess) return { sharedWithMe: null, sharedListsWithMe: null }
    return {
        sharedWithMe: null,
        sharedListsWithMe: {
            lists: existing
                ? sharedListsWithMe.lists.map(l => (l === existing ? { ...l, awaitingAccess: true } : l))
                : [...sharedListsWithMe.lists, {
                    listId,
                    listUrl: `${invite.podUrl}${POD_CONTAINERS.PACKING_LISTS}${listId}.ttl`,
                    podUrl: invite.podUrl,
                    ownerWebId: invite.ownerWebId,
                    ...(invite.label ? { label: invite.label } : {}),
                    addedAt: now,
                    awaitingAccess: true,
                }],
            lastModified: now,
        },
    }
}

/**
 * The shared-with-me document with the wait cleared on a share that has just
 * been seen to open, or null when there was no wait to clear.
 *
 * This is what makes a later refusal mean something: once a share has opened,
 * being turned away is access taken away, not a sender who has yet to run the
 * app. Every place that sees a share open calls it — the Sharing page's check,
 * and opening the share itself.
 */
export function withAccessConfirmed(list: SharedWithMeList, target: { kind: 'setup'; podUrl: string }, now: string): SharedWithMeList | null
export function withAccessConfirmed(list: SharedListsWithMe, target: { kind: 'list'; listUrl: string }, now: string): SharedListsWithMe | null
export function withAccessConfirmed(
    list: SharedWithMeList | SharedListsWithMe,
    target: { kind: 'setup'; podUrl: string } | { kind: 'list'; listUrl: string },
    now: string,
): SharedWithMeList | SharedListsWithMe | null {
    const confirm = <T extends { awaitingAccess?: boolean }>(entries: T[], matches: (entry: T) => boolean): T[] | null => {
        if (!entries.some(e => matches(e) && e.awaitingAccess)) return null
        return entries.map(e => {
            if (!matches(e) || !e.awaitingAccess) return e
            const { awaitingAccess: _cleared, ...rest } = e
            return rest as T
        })
    }
    if ('contexts' in list) {
        if (target.kind !== 'setup') return null
        const contexts = confirm(list.contexts, c => c.podUrl === target.podUrl)
        return contexts ? { contexts, lastModified: now } : null
    }
    if (target.kind !== 'list') return null
    const lists = confirm(list.lists, l => l.listUrl === target.listUrl)
    return lists ? { lists, lastModified: now } : null
}
