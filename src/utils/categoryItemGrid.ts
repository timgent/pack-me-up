/**
 * The shape of a category card in category view: one row per item, one column
 * per person, a checkbox where the two meet.
 *
 * Category view used to repeat an item's name once per person — "Toothbrush"
 * three times in Toiletries, under three folded headings — which made the one
 * question the view exists to answer ("who still needs a toothbrush?") a matter
 * of reading three lists and holding them in your head. Turning it on its side
 * gives the name once and the people across it: the same information in a
 * quarter of the height, and the gaps become the answer.
 *
 * Columns are the whole list's people rather than the people this category
 * happens to mention, so a person is in the same place on every card and an
 * empty column is a finding rather than a missing one — nobody has packed
 * anything for the baby in here.
 *
 * Kept apart from the page so the arrangement can be tested on its own: nearly
 * everything awkward here (duplicate names, shared items, quantities that
 * differ between people) is arithmetic, not rendering.
 */
import type { PackingListItem } from '../create-packing-list/types'

/** Column for items typed in without saying whose they are. */
export const UNASSIGNED_COLUMN_KEY = '__unassigned__'

/** What that column is called where it has to be read as a name. */
export const UNASSIGNED_COLUMN_LABEL = 'Unassigned'

/**
 * Distinguishes the shared row for "Tent" from the row for the tent Alice is
 * carrying herself. A person can't be in both, so the two are different items
 * that happen to share a name.
 */
export const SHARED_ROW_SUFFIX = '::__shared__'

export interface GridColumn {
    /** Identifies the column; a person's name, or the unassigned key. */
    key: string
    /** Shown in the header, and in every label naming the person. */
    name: string
    personId: string
    /** Nobody's in particular — items added without a person. */
    unassigned?: boolean
}

export interface GridRow {
    /** Stable across renders and unique even when two rows share a name. */
    key: string
    /** The first spelling of the name seen, since it is the same item either way. */
    label: string
    /** Every copy on this row, in column order. */
    items: PackingListItem[]
    /** One entry per column, in the same order; undefined where nobody needs it. */
    cells: (PackingListItem | undefined)[]
    /** A row for an item packed once for the whole group: no columns, one checkbox. */
    communal?: boolean
    /** The quantity every copy agrees on, when it is worth showing (> 1). */
    quantity?: number
    /** Copies disagree about how many, so each cell has to say its own. */
    mixedQuantities: boolean
}

export interface GridPerson {
    name: string
    id: string
}

/** Names that differ only in case or padding are the same item. */
function nameKey(itemText: string): string {
    return itemText.trim().toLowerCase()
}

function columnKeyFor(item: PackingListItem): string {
    return item.personName || UNASSIGNED_COLUMN_KEY
}

/**
 * The columns every category card in this list uses.
 *
 * `people` is the order the list puts its people in. Anyone the list doesn't
 * name — someone whose items came from a pod, a person since deleted from the
 * question set — still gets a column, after the known ones, because their items
 * have to be somewhere.
 */
export function buildGridColumns(
    people: readonly GridPerson[],
    items: readonly PackingListItem[],
): GridColumn[] {
    const personal = items.filter(item => !item.communal)
    const knownNames = new Set(people.map(person => person.name))

    const strangers = new Map<string, string>()
    let anyUnassigned = false
    for (const item of personal) {
        if (!item.personName) { anyUnassigned = true; continue }
        if (!knownNames.has(item.personName) && !strangers.has(item.personName)) {
            strangers.set(item.personName, item.personId)
        }
    }

    const columns: GridColumn[] = [
        ...people.map(person => ({ key: person.name, name: person.name, personId: person.id })),
        ...[...strangers.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, personId]) => ({ key: name, name, personId })),
    ]
    // Last, because it is where the eye should end up rather than start.
    if (anyUnassigned) {
        columns.push({ key: UNASSIGNED_COLUMN_KEY, name: UNASSIGNED_COLUMN_LABEL, personId: '', unassigned: true })
    }
    return columns
}

/**
 * One category's items, arranged against those columns.
 *
 * Takes every item in the category, packed ones included: which cells exist is
 * a fact about the list, not about what is on screen, and a cell that vanished
 * when it was ticked would be indistinguishable from a person who never needed
 * the item. Hiding packed things is a decision for the row, made where it is
 * rendered.
 */
export function buildCategoryRows(
    items: readonly PackingListItem[],
    columns: readonly GridColumn[],
): GridRow[] {
    const columnKeys = columns.map(column => column.key)

    // Every copy the same person has of one name gets its own row, so no item
    // ever has to share a checkbox with another: two pairs of socks are two
    // things to pack, and ticking one can't mean ticking both.
    interface RowDraft { label: string; order: number; byColumn: Map<string, PackingListItem> }
    const drafts = new Map<string, RowDraft[]>()

    for (const item of items) {
        if (item.communal) continue
        const key = nameKey(item.itemText)
        let rows = drafts.get(key)
        if (!rows) { rows = []; drafts.set(key, rows) }
        const column = columnKeyFor(item)
        let row = rows.find(candidate => !candidate.byColumn.has(column))
        if (!row) {
            row = { label: item.itemText.trim(), order: Infinity, byColumn: new Map() }
            rows.push(row)
        }
        row.byColumn.set(column, item)
        row.order = Math.min(row.order, item.order ?? Infinity)
    }

    const personalRows = [...drafts.entries()]
        .flatMap(([key, rows]) => rows.map((row, index) => {
            const cells = columnKeys.map(columnKey => row.byColumn.get(columnKey))
            const rowItems = cells.filter((item): item is PackingListItem => item !== undefined)
            return {
                key: index === 0 ? key : `${key}#${index}`,
                label: row.label,
                items: rowItems,
                cells,
                ...quantityOf(rowItems),
                sortOrder: row.order,
            }
        }))

    // Shared items sit among the rest rather than in a card of their own — a
    // tent belongs to Camping as much as anyone's sleeping bag does — but each
    // is one item, so it never shares a row with a person's copy of the name.
    // First, the way the shared card comes first in person view.
    const sharedRows = items
        .filter(item => item.communal)
        .map(item => ({
            key: `${nameKey(item.itemText)}${SHARED_ROW_SUFFIX}${item.id}`,
            label: item.itemText.trim(),
            items: [item],
            cells: [] as (PackingListItem | undefined)[],
            communal: true,
            ...quantityOf([item]),
            sortOrder: item.order ?? Infinity,
        }))

    return [...byOrderThenName(sharedRows), ...byOrderThenName(personalRows)]
}

/** Items carry the order they had in the question set; rows inherit it. */
function byOrderThenName<T extends GridRow & { sortOrder: number }>(rows: T[]): GridRow[] {
    return rows
        .sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label))
        .map(({ sortOrder: _sortOrder, ...row }) => row)
}

/** A quantity is only worth showing when it is more than the one it means by default. */
function quantityOf(items: PackingListItem[]): { quantity?: number; mixedQuantities: boolean } {
    const quantities = new Set(items.map(item => item.quantity ?? 1))
    if (quantities.size > 1) return { mixedQuantities: true }
    const [only] = [...quantities]
    return { mixedQuantities: false, ...(only !== undefined && only > 1 ? { quantity: only } : {}) }
}
