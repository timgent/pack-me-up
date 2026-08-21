/**
 * A category's items as a grid: the item down the side, the people across the
 * top, a checkbox where they meet.
 *
 * Category view used to give each person their own folded heading inside a
 * category, so one toothbrush was three rows in three places. The question the
 * view exists to answer — "who still needs one?" — was the one thing it made
 * hard. Here the name is written once and the people are read across it, and
 * the gaps in a column are as much of an answer as the ticks.
 *
 * Columns for as long as they fit. What gives on a narrow screen is first the
 * column *names* — the header keeps the coloured initial and the card carries a
 * legend — and then, once the people no longer fit beside a name worth reading,
 * the columns themselves: the item moves to a line of its own and the people
 * wrap underneath it as chips.
 *
 * Wrapping only works because a chip is a fixed size. Pills carrying names are
 * all different widths, so they put each person somewhere different on every
 * row and destroy the one reading the grid exists for; identical 36px discs
 * wrap into a grid that happens to have more than one line, and person five is
 * under person one on every single item.
 *
 * Three cell weights, because two of them would lie: a filled tick (packed),
 * an empty box (still to pack), and a flat dot (not for this person). With
 * packed items hidden a row leaves only when every cell on it is packed, so
 * "already done" is never dressed up as "never needed".
 */
import type { PackingListItem } from '../create-packing-list/types'
import type { GridColumn, GridRow } from '../utils/categoryItemGrid'
import type { PersonColorLookup } from '../hooks/usePersonColors'
import { PersonAvatar } from './PersonAvatar'
import { useMeasuredWidth } from '../hooks/useMeasuredWidth'

export interface CategoryItemGridProps {
    /** Names the table for screen readers, e.g. "Toiletries". */
    sectionTitle: string
    columns: readonly GridColumn[]
    rows: readonly GridRow[]
    personColor: PersonColorLookup
    packedById: Record<string, boolean>
    /** Whether a name is on screen beside each column's avatar. */
    showColumnNames: boolean
    /** The card's own background, which the frozen name column sits on. */
    surfaceClass: string
    /** Packed items are hidden, so a row with nothing left on it is on its way out. */
    hidePacked: boolean
    /** The item taking its bow; the nonce replays the tick when the same one is re-checked. */
    flourish: { itemId: string; nonce: number } | null
    /** Just added or just moved — worth pointing out for a moment. */
    highlightedItemId?: string
    onToggleItem: (item: PackingListItem, checked: boolean) => void
    /** Hands the page a handle on each cell, so an added item can be scrolled to. */
    registerCellRef: (itemId: string, element: HTMLElement | null) => void
    /** Opens the row's "who needs this?" panel — rename, quantities, who it is for. */
    onOpenRow: (row: GridRow) => void
    onCheckColumn: (column: GridColumn, columnIndex: number) => void
}

interface ColumnStat { packed: number; total: number }

/**
 * How much of a phone's width one person's column takes.
 *
 * A checkbox is 20px and wants a target around it; 40 is what leaves a name
 * column worth reading once four or five people are on the list. Below that the
 * grid stops being readable before it stops fitting — see the scroll fallback.
 */
const PHONE_COLUMN_WIDTH = 40

/**
 * How much room the names need before the columns stop paying for themselves.
 *
 * Not the least they can survive on — the least they are worth having. A
 * column layout earns its extra density by keeping each item to one line; once
 * the names are wrapping to three, the table is no shorter than chips under a
 * full-width name and it is harder to read. At 390px a card has ~348px, so
 * five people leave 148px of name and six leave 108px and start wrapping —
 * which is where the item moves to a line of its own and the people wrap
 * underneath it.
 */
const NAME_COMFORT = 132

/**
 * Whether the people still fit beside the names.
 *
 * `width` is 0 until the card has been measured (and wherever there is no
 * ResizeObserver, which includes the tests), so the count alone decides until
 * a real width arrives: five is what fits on the phone this was designed for.
 */
function columnsFit(peopleCount: number, width: number): boolean {
    if (width === 0) return peopleCount <= 5
    return NAME_COMFORT + peopleCount * PHONE_COLUMN_WIDTH <= width
}

/**
 * The name, split so that its last word and the chevron can be held together.
 *
 * A line can break in front of an inline-block whether or not there is a space
 * there, and neither `white-space: nowrap` on the button nor a non-breaking
 * space in front of the chevron stops it — so on a phone any name that fills
 * its line drops the chevron onto a line of its own, pointing at nothing. Only
 * putting the two inside one `whitespace-nowrap` box holds them together.
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
    sectionTitle,
    columns,
    rows,
    personColor,
    packedById,
    showColumnNames,
    surfaceClass,
    hidePacked,
    flourish,
    highlightedItemId,
    onToggleItem,
    registerCellRef,
    onOpenRow,
    onCheckColumn,
}: CategoryItemGridProps) {
    const { ref: containerRef, width } = useMeasuredWidth<HTMLDivElement>()
    // Columns while they fit; chips under the name once they don't. Desktop
    // always has the room, and its names in the header are worth keeping.
    const stacked = !showColumnNames && !columnsFit(columns.length, width)

    const rowComplete = (row: GridRow) =>
        row.items.length > 0 && row.items.every(item => packedById[item.id])

    // A finished row leaves when packed items are hidden — but not in the same
    // frame as the tick that finished it: it stays for the flourish, wearing the
    // leaving animation, and goes when the flourish ends.
    const visibleRows = rows.filter(row =>
        !hidePacked || !rowComplete(row) || row.items.some(item => item.id === flourish?.itemId)
    )

    if (visibleRows.length === 0) {
        return <p className="text-sm font-medium text-emerald-700">Nothing left to pack 🎒</p>
    }

    // Counted over every item in the category rather than the visible rows: with
    // packed items hidden, "1" under a person two thirds done reads as a person
    // who has barely started.
    const columnStats: ColumnStat[] = columns.map((_column, index) => {
        let packed = 0
        let total = 0
        for (const row of rows) {
            const item = row.cells[index]
            if (!item) continue
            total++
            if (packedById[item.id]) packed++
        }
        return { packed, total }
    })

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
     * last word wherever the name wraps instead of floating at the edge of the
     * column between two lines, belonging to neither. The padding is what makes
     * a one-line row a 44px target.
     */
    const renderName = (row: GridRow, complete: boolean, padding = 'py-2.5') => {
        const { head, lastWord } = splitLastWord(row.label)
        return (
            <button
                type="button"
                onClick={() => onOpenRow(row)}
                aria-label={`Edit ${row.label}`}
                title="Rename, quantities, and who needs it"
                className={`group block w-full cursor-pointer rounded-md px-1 text-left transition-colors active:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${padding}`}
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
                            to go from here. Grey enough to stay behind the
                            checkboxes, dark enough to be seen without hovering —
                            which is all a phone ever gets. */}
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

    const renderCell = (row: GridRow, column: GridColumn, item: PackingListItem | undefined) => {
        if (!item) {
            // Flat, and it creates nothing when pressed — an "add one for them"
            // button in every empty cell would ring each checkbox with taps that
            // write data instead of ticking something off. But "Cara needs one
            // too" is exactly the thought this cell provokes, and a dot that
            // swallows the tap is worse than one that opens the panel where that
            // can be said. Pointer only: the row's name button is the same door,
            // and it is the one in the tab order.
            return (
                <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={() => onOpenRow(row)}
                    title={`${column.name} doesn't need this — open to change`}
                    className="mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-blue-50 sm:h-10 sm:w-10"
                >
                    <span className="block h-1 w-1 rounded-full bg-gray-200" />
                </button>
            )
        }
        const packed = !!packedById[item.id]
        const quantity = item.quantity !== undefined && item.quantity > 1 ? item.quantity : undefined
        return (
            <label
                data-testid={`grid-cell-${item.id}`}
                ref={(element) => registerCellRef(item.id, element)}
                className={`relative mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors sm:h-10 sm:w-10 ${packed ? 'bg-emerald-100' : 'hover:bg-blue-50'} ${item.id === highlightedItemId ? 'ring-2 ring-green-400' : ''} ${item.id === flourish?.itemId ? 'grid-cell-packed' : ''}`}
            >
                <input
                    type="checkbox"
                    checked={packed}
                    onChange={(e) => onToggleItem(item, e.target.checked)}
                    aria-label={`${row.label} for ${column.name}`}
                    className={`h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${packed ? 'accent-emerald-600' : ''}`}
                />
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
     * One person's cell, wrapped: their own coloured disc, which is also the
     * checkbox. Filled with a tick once it is packed, outlined and carrying
     * their initial until then — so the colour says whose it is in both states,
     * which is what makes a wrapped grid readable at a glance.
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
                className={`relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-1 ${
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
                    {packed ? '✓' : (column.unassigned ? '?' : column.name.charAt(0).toUpperCase())}
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
     * The same 36px of space, held empty. The chips only line up between one
     * item and the next because nobody's place is ever skipped.
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

    const renderSharedChip = (row: GridRow) => {
        const item = row.items[0]
        const packed = !!packedById[item.id]
        return (
            <label
                data-testid={`grid-cell-${item.id}`}
                ref={(element) => registerCellRef(item.id, element)}
                className={`relative flex h-8 cursor-pointer items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${packed ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-50 text-blue-800 hover:bg-blue-100'} ${item.id === highlightedItemId ? 'ring-2 ring-green-400' : ''} ${item.id === flourish?.itemId ? 'grid-cell-packed' : ''}`}
            >
                <input
                    type="checkbox"
                    checked={packed}
                    onChange={(e) => onToggleItem(item, e.target.checked)}
                    aria-label={`${row.label} for the whole group`}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="whitespace-nowrap">👥 Everyone</span>
                {renderFlourish(item)}
            </label>
        )
    }

    /**
     * Who is on the list, how far each of them has got, and a way to finish one
     * of them off here. In the table this lives in the column headers; with the
     * columns gone it is the only place the initials get decoded.
     */
    const renderPeopleStrip = () => (
        <div className="mb-2 flex flex-wrap items-center gap-1 border-b border-gray-100 pb-2">
            {columns.map((column, index) => {
                const { packed, total } = columnStats[index]
                const done = total > 0 && packed === total
                return (
                    <button
                        key={column.key}
                        type="button"
                        onClick={() => onCheckColumn(column, index)}
                        disabled={done || total === 0}
                        aria-label={`Check off everything left for ${column.name} in ${sectionTitle}`}
                        title={done ? `${column.name} is done here` : `Check off everything ${column.name} still has in ${sectionTitle}`}
                        className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:bg-blue-50'}`}
                    >
                        {!column.unassigned && (
                            <PersonAvatar
                                name={column.name}
                                color={personColor({ id: column.personId, name: column.name })}
                                size="sm"
                            />
                        )}
                        <span>{column.name}</span>
                        <span className="tabular-nums text-gray-400">{packed}/{total}</span>
                    </button>
                )
            })}
        </div>
    )

    const renderSharedCell = (row: GridRow) => {
        const item = row.items[0]
        const packed = !!packedById[item.id]
        return (
            <label
                data-testid={`grid-cell-${item.id}`}
                ref={(element) => registerCellRef(item.id, element)}
                className={`relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-md px-3 transition-colors ${packed ? 'bg-emerald-100' : 'bg-blue-50 hover:bg-blue-100'} ${item.id === highlightedItemId ? 'ring-2 ring-green-400' : ''} ${item.id === flourish?.itemId ? 'grid-cell-packed' : ''}`}
            >
                <input
                    type="checkbox"
                    checked={packed}
                    onChange={(e) => onToggleItem(item, e.target.checked)}
                    aria-label={`${row.label} for the whole group`}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="whitespace-nowrap text-xs font-medium text-blue-800">
                    👥{showColumnNames && ' For everyone'}
                </span>
                {renderFlourish(item)}
            </label>
        )
    }

    if (stacked) {
        return (
            <div ref={containerRef}>
                {renderPeopleStrip()}
                <ul className="divide-y divide-gray-100">
                    {visibleRows.map(row => {
                        const complete = rowComplete(row)
                        return (
                            <li
                                key={row.key}
                                data-testid="grid-row"
                                className={`-mx-1 rounded-md px-1 py-1 transition-colors ${complete ? 'bg-emerald-50' : ''} ${hidePacked && complete ? 'grid-row-leaving' : ''}`}
                            >
                                {renderName(row, complete, 'py-1.5')}
                                {/* Fixed-size chips in a fixed order, so person
                                    five sits under person one on every item and
                                    the wrap is still a grid to read down. */}
                                <div role="group" aria-label={row.label} className="flex flex-wrap gap-1 pb-1 pl-1">
                                    {row.communal
                                        ? renderSharedChip(row)
                                        : columns.map((column, index) => {
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
            </div>
        )
    }

    return (
        <div ref={containerRef} className="-mx-2 overflow-x-auto sm:-mx-1">
            <table
                className={`w-full border-collapse text-sm ${showColumnNames ? '' : 'table-fixed'}`}
                style={showColumnNames
                    ? undefined
                    : { minWidth: `${NAME_COMFORT + columns.length * PHONE_COLUMN_WIDTH}px` }}
            >
                <caption className="sr-only">{sectionTitle}: what to pack, by person</caption>
                {/* On a phone the people are told how much room they get and the
                    name takes what is left, so a fifth person makes the names
                    narrower instead of pushing the grid off the side of the
                    screen. On a desktop there is room to let the names ask. */}
                {!showColumnNames && (
                    <colgroup>
                        <col />
                        {columns.map(column => (
                            <col key={column.key} style={{ width: `${PHONE_COLUMN_WIDTH}px` }} />
                        ))}
                    </colgroup>
                )}
                <thead>
                    <tr className={surfaceClass}>
                        {/* Takes the slack, so the person columns stay as narrow
                            as they need to be — which is what lets four of them
                            fit beside an item name on a phone. */}
                        <th scope="col" className="sticky left-0 z-20 w-full bg-inherit px-1 pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            Item
                        </th>
                        {columns.map((column, index) => {
                            const { packed, total } = columnStats[index]
                            const done = total > 0 && packed === total
                            return (
                                <th key={column.key} scope="col" className="px-0 pb-2 align-bottom sm:px-2">
                                    <span className="flex flex-col items-center gap-0.5">
                                        <span className="flex items-center gap-1.5">
                                            {!column.unassigned && (
                                                <PersonAvatar
                                                    name={column.name}
                                                    color={personColor({ id: column.personId, name: column.name })}
                                                    size="sm"
                                                />
                                            )}
                                            {showColumnNames && (
                                                <span className={`text-sm font-semibold ${done ? 'text-emerald-700' : 'text-gray-700'}`}>
                                                    {column.name}
                                                </span>
                                            )}
                                        </span>
                                        {/* Persistent rather than revealed on hover:
                                            "I've just done all of Cara's toiletries"
                                            is how people pack, and a phone has no
                                            hover to reveal it with. */}
                                        <button
                                            type="button"
                                            onClick={() => onCheckColumn(column, index)}
                                            disabled={done}
                                            aria-label={`Check off everything left for ${column.name} in ${sectionTitle}`}
                                            title={done ? `${column.name} is done here` : `Check off everything ${column.name} still has in ${sectionTitle}`}
                                            className={`rounded-full px-1.5 text-[11px] font-medium tabular-nums transition-colors ${done ? 'text-emerald-600' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-700'}`}
                                        >
                                            {packed}/{total}
                                        </button>
                                    </span>
                                </th>
                            )
                        })}
                    </tr>
                </thead>
                <tbody>
                    {visibleRows.map(row => {
                        const complete = rowComplete(row)
                        return (
                            <tr
                                key={row.key}
                                data-testid="grid-row"
                                // An opaque background of its own, because the
                                // name cell inherits it to sit over the columns
                                // sliding underneath when the grid is wider than
                                // the screen.
                                className={`border-t border-gray-100 transition-colors ${complete ? 'bg-emerald-50' : `${surfaceClass} hover:bg-gray-50`} ${hidePacked && complete ? 'grid-row-leaving' : ''}`}
                            >
                                <th scope="row" className="sticky left-0 z-10 bg-inherit px-1 py-1 text-left align-middle font-medium shadow-[2px_0_3px_-1px_rgba(15,23,42,0.08)] sm:shadow-none">
                                    {renderName(row, complete)}
                                </th>
                                {row.communal ? (
                                    <td colSpan={Math.max(columns.length, 1)} className="px-1 py-1 text-center align-middle sm:px-2">
                                        {renderSharedCell(row)}
                                    </td>
                                ) : (
                                    columns.map((column, index) => (
                                        <td key={column.key} className="px-0 py-1 text-center align-middle sm:px-2">
                                            {renderCell(row, column, row.cells[index])}
                                        </td>
                                    ))
                                )}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
