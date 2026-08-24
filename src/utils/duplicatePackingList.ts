import type { PackingList } from '../create-packing-list/types'
import { generateUUID } from './uuid'
import { duplicateListName } from './duplicateListName'

/**
 * Fields a duplicate deliberately does **not** inherit, and why.
 *
 * This is an omit-list on purpose, the same way `database.ts` builds its
 * documents with `toDocumentData(entity, [...])`. A list of fields to *keep*
 * silently drops every field added to `PackingList` later — that is exactly how
 * `nights`, `questionAnswers` and `selectedPeopleIds` went missing from a
 * duplicate (#325), with no type error and no failing test. Everything not
 * named here is carried over by default.
 */
export const duplicateDroppedFields = [
    // Belongs to the original's PouchDB document; a new list has no revision.
    '_rev',
    // Duplicate is offered on cached copies of other people's shared lists too.
    // Carrying these would make your own new list look like a cached copy of
    // somebody else's — among other things, deleting it would then skip the
    // tombstone that stops it coming back from the pod.
    'sharedFromPodUrl',
    'ownerWebId',
    // A repeat trip is the next one, not last year's. Keeping the dates would
    // stamp the copy with a trip that has already happened, and sort it in
    // among the past trips; the user sets the new dates when they know them.
    'startDate',
    'endDate',
] as const satisfies readonly (keyof PackingList)[]

/** Fields regenerated below rather than copied, so a duplicate is its own list. */
const regeneratedFields = ['id', 'name', 'createdAt', 'lastModified', 'items'] as const

type DroppedField = typeof duplicateDroppedFields[number]

/**
 * A fresh list repeating `list`: same trip, same generation inputs, nothing
 * packed yet.
 *
 * `existingNames` are the names already on the user's list page, so the default
 * name can count past a duplicate made earlier.
 */
export function duplicatePackingList(
    list: PackingList,
    existingNames: readonly string[]
): Omit<PackingList, DroppedField> {
    const skipped: readonly string[] = [...duplicateDroppedFields, ...regeneratedFields]

    const carried: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(list)) {
        if (skipped.includes(key)) continue
        if (value === undefined) continue
        carried[key] = value
    }

    const now = new Date().toISOString()
    return {
        ...(carried as Omit<PackingList, DroppedField | typeof regeneratedFields[number]>),
        id: generateUUID(),
        name: duplicateListName(list.name, existingNames),
        createdAt: now,
        lastModified: now,
        // Fresh ids so the two lists' items are independent, and nothing is
        // packed for a trip that hasn't been packed for yet.
        items: list.items.map(item => ({ ...item, id: generateUUID(), packed: false })),
    }
}
