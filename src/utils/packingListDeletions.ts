import type { DeletedPackingLists, PackingListDeletion } from '../services/rdfSerialization'
import type { PackingList } from '../create-packing-list/types'

/**
 * How long a tombstone is kept before it is dropped.
 *
 * The registry is replicated to the pod, so it cannot grow without bound. A
 * device that has been offline for longer than this can still resurrect a list
 * it holds; a year is long enough that this is a fair trade for a file that
 * stays small.
 */
export const DELETION_RETENTION_DAYS = 365

/** Timestamp used for a registry that has never been written. Any pod copy wins. */
export const EMPTY_REGISTRY_TIMESTAMP = new Date(0).toISOString()

export function emptyDeletedPackingLists(): DeletedPackingLists {
    return { deletions: [], lastModified: EMPTY_REGISTRY_TIMESTAMP }
}

function time(iso: string | undefined): number {
    if (!iso) return 0
    const ms = new Date(iso).getTime()
    return Number.isNaN(ms) ? 0 : ms
}

/**
 * Combines two registries: every tombstone from either side, keeping the later
 * `deletedAt` when both know about the same list.
 *
 * Deliberately a union rather than last-writer-wins on the whole file: two
 * devices that each delete a different list offline would otherwise lose one of
 * the deletions when they meet.
 */
export function mergeDeletedPackingLists(
    a: DeletedPackingLists,
    b: DeletedPackingLists
): DeletedPackingLists {
    const byListId = new Map<string, PackingListDeletion>()
    for (const deletion of [...a.deletions, ...b.deletions]) {
        const existing = byListId.get(deletion.listId)
        if (!existing || time(deletion.deletedAt) > time(existing.deletedAt)) {
            byListId.set(deletion.listId, deletion)
        }
    }
    return {
        deletions: sortDeletions([...byListId.values()]),
        lastModified: time(a.lastModified) >= time(b.lastModified) ? a.lastModified : b.lastModified,
    }
}

/** Adds (or refreshes) the tombstone for a list. */
export function withDeletion(
    registry: DeletedPackingLists,
    listId: string,
    deletedAt: string
): DeletedPackingLists {
    return mergeDeletedPackingLists(registry, {
        deletions: [{ listId, deletedAt }],
        lastModified: deletedAt,
    })
}

/** Removes the tombstone for a list, e.g. once a newer copy has resurrected it. */
export function withoutDeletion(
    registry: DeletedPackingLists,
    listId: string,
    now: string = new Date().toISOString()
): DeletedPackingLists {
    if (!registry.deletions.some(d => d.listId === listId)) return registry
    return {
        deletions: registry.deletions.filter(d => d.listId !== listId),
        lastModified: now,
    }
}

/** Drops tombstones older than the retention window. */
export function pruneDeletions(
    registry: DeletedPackingLists,
    now: number = Date.now()
): DeletedPackingLists {
    const cutoff = now - DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000
    const kept = registry.deletions.filter(d => time(d.deletedAt) >= cutoff)
    if (kept.length === registry.deletions.length) return registry
    return { deletions: kept, lastModified: registry.lastModified }
}

export function deletionsById(registry: DeletedPackingLists): Map<string, string> {
    return new Map(registry.deletions.map(d => [d.listId, d.deletedAt]))
}

/**
 * Whether a copy of a list outlives its tombstone.
 *
 * A list edited *after* it was deleted has been deliberately brought back (or
 * the delete lost a race with an edit), so the newer copy wins and the tombstone
 * is dropped. A list with no `lastModified` at all cannot make that claim.
 */
export function isNewerThanDeletion(
    list: Pick<PackingList, 'lastModified'>,
    deletedAt: string
): boolean {
    return time(list.lastModified) > time(deletedAt)
}

export function registriesEqual(a: DeletedPackingLists, b: DeletedPackingLists): boolean {
    if (a.deletions.length !== b.deletions.length) return false
    const bById = deletionsById(b)
    return a.deletions.every(d => bById.get(d.listId) === d.deletedAt)
}

function sortDeletions(deletions: PackingListDeletion[]): PackingListDeletion[] {
    return [...deletions].sort((x, y) => x.listId.localeCompare(y.listId))
}
