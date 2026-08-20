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
 * One table on every screen rather than a table and a phone-shaped
 * substitute: wrapping the people into chips would put each person somewhere
 * different on every row, which is precisely the reading the grid exists to
 * make possible. What gives on a narrow screen is the *names* — the header
 * keeps the coloured initial and the card carries a legend — not the columns.
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

export interface CategoryItemGridProps {
    /** Names the table for screen readers, e.g. "Toiletries". */
    sectionTitle: string
    columns: readonly GridColumn[]
    rows: readonly GridRow[]
    personColor: PersonColorLookup
    packedById: Record<string, boolean>
    /** Whether a name is on screen beside each column's avatar. */
    showColumnNames: boolean
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

export function CategoryItemGrid({
    sectionTitle,
    columns,
    rows,
    personColor,
    packedById,
    showColumnNames,
    hidePacked,
    flourish,
    highlightedItemId,
    onToggleItem,
    registerCellRef,
    onOpenRow,
    onCheckColumn,
}: CategoryItemGridProps) {
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

    const renderCell = (row: GridRow, column: GridColumn, item: PackingListItem | undefined) => {
        if (!item) {
            // Flat and untouchable. An empty cell is the most common thing on
            // the grid and the least worth pressing — putting an "add this for
            // them" button in every one of them would surround each checkbox
            // with taps that create data instead of ticking it off. Filling a
            // gap in is a job for the row's panel, where it can be undone.
            return (
                <span aria-hidden="true" className="mx-auto block h-1 w-1 rounded-full bg-gray-200" />
            )
        }
        const packed = !!packedById[item.id]
        const quantity = item.quantity !== undefined && item.quantity > 1 ? item.quantity : undefined
        return (
            <label
                data-testid={`grid-cell-${item.id}`}
                ref={(element) => registerCellRef(item.id, element)}
                className={`relative mx-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-md transition-colors ${packed ? 'bg-emerald-100' : 'hover:bg-blue-50'} ${item.id === highlightedItemId ? 'ring-2 ring-green-400' : ''} ${item.id === flourish?.itemId ? 'grid-cell-packed' : ''}`}
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

    return (
        <div className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{sectionTitle}: what to pack, by person</caption>
                <thead>
                    <tr>
                        {/* Takes the slack, so the person columns stay as narrow
                            as they need to be — which is what lets four of them
                            fit beside an item name on a phone. */}
                        <th scope="col" className="w-full px-1 pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            Item
                        </th>
                        {columns.map((column, index) => {
                            const { packed, total } = columnStats[index]
                            const done = total > 0 && packed === total
                            return (
                                <th key={column.key} scope="col" className="px-1 pb-2 align-bottom sm:px-2">
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
                                className={`border-t border-gray-100 transition-colors ${complete ? 'bg-emerald-50' : 'hover:bg-gray-50'} ${hidePacked && complete ? 'grid-row-leaving' : ''}`}
                            >
                                <th scope="row" className="px-1 py-1 text-left align-middle font-medium">
                                    {/* The name is the biggest target on the row,
                                        so it is the way in to everything that
                                        isn't ticking a box: renaming, quantities,
                                        and who the item is for. */}
                                    <button
                                        type="button"
                                        onClick={() => onOpenRow(row)}
                                        aria-label={`${row.label} — who needs this?`}
                                        title="Who needs this?"
                                        className="group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left transition-colors hover:bg-blue-50"
                                    >
                                        <span className={complete ? 'text-gray-400 line-through' : 'text-gray-800'}>
                                            {row.label}
                                        </span>
                                        {row.quantity !== undefined && (
                                            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                                                ×{row.quantity}
                                            </span>
                                        )}
                                        {/* Sits with the name rather than out at
                                            the far edge of the column, where it
                                            would read as another cell. */}
                                        <span
                                            aria-hidden="true"
                                            className="shrink-0 text-xs text-gray-300 transition-colors group-hover:text-blue-500"
                                        >
                                            ⋯
                                        </span>
                                    </button>
                                </th>
                                {row.communal ? (
                                    <td colSpan={Math.max(columns.length, 1)} className="px-1 py-1 text-center align-middle sm:px-2">
                                        {renderSharedCell(row)}
                                    </td>
                                ) : (
                                    columns.map((column, index) => (
                                        <td key={column.key} className="px-1 py-1 text-center align-middle sm:px-2">
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
