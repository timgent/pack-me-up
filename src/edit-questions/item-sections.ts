/**
 * Sections within a single item list (the always-needed list, or one option's
 * items). A section is just a `category` stamped on each of its items — see the
 * note on `ItemSchema.category`. There is no section entity and no boundary
 * marker, which is what keeps the feature safe across per-item LWW merges and
 * old clients.
 *
 * Items with no category of their own belong to the list's default section,
 * named by `defaultCategoryFor` / `ALWAYS_NEEDED_CATEGORY` — the same values
 * `generatePackingListItems` falls back to, so the editor shows exactly the
 * grouping the generated packing list will have.
 */
import { groupItemsByCategory, type CategoryAccessors, type CategoryGroup } from '../utils/groupByCategory'
import type { Item, Option, PackingListQuestionSet, Question } from './types'

/** Default section name for items in the always-needed list. */
export const ALWAYS_NEEDED_CATEGORY = 'Essentials'

/**
 * The sections the built-in template sorts its items into. Mostly functional:
 * a functional name is stable across every trip type, derivable from the item
 * alone, and maps onto a place in the house — so the family walks from bathroom
 * to bedroom to kitchen once. By-person is already the list's other axis.
 *
 * `dayBag` is the one deliberate exception, and it earns it. Packing is really
 * the job of filling two things: the case, which can be anything, and the bag
 * that stays with you, which cannot — a phone charger in the hold is a phone
 * charger you don't have. Spreading those items over Tech, Toiletries, Food and
 * Toys meant assembling the day bag by reading the whole list and remembering
 * which rows counted. One card for it is the single biggest practical win here,
 * and unlike "hand luggage" or "boot of the car" the name holds whether you're
 * flying, driving or walking to the station.
 *
 * It also absorbed two whole sections. Tech & Chargers was phone, charger,
 * power bank, headphones, tablet, adapter — day bag, all of it. Toys & Games
 * was colouring books and travel card games, which are there for the journey;
 * the bedtime teddy was always filed under Sleep & Comfort anyway. Neither
 * section had a life of its own once its day-bag half left.
 *
 * These are plain labels, not an enum: a user can rename or delete any of them,
 * and items they add carry no category at all. Nothing here is load-bearing for
 * correctness — it only decides headings and their order.
 */
export const CATEGORIES = {
    dayBag: 'Day Bag',
    documents: 'Documents & Money',
    medical: 'Medicines & First Aid',
    toiletries: 'Toiletries',
    clothes: 'Clothes',
    sleep: 'Sleep & Comfort',
    nappies: 'Nappies & Changing',
    food: 'Food & Kitchen',
    kit: 'Kit & Gear',
    pet: 'Pet Care',
} as const

/**
 * Display order for the sections above: irreplaceability descending, bulk
 * ascending. A forgotten passport ends the trip and there are only a handful of
 * them, so documents lead and the tent is loaded last.
 *
 * The day bag goes ahead of even the documents. Everything else on the list can
 * be packed the night before and checked at leisure; the day bag is the one you
 * are still filling as you leave, so it wants to be the first thing on screen —
 * and it is short enough to read in the doorway.
 *
 * Without this, a section's position came from the lowest `order` among its
 * items (see `groupItemsByCategory`), which was coherent while a section *was*
 * a question — one question, one contiguous block. Now that a section spans
 * several questions, that would make its position arbitrary, and reordering a
 * single item in the editor could reshuffle whole cards on the packing list.
 *
 * `ALWAYS_NEEDED_CATEGORY` leads because sets written before the template
 * carried categories put every always-needed item there, and those lists should
 * keep opening with it. Labels absent from this list — question and option text
 * for uncategorised items, plus anything the user named — sort after these, by
 * item order, exactly as before.
 */
export const CATEGORY_ORDER: readonly string[] = [
    ALWAYS_NEEDED_CATEGORY,
    CATEGORIES.dayBag,
    CATEGORIES.documents,
    CATEGORIES.medical,
    CATEGORIES.toiletries,
    CATEGORIES.clothes,
    CATEGORIES.sleep,
    CATEGORIES.nappies,
    CATEGORIES.food,
    CATEGORIES.kit,
    CATEGORIES.pet,
]

/**
 * The section an item falls into when it carries no category of its own:
 * the option text for multiple-choice questions (each option is already its
 * own group), the question text otherwise.
 */
export function defaultCategoryFor(question: Question, option: Option): string {
    return question.questionType === 'multiple-choice' ? option.text : question.text
}

const ITEM_ACCESSORS: CategoryAccessors<Item> = {
    category: item => item.category,
    order: item => item.order,
    text: item => item.text,
}

/**
 * Group an item list into its sections, ordered by each section's earliest
 * item. Grouping is by label rather than by walking positions, so a section
 * stays contiguous — and appears exactly once — even if a merge leaves an
 * item's order and category disagreeing.
 */
export function groupItemsIntoSections(items: Item[], defaultLabel: string): CategoryGroup<Item>[] {
    return groupItemsByCategory(items, ITEM_ACCESSORS, { uncategorisedLabel: defaultLabel })
}

/**
 * A section list flattened for display: a header before each section, then its
 * items. This is the only place position carries meaning — it's what the editor
 * drags against, and `applySectionLayout` turns it straight back into stamped
 * categories. Nothing positional is ever stored.
 */
export type SectionSequenceEntry =
    | { kind: 'header'; label: string }
    | { kind: 'item'; item: Item }

/**
 * Build the display sequence for the editor. `draftSections` are sections the
 * user has created but not yet dragged anything into; they exist only in editor
 * state, since a section with no items has nothing to stamp and so cannot be
 * stored.
 *
 * Unlike `groupItemsIntoSections` — which the packing list uses, and which sorts
 * by the stamped `order` — this groups by *array position*. Inside the editor
 * the array is the source of truth: `order` is deliberately left stale until
 * `renumberItemOrder` runs at save, because that staleness is exactly how a
 * reorder earns its `lastModified` bump. Both paths share the same bucketing by
 * label, so the sections themselves can't drift; only the basis for ordering
 * within them differs, and saving makes the two agree.
 */
export function buildSectionSequence(
    items: Item[],
    defaultLabel: string,
    draftSections: string[],
): SectionSequenceEntry[] {
    const buckets = new Map<string, Item[]>()
    // The default section always leads, so the "main pile" stays the top of the
    // list even if a categorised item happens to sit first in the array.
    buckets.set(defaultLabel, [])
    for (const item of items) {
        const label = item.category ?? defaultLabel
        if (!buckets.has(label)) buckets.set(label, [])
        buckets.get(label)!.push(item)
    }
    for (const draft of draftSections) {
        if (!buckets.has(draft)) buckets.set(draft, [])
    }
    return [...buckets.entries()]
        // An empty default section has no header to show; drafts do, since their
        // header is the drop target that brings them into existence.
        .filter(([label, bucket]) => bucket.length > 0 || label !== defaultLabel)
        .flatMap(([label, bucket]) => [
            { kind: 'header' as const, label },
            ...bucket.map(item => ({ kind: 'item' as const, item })),
        ])
}

/** An item together with its position in the flat list every edit addresses. */
export interface PositionedItem {
    item: Item
    index: number
}

/** One section and its items, in display order. */
export interface SectionGroup {
    label: string
    entries: PositionedItem[]
}

/**
 * The display sequence gathered back up into sections, for views that draw a
 * section as a container rather than as a heading followed by loose rows.
 *
 * Each item keeps its index in `items`, because sections group by category
 * while every per-item handler addresses the flat array — the two orders differ,
 * so the index has to be carried rather than recomputed from the position on
 * screen. Drafts aren't accepted: an empty section only exists inside the
 * reorder view, which works against the sequence directly.
 */
export function buildSectionGroups(
    items: Item[],
    defaultLabel: string,
    emptySections: string[] = [],
): SectionGroup[] {
    const indexOf = new Map(items.map((item, i) => [item, i]))
    const groups: SectionGroup[] = []
    for (const entry of buildSectionSequence(items, defaultLabel, emptySections)) {
        if (entry.kind === 'header') groups.push({ label: entry.label, entries: [] })
        // The sequence always opens with a header, so there is a group to put
        // this in — but a stray item is dropped rather than crashing a page.
        else groups[groups.length - 1]?.entries.push({ item: entry.item, index: indexOf.get(entry.item)! })
    }
    return groups
}

/**
 * Turn a dragged sequence back into a flat item list, stamping each item with
 * the nearest header above it. Items under the default header (or above the
 * first header) carry no category at all, so "back to the main pile" stores
 * nothing rather than storing the default name.
 *
 * Only items whose section actually changed get a fresh `lastModified` —
 * position changes are stamped separately by `renumberItemOrder` at save.
 */
export function applySectionLayout(
    sequence: SectionSequenceEntry[],
    defaultLabel: string,
    now: string,
): Item[] {
    let current: string | undefined
    const result: Item[] = []
    for (const entry of sequence) {
        if (entry.kind === 'header') {
            current = entry.label === defaultLabel ? undefined : entry.label
            continue
        }
        const item = entry.item
        if (item.category === current) {
            result.push(item)
            continue
        }
        const { category: _dropped, ...rest } = item
        result.push({ ...rest, ...(current !== undefined ? { category: current } : {}), lastModified: now })
    }
    return result
}

/**
 * The section an entry belongs to: the nearest header above it, or the default
 * section for entries sitting above the first header (which is how
 * `applySectionLayout` reads them).
 */
export function sectionLabelAt(
    sequence: SectionSequenceEntry[],
    index: number,
    defaultLabel: string,
): string {
    for (let i = index; i >= 0; i--) {
        const entry = sequence[i]
        if (entry.kind === 'header') return entry.label
    }
    return defaultLabel
}

/**
 * Every section the sequence can move an item into, in display order. The
 * default section is always offered even when it currently has no header:
 * emptying it must not strand items in the sections they were put in.
 */
export function sectionLabelsIn(sequence: SectionSequenceEntry[], defaultLabel: string): string[] {
    const labels = sequence.flatMap(e => e.kind === 'header' ? [e.label] : [])
    return labels.includes(defaultLabel) ? labels : [defaultLabel, ...labels]
}

/** Where the section containing `index` starts and ends (both inclusive, items only). */
function sectionBounds(sequence: SectionSequenceEntry[], index: number): { first: number; last: number } {
    let first = 0
    for (let i = index; i >= 0; i--) {
        if (sequence[i].kind === 'header') { first = i + 1; break }
    }
    let last = sequence.length - 1
    for (let i = index + 1; i < sequence.length; i++) {
        if (sequence[i].kind === 'header') { last = i - 1; break }
    }
    return { first, last }
}

/** Whether the item at `index` already sits at the top or bottom of its section. */
export function isAtSectionEdge(
    sequence: SectionSequenceEntry[],
    index: number,
    position: 'top' | 'bottom',
): boolean {
    const { first, last } = sectionBounds(sequence, index)
    return index === (position === 'top' ? first : last)
}

/**
 * Move an item to the top or bottom of the section it is already in, leaving
 * every other section untouched.
 */
export function moveItemWithinSection(
    sequence: SectionSequenceEntry[],
    index: number,
    position: 'top' | 'bottom',
): SectionSequenceEntry[] {
    if (isAtSectionEdge(sequence, index, position)) return sequence
    const { first, last } = sectionBounds(sequence, index)
    const next = [...sequence]
    const [moved] = next.splice(index, 1)
    // Removing the item shifts everything below it up one, so the bottom slot
    // is `last` rather than `last + 1`.
    next.splice(position === 'top' ? first : last, 0, moved)
    return next
}

/**
 * Move an item to the bottom of another section — the keyboard equivalent of
 * dragging it under that section's heading. Moving into the default section
 * when that section has no header puts the item above the first header, which
 * `applySectionLayout` reads as "no category".
 */
export function moveItemToSection(
    sequence: SectionSequenceEntry[],
    index: number,
    targetLabel: string,
    defaultLabel: string,
): SectionSequenceEntry[] {
    const next = [...sequence]
    const [moved] = next.splice(index, 1)
    const header = next.findIndex(e => e.kind === 'header' && e.label === targetLabel)
    if (header === -1) {
        if (targetLabel !== defaultLabel) return sequence
        next.unshift(moved)
        return next
    }
    let insertAt = next.length
    for (let i = header + 1; i < next.length; i++) {
        if (next[i].kind === 'header') { insertAt = i; break }
    }
    next.splice(insertAt, 0, moved)
    return next
}

/** Every distinct section name in use, for offering existing names as suggestions. */
export function sectionNamesIn(qs: PackingListQuestionSet): string[] {
    const names = new Set<string>()
    for (const item of qs.alwaysNeededItems ?? []) {
        if (item.category) names.add(item.category)
    }
    for (const name of qs.alwaysNeededEmptySections ?? []) names.add(name)
    for (const question of qs.questions ?? []) {
        for (const option of question.options) {
            for (const item of option.items) {
                if (item.category) names.add(item.category)
            }
            for (const name of option.emptySections ?? []) names.add(name)
        }
    }
    return [...names]
}

/** The sections an item list describes through its own items. */
function filledSectionsOf(items: Item[]): Set<string> {
    const filled = new Set<string>()
    for (const item of items) {
        // A soft-deleted item doesn't hold a section open — the section is back
        // to being empty, and has to stay recorded to survive the next reload.
        if (item.category && !item.deletedAt) filled.add(item.category)
    }
    return filled
}

/**
 * Drop the sections that no longer need recording, because their items now
 * describe them. Run this on every write to an item list: it is what keeps
 * `emptySections` meaning exactly what it says, so nothing has to remember to
 * clean up after a drag or an add.
 *
 * Returns `undefined` rather than `[]` when nothing is left, so the field
 * disappears from the document instead of lingering as an empty array.
 */
export function pruneFilledSections(
    emptySections: string[] | undefined,
    items: Item[],
): string[] | undefined {
    if (!emptySections?.length) return undefined
    const filled = filledSectionsOf(items)
    const remaining = emptySections.filter(label => !filled.has(label))
    return remaining.length > 0 ? remaining : undefined
}

/**
 * Bring the recorded empty sections up to date after an item list changed.
 *
 * Two things happen here, and the second is why this exists rather than
 * `pruneFilledSections` alone: a section whose last item just left stays, now
 * recorded as empty. Deleting an item — or dragging it elsewhere — is not a
 * request to delete the section it was in, and letting the section evaporate
 * underneath the change is exactly the disappearing-section behaviour the
 * stored names were added to stop.
 *
 * Removing a section is a separate, deliberate action, so that path drops the
 * name itself rather than going through here.
 */
export function reconcileEmptySections(
    previous: Item[],
    next: Item[],
    emptySections: string[] | undefined,
): string[] | undefined {
    const before = filledSectionsOf(previous)
    const after = filledSectionsOf(next)
    const emptied = [...before].filter(label => !after.has(label))
    const combined = [...(emptySections ?? [])]
    for (const label of emptied) {
        if (!combined.includes(label)) combined.push(label)
    }
    return pruneFilledSections(combined, next)
}

/**
 * Record a new, empty section — the "+ Add section" action.
 *
 * A name that already exists is not an error and not a second section: it is
 * simply already there, so the list comes back unchanged. The default section
 * is likewise refused, since every list has one whether or not anything is in it.
 */
export function addEmptySection(
    emptySections: string[] | undefined,
    items: Item[],
    label: string,
    defaultLabel: string,
): string[] | undefined {
    const trimmed = label.trim()
    if (!trimmed || trimmed === defaultLabel) return emptySections?.length ? emptySections : undefined
    if (emptySections?.includes(trimmed)) return emptySections
    if (filledSectionsOf(items).has(trimmed)) return emptySections?.length ? emptySections : undefined
    return [...(emptySections ?? []), trimmed]
}

/**
 * Stop recording a section that has just been removed.
 *
 * The mirror of `addEmptySection`, and deliberately not `reconcileEmptySections`:
 * that one *keeps* a section whose items merely left, which is right for a
 * delete or a drag and exactly wrong for "remove this section".
 */
export function forgetEmptySection(
    emptySections: string[] | undefined,
    label: string,
): string[] | undefined {
    const remaining = emptySections?.filter(name => name !== label)
    return remaining?.length ? remaining : undefined
}

/**
 * Move items into a section (or back to the default section with `undefined`).
 * Only items whose category actually changes get a fresh `lastModified`, so a
 * no-op drag doesn't churn sync or win unrelated merges.
 */
export function assignItemsToSection(
    items: Item[],
    itemIds: string[],
    category: string | undefined,
    now: string,
): Item[] {
    const ids = new Set(itemIds)
    return items.map(item => {
        if (!item.id || !ids.has(item.id) || item.category === category) return item
        const { category: _dropped, ...rest } = item
        return { ...rest, ...(category !== undefined ? { category } : {}), lastModified: now }
    })
}

/**
 * Rename a section by restamping every item in it. Soft-deleted items are
 * renamed too, so an item restored later rejoins the renamed section instead of
 * reappearing under a name that no longer exists.
 */
export function renameSection(items: Item[], from: string, to: string, now: string): Item[] {
    if (from === to) return items
    return items.map(item =>
        item.category === from ? { ...item, category: to, lastModified: now } : item
    )
}

/**
 * Remove a section, keeping its items — they fall back to the list's default
 * section. Removing a grouping should never destroy what was grouped.
 */
export function removeSection(items: Item[], label: string, now: string): Item[] {
    return items.map(item => {
        if (item.category !== label) return item
        const { category: _dropped, ...rest } = item
        return { ...rest, lastModified: now }
    })
}
