/**
 * Which of the list's people the user is packing for right now.
 *
 * The list view used to offer two whole views of the same data — one card per
 * person, or one card per category — and made you choose between them in a
 * toggle. The category grid already carries every person on every row, so the
 * question person view existed to answer ("what is left for Alice?") is a
 * matter of narrowing the grid rather than rebuilding it. This is that
 * narrowing.
 *
 * An empty selection means everyone, not nobody. That is the resting state, so
 * a list opens showing all of itself, and the way back to it is taking the last
 * person out of the selection.
 *
 * Kept out of the page, and out of `categoryItemGrid`, deliberately: the grid's
 * rows are a fact about the list rather than about what is on screen, so the
 * filter lives beside them rather than inside them.
 */
import type { PackingListItem } from '../create-packing-list/types'

/** Names of the selected people; empty means everyone. */
export type PeopleFilter = ReadonlySet<string>

export interface PersonStat { packed: number; total: number }

/**
 * The chip semantics: the first tap narrows to one person, later taps add and
 * remove, and taking the last one out puts the whole list back.
 *
 * The first-tap case is not a special rule — an empty selection has nothing to
 * remove — but it is the one that matters, because "I am packing Alice's bag
 * now" is what almost every use of this starts as.
 */
export function togglePerson(selected: PeopleFilter, name: string): Set<string> {
    const next = new Set(selected)
    if (!next.delete(name)) next.add(name)
    return next
}

export function isFiltered(selected: PeopleFilter): boolean {
    return selected.size > 0
}

/**
 * How much each person still has to pack, over the whole list rather than the
 * part of it on screen — the number lives on their chip, which is visible from
 * everywhere, so it has to mean the same thing from everywhere.
 *
 * Shared items are nobody's in particular and are counted nowhere here. Putting
 * the tent in Alice's total and Bob's total would have the list's parts add up
 * to more than the list.
 */
export function personTotals(
    items: readonly PackingListItem[],
    packedById: Record<string, boolean>,
): Map<string, PersonStat> {
    const totals = new Map<string, PersonStat>()
    for (const item of items) {
        if (item.communal || !item.personName) continue
        const stat = totals.get(item.personName) ?? { packed: 0, total: 0 }
        stat.total += 1
        if (packedById[item.id]) stat.packed += 1
        totals.set(item.personName, stat)
    }
    return totals
}

/**
 * What a screen reader is told when the filter changes.
 *
 * Names are joined rather than reduced to one, and no pronoun is inferred from
 * a name: "her items" is wrong for a Sam and wrong for every child called by a
 * nickname, and the possessive on the list of names says the same thing without
 * guessing.
 */
export function filterSummary(selected: PeopleFilter, shownCategories: number, totalCategories: number): string {
    if (!isFiltered(selected)) return ''
    const names = [...selected].sort((a, b) => a.localeCompare(b))
    const joined = names.length === 1
        ? names[0]!
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`
    return `Showing ${joined}'s items. ${shownCategories} of ${totalCategories} categories.`
}
