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
 * On a phone the chips are faces and nothing else. Four names and "Shared"
 * come to about 370px of chips in about 340px of room, so carrying the names
 * meant the strip could not hold a family of four. The names are worth roughly
 * a third of that width, and they are the part the grid below already says
 * twice over in colour and initial. Who is selected is written out in the bar
 * underneath instead, where there is a whole line for it.
 *
 * The strip wraps rather than scrolls. It used to scroll, on the argument that
 * a wrapping row of tappable chips would take a third of a phone screen and
 * that a chip changing width on selection would reflow the line — both true of
 * chips carrying names and counts, and neither true of these. A fixed 44px
 * circle never changes width, and six fit a line, so a family of four wraps to
 * nothing at all and only a party of seven costs a second row. What scrolling
 * costs is worse and certain: a chip past the edge is a person the strip does
 * not appear to have.
 *
 * The names come back on demand: a pointer hovers, a finger holds. Whichever
 * way, the chip says who it is without the strip having to carry it.
 *
 * A filled chip means one thing and one thing only: pressed. Somebody who has
 * finished packing used to get a chip filled green, which read as selected
 * beside the white ones that read as not — two states competing for the same
 * signal. Finished is a tick on the face instead, which says it without
 * borrowing the fill.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { PersonAvatar } from './PersonAvatar'
import type { PersonColorLookup } from '../hooks/usePersonColors'
import type { GridColumn } from '../utils/categoryItemGrid'
import { SHARED_FILTER_KEY, type PeopleFilter, type PersonStat } from '../utils/peopleFilter'

export interface PeopleFilterBarProps {
    columns: readonly GridColumn[]
    selected: PeopleFilter
    totals: Map<string, PersonStat>
    personColor: PersonColorLookup
    onToggle: (name: string) => void
    /** The group's own items, when the list has any. Omitted when it has none. */
    sharedStat?: PersonStat
    /** Names the region the strip filters, for assistive tech. */
    controlsId: string
}

/** Finished packing — said on the face, so the chip's fill can stay the answer
 *  to one question only: is this one pressed? */
function DoneTick() {
    return (
        <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-emerald-500 text-[8px] font-bold leading-none text-white"
        >
            ✓
        </span>
    )
}

/** How long a press has to be held before it is asking who, not choosing. */
const LONG_PRESS_MS = 400
/** And how long the answer stays up afterwards. */
const REVEAL_MS = 1800

export function PeopleFilterBar({
    columns,
    selected,
    totals,
    personColor,
    onToggle,
    sharedStat,
    controlsId,
}: PeopleFilterBarProps) {
    /**
     * Who a chip belongs to, on a screen with no room to write it beside them.
     *
     * A pointer gets `title`. A finger gets a long press, because the phone is
     * where the names were dropped and "the face is the only label" is fine
     * until the day somebody else packs the bag.
     *
     * Placed under the chip's own row rather than over it: above would take it
     * out of the strip and into the controls above, and with the chips wrapped
     * every row has a below to sit against.
     */
    const [revealed, setRevealed] = useState<{ name: string; left: number; top: number } | null>(null)
    const pressTimer = useRef<number | null>(null)
    const wasLongPress = useRef(false)

    const cancelPress = useCallback(() => {
        if (pressTimer.current !== null) {
            clearTimeout(pressTimer.current)
            pressTimer.current = null
        }
    }, [])

    const beginPress = useCallback((name: string, chip: HTMLElement) => {
        wasLongPress.current = false
        cancelPress()
        pressTimer.current = window.setTimeout(() => {
            wasLongPress.current = true
            setRevealed({
                name,
                left: chip.offsetLeft + chip.offsetWidth / 2,
                top: chip.offsetTop + chip.offsetHeight,
            })
        }, LONG_PRESS_MS)
    }, [cancelPress])

    useEffect(() => {
        if (!revealed) return
        const timer = setTimeout(() => setRevealed(null), REVEAL_MS)
        return () => clearTimeout(timer)
    }, [revealed])

    useEffect(() => cancelPress, [cancelPress])

    /** A press held long enough to ask who was not a press to choose them. */
    const pressHandlers = (name: string) => ({
        title: name,
        onTouchStart: (e: React.TouchEvent<HTMLButtonElement>) => beginPress(name, e.currentTarget),
        onTouchEnd: cancelPress,
        onTouchMove: cancelPress,
        onTouchCancel: cancelPress,
    })

    const swallowLongPress = () => {
        if (!wasLongPress.current) return false
        wasLongPress.current = false
        return true
    }

    // One person is not a choice, and neither is nobody — unless the group's
    // own items are also on offer, which makes it a choice again.
    if (columns.length <= 1 && sharedStat === undefined) return null

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
            <div className="relative min-w-0 flex-1">
            <div
                role="group"
                aria-label="Filter by person"
                aria-controls={controlsId}
                className="flex flex-wrap items-center gap-1.5"
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
                            {...pressHandlers(column.name)}
                            onClick={() => { if (!swallowLongPress()) onToggle(column.key) }}
                            className={`flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border p-2 text-xs font-medium transition-colors sm:py-1.5 sm:pl-2 sm:pr-2.5 ${
                                isSelected
                                    ? 'border-blue-500 bg-blue-600 text-white'
                                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <span className="relative shrink-0">
                                {column.unassigned
                                    ? <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">?</span>
                                    : <PersonAvatar name={column.name} color={color} initial={column.initial} />}
                                {done && <DoneTick />}
                            </span>
                            <span className="hidden whitespace-nowrap sm:inline">{column.name}</span>
                            {/* Only the selected chip carries its numbers, and
                                only where there is room for them. Every chip
                                carrying them makes the strip twice as long for a
                                figure nobody is reading, and a chip that grows
                                when pressed moves the one beside it out from
                                under the finger going there next. */}
                            {isSelected && (
                                <span className="hidden whitespace-nowrap tabular-nums opacity-90 sm:inline">
                                    {stat.packed}/{stat.total}
                                </span>
                            )}
                        </button>
                    )
                })}
                {/* Last, after the people, because it is the one chip that is
                    nobody's. Wearing the same mark a shared row wears. */}
                {sharedStat !== undefined && (() => {
                    const isSelected = selected.has(SHARED_FILTER_KEY)
                    const done = sharedStat.total > 0 && sharedStat.packed === sharedStat.total
                    return (
                        <button
                            type="button"
                            aria-pressed={isSelected}
                            {...pressHandlers('Shared items')}
                            onClick={() => { if (!swallowLongPress()) onToggle(SHARED_FILTER_KEY) }}
                            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border p-2 text-base transition-colors sm:py-1.5 sm:pl-2 sm:pr-2.5 sm:text-xs sm:font-medium ${
                                isSelected
                                    ? 'border-blue-500 bg-blue-600 text-white'
                                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <span className="relative shrink-0">
                                <span aria-hidden="true">👥</span>
                                {done && <DoneTick />}
                            </span>
                            <span className="hidden whitespace-nowrap sm:inline">Shared</span>
                            {isSelected && (
                                <span className="hidden whitespace-nowrap tabular-nums opacity-90 sm:inline">
                                    {sharedStat.packed}/{sharedStat.total}
                                </span>
                            )}
                        </button>
                    )
                })()}
            </div>
            {revealed && (
                <span
                    aria-hidden="true"
                    data-testid="chip-name-reveal"
                    style={{ left: `${revealed.left}px`, top: `${revealed.top + 4}px` }}
                    className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
                >
                    {revealed.name}
                </span>
            )}
            </div>
        </div>
    )
}
