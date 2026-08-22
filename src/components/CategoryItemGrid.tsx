/**
 * A category's items as a grid: the item down the side, the people across it,
 * a checkbox where they meet.
 *
 * Category view used to give each person their own folded heading inside a
 * category, so one toothbrush was three rows in three places. The question the
 * view exists to answer — "who still needs one?" — was the one thing it made
 * hard. Here the name is written once and the people are read across it, and
 * the gaps are as much of an answer as the ticks.
 *
 * The people are chips rather than columns under a header, and there is no
 * header row at all: each chip carries its own colour and initial, so it says
 * whose it is from wherever it has ended up on the screen. That is what lets
 * the grid work at any width. A header naming the columns has to be *visible*
 * to be any use, and the moment you scroll into a long category it isn't —
 * whereas identity that travels with the control can't scroll away from it.
 *
 * Which initial is whose is written once, in the page's sticky strip, where it
 * stays in view for every card. It is a key and nothing else: nothing in it can
 * be pressed, because the only thing a key could plausibly *do* — pack
 * everything of one person's — is nine items changed by one stray tap, with no
 * undo. That job has a home in person view, on a button that says so.
 *
 * Wrapping only works because a chip is a fixed size. Pills carrying names are
 * all different widths, so they put each person somewhere different on every
 * row and destroy the one reading the grid exists for; identical 32px discs sit
 * in a block of fixed width, so person five is under person one on every item,
 * whether the block takes one line or three. The block hands back whatever it
 * doesn't need to the name, which is why three people still read as a tidy
 * two-column table and twelve still fit on a phone.
 *
 * Three weights, because two of them would lie: a filled disc (packed), an
 * outlined one (still to pack), and a flat dot (not for this person). With
 * packed items hidden a row leaves only when every chip on it is packed, so
 * "already done" is never dressed up as "never needed".
 *
 * That last part describes the card with everyone on it. Filtered to some of
 * the list's people (`visibleColumnKeys`), a row is finished when every chip
 * still on screen is packed — the question being asked is what Alice has left,
 * and what Bob still owes is not part of the answer.
 */
import { useState } from 'react'
import { SHARED_FILTER_KEY } from '../utils/peopleFilter'
import type { PackingListItem } from '../create-packing-list/types'
import type { GridColumn, GridRow } from '../utils/categoryItemGrid'
import type { PersonColorLookup } from '../hooks/usePersonColors'
import { useMeasuredWidth } from '../hooks/useMeasuredWidth'

export interface CategoryItemGridProps {
    columns: readonly GridColumn[]
    /**
     * Whose chips to draw, when the user is packing for some of the list rather
     * than all of it. Undefined means everyone.
     *
     * Narrowing happens here rather than in `columns`, and never in
     * `buildCategoryRows`: a row's cells line up with the full column set, and
     * the row panel — the only way to say "Bob needs one too" — walks the same
     * set. Filter the columns upstream and that door opens onto one person.
     * This is the layer `hidePacked` already works at, for the same reason.
     */
    visibleColumnKeys?: ReadonlySet<string>
    rows: readonly GridRow[]
    personColor: PersonColorLookup
    packedById: Record<string, boolean>
    /** Packed items are hidden, so a row with nothing left on it is on its way out. */
    hidePacked: boolean
    /** The item taking its bow; the nonce replays the tick when the same one is re-checked. */
    flourish: { itemId: string; nonce: number } | null
    /** Just added or just moved — worth pointing out for a moment. */
    highlightedItemId?: string
    onToggleItem: (item: PackingListItem, checked: boolean) => void
    /** Hands the page a handle on each chip, so an added item can be scrolled to. */
    registerCellRef: (itemId: string, element: HTMLElement | null) => void
    /** Opens the row's "who needs this?" panel — rename, quantities, who it is for. */
    onOpenRow: (row: GridRow) => void
}

/**
 * A 32px disc and the 12px after it.
 *
 * The gap is what the disc's tap target grows into. At 4px a 44px target
 * overlapped its neighbour's *visible* edge, so the right rim of one person's
 * circle packed the next person's item; 12px is the room the target needs to
 * reach 44px and stop there.
 */
const CHIP_PITCH = 44

/**
 * The most room a name is given on a wide card.
 *
 * Past this the chips would be so far from the name that reading across the
 * row becomes a job of its own; the leftover is left empty instead, and the two
 * halves of a row stay next to each other.
 */
const NAME_MAX_WIDTH = 420

/**
 * The least room the names are left with, whatever the headcount.
 *
 * The chips take what they need up to this line and no further; past it they
 * wrap onto a second line rather than squeezing the names away. A name is the
 * only thing on the row that can't be recovered from context.
 */
const NAME_MIN_WIDTH = 128

/**
 * How many people fit on one line of chips.
 *
 * `width` is 0 until the card has been measured (and wherever there is no
 * ResizeObserver, which includes the tests), where everyone is assumed to fit —
 * one line is what the layout looks like at rest.
 */
function chipsPerLine(peopleCount: number, width: number): number {
    if (width === 0) return peopleCount
    const room = Math.floor((width - NAME_MIN_WIDTH) / CHIP_PITCH)
    return Math.max(1, Math.min(peopleCount, room))
}

/**
 * The name, split so that its last word and the chevron can be held together.
 *
 * A line can break in front of an inline-block whether or not there is a space
 * there, and neither `white-space: nowrap` on the button nor a non-breaking
 * space in front of the chevron stops it — so any name that fills its line
 * drops the chevron onto a line of its own, pointing at nothing. Only putting
 * the two inside one `whitespace-nowrap` box holds them together.
 *
 * The cost is that the name is two text nodes, so `getByText('Water bottle')`
 * will not find it — query the row by its button instead (`Edit Water bottle`).
 */
function splitLastWord(label: string): { head: string; lastWord: string } {
    const parts = label.trim().split(/\s+/)
    const lastWord = parts.pop() ?? ''
    return { head: parts.join(' '), lastWord }
}

export function CategoryItemGrid({
    columns,
    visibleColumnKeys,
    rows,
    personColor,
    packedById,
    hidePacked,
    flourish,
    highlightedItemId,
    onToggleItem,
    registerCellRef,
    onOpenRow,
}: CategoryItemGridProps) {
    const { ref: containerRef, width } = useMeasuredWidth<HTMLDivElement>()
    const [sharedOpen, setSharedOpen] = useState(false)

    // Positions in the full column set, so `row.cells[index]` still lines up
    // after some of the people have been filtered out.
    const filtering = visibleColumnKeys !== undefined
    // With only the Shared chip pressed there are no people left to show, and
    // the card is the group's items alone.
    const anyPersonSelected = !filtering || [...visibleColumnKeys].some(key => key !== SHARED_FILTER_KEY)

    const shownIndices = columns
        .map((_column, index) => index)
        .filter(index => visibleColumnKeys === undefined || visibleColumnKeys.has(columns[index]!.key))

    /**
     * The copies of this item that the filter is actually showing.
     *
     * A row leaving once every *visible* chip is packed is a change of meaning
     * under a filter, and the right one: packing for Alice, a row she has
     * finished is done, whatever Bob still owes. Unfiltered this is every copy,
     * which is what the note at the top of this file describes.
     */
    const visibleItemsOf = (row: GridRow) => (
        row.communal
            ? row.items
            : shownIndices.map(index => row.cells[index]).filter((item): item is PackingListItem => item !== undefined)
    )

    const rowComplete = (row: GridRow) => {
        const items = visibleItemsOf(row)
        return items.length > 0 && items.every(item => packedById[item.id])
    }

    // A row nobody in the filter needs isn't hidden, it's absent: the question
    // being asked is what Alice has left, and an item that was never hers is no
    // part of the answer.
    // A row nobody in the filter needs is absent rather than hidden — and with
    // the Shared chip alone, the people's rows are what nobody asked for.
    const rowsForFilter = rows.filter(row => (
        row.communal ? true : anyPersonSelected && visibleItemsOf(row).length > 0
    ))

    // A finished row leaves when packed items are hidden — but not in the same
    // frame as the tick that finished it: it stays for the flourish, wearing the
    // leaving animation, and goes when the flourish ends.
    const visible = rowsForFilter.filter(row =>
        !hidePacked || !rowComplete(row) || row.items.some(item => item.id === flourish?.itemId)
    )

    // Shared items belong to this category as much as anyone's do, so unfiltered
    // they sit among the rest. Filtered to people they would answer a question
    // that wasn't asked — "what is left for the baby?" is not a request for the
    // group's tent — so they fold into one line that can be opened. Asked for by
    // name, on the Shared chip, they come back out among the rest.
    const foldShared = filtering && !visibleColumnKeys.has(SHARED_FILTER_KEY)
    const sharedRows = foldShared ? visible.filter(row => row.communal) : []
    const visibleRows = foldShared ? visible.filter(row => !row.communal) : visible

    if (visibleRows.length === 0 && sharedRows.length === 0) {
        return <p className="text-sm font-medium text-emerald-700">Nothing left to pack 🎒</p>
    }

    // One width for every row in the card, so the chips land in the same places
    // on all of them — which is the whole of what makes this a grid.
    const chipBlockWidth = chipsPerLine(shownIndices.length, width) * CHIP_PITCH

    const renderFlourish = (item: PackingListItem) => (
        item.id === flourish?.itemId
            ? (
                <span
                    key={flourish.nonce}
                    data-testid={`item-tick-${item.id}`}
                    aria-hidden="true"
                    className="item-packed-tick pointer-events-none absolute left-1/2 top-1/2 z-10 text-xl font-bold text-success-600"
                >
                    ✓
                </span>
            )
            : null
    )

    /**
     * The item's name, and the way in to everything about the row that isn't
     * ticking a box: renaming, quantities, and who it is for.
     *
     * Laid out as text rather than as a row of boxes, so the chevron follows the
     * last word wherever the name wraps instead of floating out at the edge,
     * between two lines, belonging to neither.
     */
    const renderName = (row: GridRow, complete: boolean) => {
        const { head, lastWord } = splitLastWord(row.label)
        return (
            <button
                type="button"
                onClick={() => onOpenRow(row)}
                aria-label={`Edit ${row.label}`}
                title="Rename, quantities, and who needs it"
                className="group block w-full cursor-pointer rounded-md px-1 py-2 text-left transition-colors active:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
                <span className={`break-words ${complete ? 'text-gray-400 line-through' : 'text-gray-800 group-hover:text-blue-800'}`}>
                    {head && `${head} `}
                    {/* The last word, the quantity and the chevron travel
                        together, so the chevron is never left pointing at
                        nothing from a line of its own. */}
                    <span className="whitespace-nowrap">
                        {lastWord}
                        {row.quantity !== undefined && (
                            <span className="ml-1.5 inline-block rounded-full bg-blue-100 px-1.5 py-0.5 align-middle text-xs font-semibold text-blue-700">
                                ×{row.quantity}
                            </span>
                        )}
                        {/* Points, which is the whole message: there is somewhere
                            to go from here. Grey enough to stay behind the chips,
                            dark enough to be seen without hovering — which is all
                            a phone ever gets. */}
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="ml-1.5 inline-block h-3.5 w-3.5 align-[-0.15em] text-gray-500 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600"
                        >
                            <path d="M7.5 4.5 13 10l-5.5 5.5" />
                        </svg>
                    </span>
                </span>
            </button>
        )
    }

    /**
     * One person's cell: their own coloured disc, which is also the checkbox.
     * Filled with a tick once it is packed, outlined and carrying their initial
     * until then — so the colour says whose it is in both states, which is what
     * lets the grid do without a header.
     *
     * The initial comes from the column rather than from the first letter of
     * the name: Alice and Amy are both "A", and with person view gone there is
     * no other place in the app where their chips are told apart by anything
     * but colour. `buildGridColumns` grows the label until it separates them.
     */
    const renderChip = (row: GridRow, column: GridColumn, item: PackingListItem) => {
        const packed = !!packedById[item.id]
        const color = personColor({ id: column.personId, name: column.name })
        const quantity = item.quantity !== undefined && item.quantity > 1 ? item.quantity : undefined
        return (
            <label
                key={column.key}
                data-testid={`grid-cell-${item.id}`}
                ref={(element) => registerCellRef(item.id, element)}
                title={`${row.label} for ${column.name}`}
                className={`relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold transition-colors before:absolute before:-inset-1.5 before:content-[''] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-1 ${
                    packed ? color.avatar : `border-2 bg-white ${color.border} ${color.text}`
                } ${item.id === highlightedItemId ? 'ring-2 ring-green-400' : ''} ${item.id === flourish?.itemId ? 'grid-cell-packed' : ''}`}
            >
                <input
                    type="checkbox"
                    checked={packed}
                    onChange={(e) => onToggleItem(item, e.target.checked)}
                    aria-label={`${row.label} for ${column.name}`}
                    className="sr-only"
                />
                <span aria-hidden="true">
                    {packed ? '✓' : column.initial}
                </span>
                {row.mixedQuantities && quantity && (
                    <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-full bg-blue-100 px-1 text-[10px] font-semibold text-blue-700">
                        ×{quantity}
                    </span>
                )}
                {renderFlourish(item)}
            </label>
        )
    }

    /**
     * The same 32px of space, held empty.
     *
     * The chips only line up between one item and the next because nobody's
     * place is ever skipped. It creates nothing when pressed — an "add one for
     * them" button in every gap would ring each chip with taps that write data
     * instead of ticking something off — but "Cara needs one too" is exactly the
     * thought a gap provokes, so it opens the panel where that can be said.
     * Pointer only: the row's name button is the same door, and it is the one in
     * the tab order.
     */
    const renderChipGap = (row: GridRow, column: GridColumn) => (
        <button
            key={column.key}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => onOpenRow(row)}
            title={`${column.name} doesn't need this — open to change`}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-blue-50"
        >
            <span className="block h-1 w-1 rounded-full bg-gray-200" />
        </button>
    )

    /** An item nobody owns: one checkbox for the whole group, not one each. */
    const renderSharedChip = (row: GridRow) => {
        const item = row.items[0]
        const packed = !!packedById[item.id]
        return (
            <label
                data-testid={`grid-cell-${item.id}`}
                ref={(element) => registerCellRef(item.id, element)}
                className={`relative flex h-8 cursor-pointer items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${packed ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-50 text-blue-800 hover:bg-blue-100'} ${item.id === highlightedItemId ? 'ring-2 ring-green-400' : ''} ${item.id === flourish?.itemId ? 'grid-cell-packed' : ''}`}
            >
                <input
                    type="checkbox"
                    checked={packed}
                    onChange={(e) => onToggleItem(item, e.target.checked)}
                    aria-label={`${row.label} for the whole group`}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="whitespace-nowrap">👥 Shared</span>
                {renderFlourish(item)}
            </label>
        )
    }

    return (
        <div ref={containerRef}>
            <ul className="divide-y divide-gray-100">
                {visibleRows.map(row => {
                    const complete = rowComplete(row)
                    return (
                        <li
                            key={row.key}
                            data-testid="grid-row"
                            className={`flex items-start gap-1 rounded-md transition-colors ${complete ? 'bg-emerald-50' : 'hover:bg-gray-50'} ${hidePacked && complete ? 'grid-row-leaving' : ''}`}
                        >
                            {/* Capped, so a wide card doesn't strand the chips
                                an inch and a half from the name they belong to. */}
                            <span className="min-w-0 flex-1" style={{ maxWidth: `${NAME_MAX_WIDTH}px` }}>
                                {renderName(row, complete)}
                            </span>
                            {/* A block of the same width on every row, so a
                                person keeps their place down the whole card
                                however many lines the chips take — and the same
                                side of the name on every row of every card,
                                filtered or not. */}
                            <div
                                role="group"
                                aria-label={row.label}
                                className="flex shrink-0 flex-wrap gap-3 py-2"
                                style={{ width: `${chipBlockWidth}px` }}
                            >
                                {row.communal
                                    ? renderSharedChip(row)
                                    : shownIndices.map(index => {
                                        const column = columns[index]!
                                        const item = row.cells[index]
                                        return item
                                            ? renderChip(row, column, item)
                                            : renderChipGap(row, column)
                                    })}
                            </div>
                        </li>
                    )
                })}
            </ul>
            {/* Not hidden, just not in the way: the group's tent is still this
                category's business, and a line saying how many there are is
                enough to remember that while packing one person's bag. */}
            {sharedRows.length > 0 && (
                <div className="mt-1 border-t border-gray-100 pt-1">
                    <button
                        type="button"
                        aria-expanded={sharedOpen}
                        onClick={() => setSharedOpen(open => !open)}
                        className="flex w-full items-center gap-1.5 rounded-md px-1 py-2 text-left text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-50"
                    >
                        <span aria-hidden="true" className="text-gray-400">{sharedOpen ? '▼' : '▶'}</span>
                        <span aria-hidden="true">👥</span>
                        Shared ({sharedRows.length})
                    </button>
                    {sharedOpen && (
                        <ul className="divide-y divide-gray-100">
                            {sharedRows.map(row => (
                                <li
                                    key={row.key}
                                    data-testid="grid-row"
                                    className="flex items-start gap-1 rounded-md transition-colors hover:bg-gray-50"
                                >
                                    <span className="min-w-0 flex-1" style={{ maxWidth: `${NAME_MAX_WIDTH}px` }}>
                                        {renderName(row, rowComplete(row))}
                                    </span>
                                    <div role="group" aria-label={row.label} className="flex shrink-0 flex-wrap gap-3 py-2">
                                        {renderSharedChip(row)}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}
