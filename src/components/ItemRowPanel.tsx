/**
 * "Who needs this?" — everything about one row of the category grid that isn't
 * ticking a box.
 *
 * The grid answers a question by being read; this is where it gets *changed*.
 * Adding an item for someone, taking it off their list, giving one person three
 * of them and another one, marking somebody's charger as a last-minute job:
 * each of those is per-person, and none of them belongs in a cell the user is
 * aiming a thumb at to tick something off. Putting them together behind the
 * item's name means one affordance instead of a hover control the phone can't
 * reach and a mode the desktop has to be taught.
 *
 * Checking a person on and off is the same gesture in both directions: on adds
 * them a copy, off takes theirs away. The name, alone among these, belongs to
 * every copy at once — the same item spelled two ways is a bug, not a feature —
 * so renaming says so and applies to the row.
 */
import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { PersonAvatar } from './PersonAvatar'
import type { PackingListItem } from '../create-packing-list/types'
import type { GridColumn, GridRow } from '../utils/categoryItemGrid'
import type { PersonColorLookup } from '../hooks/usePersonColors'

export interface ItemRowPanelProps {
    isOpen: boolean
    onClose: () => void
    /** The row being looked at; null between openings. */
    row: GridRow | null
    /** Everyone on the list, so somebody with nothing here can still be given one. */
    columns: readonly GridColumn[]
    /** Where the item lives, shown under its name. */
    sectionTitle: string
    personColor: PersonColorLookup
    packedById: Record<string, boolean>
    /** Applies to every copy on the row. */
    onRename: (row: GridRow, text: string) => void
    onSetQuantity: (item: PackingListItem, quantity: number | undefined) => void
    onToggleLastMinute: (item: PackingListItem) => void
    onAddFor: (row: GridRow, column: GridColumn) => void
    onRemove: (item: PackingListItem) => void
    onDeleteRow: (row: GridRow) => void
}

export function ItemRowPanel({
    isOpen,
    onClose,
    row,
    columns,
    sectionTitle,
    personColor,
    packedById,
    onRename,
    onSetQuantity,
    onToggleLastMinute,
    onAddFor,
    onRemove,
    onDeleteRow,
}: ItemRowPanelProps) {
    const [draftName, setDraftName] = useState('')

    // The row object is rebuilt on every save — a new quantity, a person added —
    // so the draft follows the row's identity rather than the row itself, or
    // typing a name would be undone by the first change made underneath it.
    useEffect(() => {
        if (row) setDraftName(row.label)
    }, [row?.key, isOpen]) // eslint-disable-line react-hooks/exhaustive-deps -- the label is a starting value, not a binding

    if (!isOpen || !row) return null

    const commitName = () => {
        const trimmed = draftName.trim()
        if (!trimmed || trimmed === row.label) {
            setDraftName(row.label)
            return
        }
        onRename(row, trimmed)
    }

    const renderItemControls = (item: PackingListItem, who: string) => (
        <>
            <QuantityField
                key={`${item.id}-${item.quantity ?? ''}`}
                item={item}
                label={`Quantity for ${who}`}
                onCommit={(quantity) => onSetQuantity(item, quantity)}
            />
            <button
                type="button"
                onClick={() => onToggleLastMinute(item)}
                aria-pressed={item.lastMinute === true}
                aria-label={item.lastMinute
                    ? `Pack ${who}'s ${row.label} with everything else`
                    : `Mark ${who}'s ${row.label} as a last minute item`}
                title={item.lastMinute
                    ? 'Packed with everything else after all'
                    : "Can't be packed until just before you go"}
                className={`rounded-md p-1.5 transition-colors hover:bg-amber-50 hover:text-amber-600 ${item.lastMinute ? 'text-amber-600' : 'text-gray-400'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.5 2.5a1 1 0 101.414-1.414L11 9.586V6z" clipRule="evenodd" />
                </svg>
            </button>
        </>
    )

    return (
        // Titled by the item, and told plainly what is in here. Someone who
        // opens this once by accident should come away knowing where renaming,
        // quantities and deleting live — that one accident is the cheapest
        // lesson the grid will ever get to teach.
        <Modal isOpen={isOpen} onClose={onClose} title={row.label}>
            {/* The modal centres its content on a phone, which is right for a
                message and wrong for a form. */}
            <div className="space-y-4 text-left">
                <p className="-mt-2 text-sm text-gray-500">
                    In {sectionTitle} · rename it, choose who needs one and how many, or remove it.
                </p>
                <div>
                    <label htmlFor="item-row-name" className="block text-sm font-medium text-gray-700">
                        Name
                    </label>
                    <input
                        id="item-row-name"
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitName() }
                            if (e.key === 'Escape') { e.preventDefault(); setDraftName(row.label) }
                        }}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {row.items.length > 1 && (
                        <p className="mt-1 text-xs text-gray-500">
                            Renaming changes it for everyone below
                        </p>
                    )}
                </div>

                {row.communal ? (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                        <span aria-hidden="true">👥</span>
                        <span className="flex-1 text-sm font-medium text-blue-900">
                            Everyone — packed once for the whole group
                        </span>
                        {renderItemControls(row.items[0], 'the group')}
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                        {columns.map((column, index) => {
                            const item = row.cells[index]
                            const packed = item !== undefined && packedById[item.id]
                            return (
                                <li key={column.key} className="flex items-center gap-2 px-3 py-2">
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={item !== undefined}
                                            onChange={(e) => {
                                                if (e.target.checked) onAddFor(row, column)
                                                else if (item) onRemove(item)
                                            }}
                                            // Not "Toothbrush for Alice" — that
                                            // is the grid cell, which packs it.
                                            // This one decides whether she has
                                            // one at all.
                                            aria-label={`${column.name} needs ${row.label}`}
                                            className="h-5 w-5 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        {!column.unassigned && (
                                            <PersonAvatar
                                                name={column.name}
                                                initial={column.initial}
                                                color={personColor({ id: column.personId, name: column.name })}
                                                size="sm"
                                            />
                                        )}
                                        <span className={`truncate text-sm font-medium ${item ? 'text-gray-800' : 'text-gray-400'}`}>
                                            {column.name}
                                        </span>
                                        {packed && (
                                            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                                                packed
                                            </span>
                                        )}
                                    </label>
                                    {item && renderItemControls(item, column.name)}
                                </li>
                            )
                        })}
                    </ul>
                )}

                <div className="flex justify-between gap-2 pt-1">
                    <button
                        type="button"
                        onClick={() => onDeleteRow(row)}
                        className="rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                        {row.items.length > 1 ? `Remove for all ${row.items.length}` : 'Remove item'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                        Done
                    </button>
                </div>
            </div>
        </Modal>
    )
}

/**
 * How many of a thing one person is packing. Committed on blur or Enter rather
 * than on every keystroke: each save is a write to the pod, and "12" typed a
 * digit at a time would be two of them.
 */
function QuantityField({ item, label, onCommit }: {
    item: PackingListItem
    label: string
    onCommit: (quantity: number | undefined) => void
}) {
    const [draft, setDraft] = useState(item.quantity !== undefined ? String(item.quantity) : '')

    const commit = () => {
        const parsed = parseInt(draft, 10)
        const quantity = Number.isFinite(parsed) && parsed > 1 ? parsed : undefined
        // A quantity of one is what no quantity already means, so both settle
        // the field back to empty rather than leaving a "1" that means nothing.
        setDraft(quantity !== undefined ? String(quantity) : '')
        if (quantity !== item.quantity) onCommit(quantity)
    }

    return (
        <input
            type="number"
            min={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
            }}
            placeholder="Qty"
            aria-label={label}
            title="How many to pack (leave blank for one)"
            className="w-14 shrink-0 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
    )
}
