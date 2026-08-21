/**
 * Who the user is packing for — the strip above the cards.
 *
 * This used to be a key: coloured initials and their names, explaining the
 * chips on the cards below and doing nothing. Beside it sat a toggle between
 * two whole views of the list, one per person and one per category. The key
 * already names every person the grid can show, so pressing it is the same
 * question the toggle was asking, without a second layout to maintain — and
 * unlike the destructive thing a key could have done (pack somebody's whole
 * category on a stray tap), filtering undoes itself.
 *
 * One line, always, scrolled rather than wrapped. It is sticky, above a
 * progress line and a row of controls that already goes to two lines on a
 * phone; a wrapping strip of six tappable chips would take a third of the
 * screen in the one situation this is for — packing a bag in a hallway,
 * one-handed. Scrolling also keeps a chip where the user last saw it, which
 * wrapping does not: a chip that changes width on selection reflows the line.
 */
import { PersonAvatar } from './PersonAvatar'
import type { PersonColorLookup } from '../hooks/usePersonColors'
import type { GridColumn } from '../utils/categoryItemGrid'
import type { PeopleFilter, PersonStat } from '../utils/peopleFilter'

export interface PeopleFilterBarProps {
    columns: readonly GridColumn[]
    selected: PeopleFilter
    totals: Map<string, PersonStat>
    personColor: PersonColorLookup
    onToggle: (name: string) => void
    onClear: () => void
    /** Names the region the strip filters, for assistive tech. */
    controlsId: string
}

export function PeopleFilterBar({
    columns,
    selected,
    totals,
    personColor,
    onToggle,
    onClear,
    controlsId,
}: PeopleFilterBarProps) {
    // One person is not a choice, and neither is nobody.
    if (columns.length <= 1) return null

    return (
        <div className="mt-1.5 flex items-center gap-2 border-t border-gray-100 pt-1.5">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Packing for
            </span>
            <div
                role="group"
                aria-label="Filter by person"
                aria-controls={controlsId}
                className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {columns.map(column => {
                    const isSelected = selected.has(column.key)
                    const stat = totals.get(column.key)
                    const done = stat !== undefined && stat.total > 0 && stat.packed === stat.total
                    const color = personColor({ id: column.personId, name: column.name })
                    return (
                        <button
                            key={column.key}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => onToggle(column.key)}
                            className={`flex shrink-0 snap-start items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-2.5 text-xs font-medium transition-colors ${
                                isSelected
                                    ? 'border-blue-500 bg-blue-600 text-white'
                                    : done
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            {column.unassigned
                                ? <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">?</span>
                                : <PersonAvatar name={column.name} color={color} size="sm" initial={column.initial} />}
                            <span className="whitespace-nowrap">{column.name}</span>
                            {/* Only the selected chip carries its numbers. Every
                                chip carrying them makes the strip twice as long
                                for a figure nobody is reading, and a chip that
                                grows when pressed moves the one beside it out
                                from under the finger going there next. */}
                            {isSelected && stat !== undefined && (
                                <span className="whitespace-nowrap tabular-nums opacity-90">
                                    {stat.packed}/{stat.total}
                                </span>
                            )}
                            {!isSelected && done && <span aria-hidden="true">✓</span>}
                        </button>
                    )
                })}
            </div>
            {/* Held open whether or not it is showing, so the chips don't shift
                sideways the moment the first one is pressed. */}
            <div className="w-14 shrink-0 text-right">
                {selected.size > 0 && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="rounded-md px-1.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    )
}
