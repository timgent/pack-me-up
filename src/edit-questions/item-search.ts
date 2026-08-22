/**
 * Finding one item in a whole question set.
 *
 * The questions page is a page of folded lists: an item lives inside a section,
 * inside an answer, inside a question, and the only way to find "sun cream" was
 * to remember which question you filed it under and unfold your way down to it.
 * That is fine with six questions and hopeless with thirty — and it is the same
 * problem behind the two things people actually do here: *is this already in the
 * set somewhere?* and *where does this end up on my list?*
 *
 * So a match is never returned on its own. It comes with the trail that leads to
 * it — question, answer, section — because the trail is what answers both
 * questions, and matches are gathered under that trail so a run of hits in one
 * answer reads as one place rather than six unrelated rows.
 *
 * Deliberately a pure function over the stored set: the page's own item handlers
 * address a list by index, so a result carries the index its list's handlers
 * take, and editing from the results is then the same write as editing in place.
 */
import { ALWAYS_NEEDED_CATEGORY, defaultCategoryFor } from './item-sections'
import type { Item, PackingListQuestionSet } from './types'

/** What the always-needed list is called where a question would be named. */
export const ALWAYS_LIST_LABEL = 'Always Needed Items'

/**
 * Below this a search says more about the size of the set than about what was
 * typed — one letter matches most of it — so the page keeps showing the set.
 */
export const MIN_QUERY_LENGTH = 2

/** Whether what has been typed is enough to search on. */
export function isSearchQuery(query: string): boolean {
    return query.trim().length >= MIN_QUERY_LENGTH
}

/**
 * How many matches are worth drawing. A cap rather than a scroll of everything:
 * past this the answer is "narrow it down", and the page says so with the total.
 */
export const DEFAULT_SEARCH_LIMIT = 50

/** The list an item lives in, in the terms the page's save handlers take. */
export type ItemLocation =
    | { kind: 'always' }
    | { kind: 'option'; questionId: string; optionId: string }

export interface ItemSearchMatch {
    item: Item
    /**
     * Where the item sits in the list its handlers address: the whole stored
     * array for an option, the undeleted ones for the always-needed list, which
     * is what the page renders and indexes there.
     */
    index: number
    /** Where the query starts in `item.text`; -1 for a pinned item that no longer matches. */
    matchStart: number
}

/** The matches within one section of a list. */
export interface ItemSearchSection {
    label: string
    /** Whether it is the list's own default rather than a section someone named. */
    isDefault: boolean
    matches: ItemSearchMatch[]
}

/**
 * Every match in one item list, under the trail that leads to it.
 *
 * The trail stops at the answer, and the sections sit inside it, because a set
 * asked about "sun" answers with six rows spread over three sections of the same
 * two questions: repeating "What weather do you expect? › Hot" above each of
 * them says the same long thing three times and pushes the section — the part
 * that differs — off the right-hand edge of a phone.
 */
export interface ItemSearchGroup {
    /** Stable identity for the group — one item list. */
    key: string
    location: ItemLocation
    /** The trail to this list, outermost first: question, then answer. */
    crumbs: string[]
    /** What this list calls items carrying no section of their own. */
    defaultLabel: string
    sections: ItemSearchSection[]
    /** How many matches the group holds, across its sections. */
    count: number
}

export interface ItemSearchResults {
    groups: ItemSearchGroup[]
    /** How many matches are in `groups`. */
    shown: number
    /** How many there are in the set — larger than `shown` once the cap bites. */
    total: number
}

export interface ItemSearchOptions {
    limit?: number
    /**
     * An item to include whatever it says now. The editor opened from a result
     * writes straight through, so renaming an item out of its own search would
     * otherwise pull the row out from under the panel you are typing in.
     */
    pinnedItemId?: string
}

/** One match before grouping, keeping the order the page lists items in. */
interface Candidate {
    seq: number
    match: ItemSearchMatch
    /** The list it lives in, and the section of that list. */
    group: Omit<ItemSearchGroup, 'sections' | 'count'>
    sectionLabel: string
    isDefaultSection: boolean
}

const EMPTY: ItemSearchResults = { groups: [], shown: 0, total: 0 }

/**
 * Whether a section's name says anything the trail hasn't already. An
 * uncategorised item's section *is* its question's or answer's own text, so
 * naming it under "Beach holiday? › Yes" would repeat the crumb above it.
 */
export function sectionNamesItsList(group: ItemSearchGroup, section: ItemSearchSection): boolean {
    return !section.label.trim() || group.crumbs.includes(section.label)
}

export function searchQuestionSetItems(
    qs: PackingListQuestionSet,
    query: string,
    { limit = DEFAULT_SEARCH_LIMIT, pinnedItemId }: ItemSearchOptions = {},
): ItemSearchResults {
    const needle = query.trim().toLowerCase()
    if (needle.length < MIN_QUERY_LENGTH) return EMPTY

    const candidates: Candidate[] = []
    let seq = 0
    let total = 0

    const collect = (
        item: Item,
        index: number,
        listCrumbs: string[],
        defaultLabel: string,
        location: ItemLocation,
    ) => {
        const matchStart = item.text.toLowerCase().indexOf(needle)
        const pinned = pinnedItemId !== undefined && item.id === pinnedItemId
        if (matchStart < 0 && !pinned) return
        if (matchStart >= 0) total++
        candidates.push({
            seq: seq++,
            match: { item, index, matchStart },
            group: {
                key: location.kind === 'always' ? 'always' : location.questionId + ':' + location.optionId,
                location,
                crumbs: listCrumbs,
                defaultLabel,
            },
            sectionLabel: item.category ?? defaultLabel,
            isDefaultSection: item.category === undefined,
        })
    }

    // The always-needed list first, exactly as the page stacks it, and indexed
    // the way the page indexes it: tombstones are neither shown nor counted.
    const always = (qs.alwaysNeededItems ?? []).filter(i => !i.deletedAt)
    always.forEach((item, index) =>
        collect(item, index, [ALWAYS_LIST_LABEL], ALWAYS_NEEDED_CATEGORY, { kind: 'always' }))

    for (const question of qs.questions ?? []) {
        if (question.deletedAt) continue
        const questionText = question.text.trim() || 'Untitled question'
        for (const option of question.options) {
            const optionText = option.text.trim() || 'Untitled option'
            const defaultLabel = defaultCategoryFor(question, option)
            // Indexed against the stored array, tombstones included, because
            // that is the array an option's handlers edit.
            option.items.forEach((item, index) => {
                if (item.deletedAt) return
                collect(item, index, [questionText, optionText], defaultLabel,
                    { kind: 'option', questionId: question.id, optionId: option.id })
            })
        }
    }

    // The cap counts matches, not the pinned straggler: an editor left open on
    // an item that no longer matches must survive to be closed.
    const pinnedCandidate = candidates.find(c => c.match.matchStart < 0)
    const kept = candidates.filter(c => c.match.matchStart >= 0).slice(0, limit)
    if (pinnedCandidate && !kept.includes(pinnedCandidate)) kept.push(pinnedCandidate)
    kept.sort((a, b) => a.seq - b.seq)

    // Two levels, both in the order the page lists things: the list a match
    // lives in, then the section within it.
    const groups: ItemSearchGroup[] = []
    const byKey = new Map<string, ItemSearchGroup>()
    for (const candidate of kept) {
        let group = byKey.get(candidate.group.key)
        if (!group) {
            group = { ...candidate.group, sections: [], count: 0 }
            byKey.set(group.key, group)
            groups.push(group)
        }
        let section = group.sections.find(s => s.label === candidate.sectionLabel)
        if (!section) {
            section = { label: candidate.sectionLabel, isDefault: candidate.isDefaultSection, matches: [] }
            group.sections.push(section)
        }
        section.matches.push(candidate.match)
        group.count++
    }

    return { groups, shown: kept.length, total }
}
