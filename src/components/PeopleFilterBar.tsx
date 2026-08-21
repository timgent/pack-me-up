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
import { useEffect, useRef } from 'react'
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
    /** Names the region the strip filters, for assistive tech. */
    controlsId: string
}

export function PeopleFilterBar({
    columns,
    selected,
    totals,
    personColor,
    onToggle,
    controlsId,
}: PeopleFilterBarProps) {
    const scroller = useRef<HTMLDivElement>(null)

    // A chip pressed off screen leaves the list filtered by a control the user
    // can't see — which is what happens as soon as the group outgrows the strip.
    const lastSelected = [...selected].join('\u0000')
    useEffect(() => {
        const box = scroller.current
        if (!box) return
        const target = selected.size > 0
            ? box.querySelector<HTMLElement>('[aria-pressed="true"]')
            : box.firstElementChild as HTMLElement | null
        target?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
    }, [lastSelected, selected.size])

    // One person is not a choice, and neither is nobody.
    if (columns.length <= 1) return null

    return (
        <div className="mt-1.5 flex items-center gap-2 border-t border-gray-100 pt-1.5">
            {/* The words are worth 87px of a 390px screen, which is most of a
                chip — so the phone gets the funnel and the room instead. */}
            <span aria-hidden="true" className="shrink-0 text-gray-400 sm:hidden">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M2.6 4.2A1 1 0 0 1 3.5 3.6h13a1 1 0 0 1 .77 1.64l-4.77 5.6v4.2a1 1 0 0 1-.55.9l-2.4 1.2a1 1 0 0 1-1.45-.9v-5.4L2.33 5.24a1 1 0 0 1 .27-1.04Z" clipRule="evenodd" />
                </svg>
            </span>
            <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400 sm:inline">
                Packing for
            </span>
            {/* Faded at the trailing edge, so a group that runs off the end
                looks like it continues rather than like it stops there. */}
            <div className="relative min-w-0 flex-1">
            <div
                ref={scroller}
                role="group"
                aria-label="Filter by person"
                aria-controls={controlsId}
                className="flex items-center gap-1.5 overflow-x-auto scroll-pr-6 scroll-smooth pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {columns.map(column => {
                    const isSelected = selected.has(column.key)
                    // Somebody with nothing of their own still has a total, and
                    // it is worth saying: a bare chip where every other selected
                    // chip carries numbers reads as a chip that failed to load.
                    const stat = totals.get(column.key) ?? { packed: 0, total: 0 }
                    const done = stat.total > 0 && stat.packed === stat.total
                    const color = personColor({ id: column.personId, name: column.name })
                    return (
                        <button
                            key={column.key}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => onToggle(column.key)}
                            className={`flex min-h-[44px] shrink-0 snap-start items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-2.5 text-xs font-medium transition-colors ${
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
                            {isSelected && (
                                <span className="whitespace-nowrap tabular-nums opacity-90">
                                    {stat.packed}/{stat.total}
                                </span>
                            )}
                            {!isSelected && done && <span aria-hidden="true">✓</span>}
                        </button>
                    )
                })}
            </div>
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent"
            />
            </div>
        </div>
    )
}
