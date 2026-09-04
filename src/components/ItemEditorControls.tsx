import { UsersIcon } from '@heroicons/react/24/outline'
/**
 * The controls that edit one item's settings, shared by the option editor's
 * dense modal rows and by the inline editor that opens inside a read-only list.
 *
 * The two callers want the same switches in different shapes — a modal row packs
 * them onto one line on desktop, the inline panel gives them room — so the
 * layout is a prop rather than something read from the viewport here.
 */
import { memo } from 'react'
import type { Item, Person } from '../edit-questions/types'
import { PERSON_COLOR_OFF, personColorFor } from '../edit-questions/person-colors'

/** "2 per night" / "1 per 4 nights" — the human phrasing of an item's rate. */
export function rateLabel(item: Item): string {
    const nights = item.perNights ?? 1
    return nights > 1 ? `${item.perNight} per ${nights} nights` : `${item.perNight} per night`
}

/** The short form that fits on a badge: ×1/nt, ×1/4nt. */
export function rateBadge(item: Item): string {
    return (item.perNights ?? 1) > 1
        ? `×${item.perNight}/${item.perNights}nt`
        : `×${item.perNight}/nt`
}

export function parseQty(raw: string): number | undefined {
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
}

export function quantityTitle(item: Item): string {
    return item.perNight !== undefined
        ? `Suggested quantity: ${rateLabel(item)}${item.maxQuantity !== undefined ? `, up to ${item.maxQuantity}` : ''}`
        : 'Suggest a quantity based on nights away (e.g. 1 pair of socks per night, or 1 jumper per 4 nights)'
}

export type PersonTogglesLayout = 'avatars' | 'tiles'

/**
 * Who an item is for, plus whether it is packed once for the whole group.
 *
 * `avatars` is the compact row of coloured initials; `tiles` gives each person a
 * labelled target big enough for a thumb. The modal picks between them by form
 * factor, the inline editor always uses tiles.
 */
export const PersonToggles = memo(function PersonToggles({ item, people, layout, onTogglePerson, onToggleCommunal }: {
    item: Item
    people: Person[]
    layout: PersonTogglesLayout
    onTogglePerson: (personIdx: number) => void
    onToggleCommunal: () => void
}) {
    const isCommunal = item.communal === true
    const communalTitle = isCommunal
        ? 'Shared item — packed once for the group. Click to make per-person.'
        : 'Make this a shared item, packed once for the group'
    const personTitle = (name: string) => isCommunal
        ? `Needed when ${name} is on the trip`
        : name

    if (layout === 'avatars') {
        return (
            <div className="flex gap-0.5 shrink-0 items-center">
                <button
                    type="button"
                    onClick={onToggleCommunal}
                    title={communalTitle}
                    aria-label={`Toggle shared for ${item.text || 'item'}`}
                    aria-pressed={isCommunal}
                    className={`inline-flex items-center justify-center h-5 rounded-full px-1 text-[10px] transition-colors mr-1 ${isCommunal ? 'bg-blue-600 text-white' : PERSON_COLOR_OFF}`}
                >
                    <UsersIcon aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
                {people.length > 1 && people.map((person, personIdx) => {
                    const selected = item.personSelections?.[personIdx]?.selected ?? false
                    return (
                        <button
                            key={person.id}
                            type="button"
                            onClick={() => onTogglePerson(personIdx)}
                            title={personTitle(person.name)}
                            aria-pressed={selected}
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors ${selected ? personColorFor(person, personIdx).avatar : PERSON_COLOR_OFF} ${isCommunal && selected ? 'ring-2 ring-blue-300 dark:ring-blue-700 ring-offset-1' : ''}`}
                        >
                            {person.name.charAt(0).toUpperCase()}
                        </button>
                    )
                })}
            </div>
        )
    }

    return (
        <div className="flex gap-2">
            <button
                type="button"
                onClick={onToggleCommunal}
                title={communalTitle}
                aria-label={`Toggle shared for ${item.text || 'item'}`}
                aria-pressed={isCommunal}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-colors ${isCommunal ? 'bg-blue-600 text-white border-transparent' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'}`}
            >
                <UsersIcon aria-hidden="true" className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1">
                    Shared
                </span>
            </button>
            {people.length > 1 && people.map((person, personIdx) => {
                const selected = item.personSelections?.[personIdx]?.selected ?? false
                return (
                    <button
                        key={person.id}
                        type="button"
                        onClick={() => onTogglePerson(personIdx)}
                        title={personTitle(person.name)}
                        aria-pressed={selected}
                        className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-colors ${selected ? `${personColorFor(person, personIdx).avatar} border-transparent` : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'}`}
                    >
                        <span className="text-lg font-bold leading-none">
                            {person.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1">
                            {person.name}
                        </span>
                    </button>
                )
            })}
        </div>
    )
})

/**
 * The "pack N per M nights, up to X" rate. `perNights` and `maxQuantity` only
 * mean anything once there is a rate to qualify, so they stay disabled until
 * `perNight` is set.
 */
export const QuantityPanel = memo(function QuantityPanel({ item, onPerNight, onPerNights, onMaxQuantity }: {
    item: Item
    onPerNight: (value: number | undefined) => void
    onPerNights: (value: number | undefined) => void
    onMaxQuantity: (value: number | undefined) => void
}) {
    const hasRate = item.perNight !== undefined
    return (
        <div className="w-full flex items-center gap-3 flex-wrap text-xs text-gray-600 dark:text-gray-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 rounded-lg px-2.5 py-1.5">
            <span className="flex items-center gap-1.5">
                Pack
                <input
                    type="number"
                    min={1}
                    value={item.perNight ?? ''}
                    onChange={e => onPerNight(parseQty(e.target.value))}
                    aria-label={`Quantity to pack for ${item.text || 'item'}`}
                    className="w-12 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                per
                <input
                    type="number"
                    min={1}
                    placeholder="1"
                    value={item.perNights ?? ''}
                    onChange={e => onPerNights(parseQty(e.target.value))}
                    disabled={!hasRate}
                    aria-label={`Number of nights per ${item.text || 'item'}`}
                    className="w-12 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-40"
                />
                night{(item.perNights ?? 1) > 1 ? 's' : ''}
            </span>
            <label className={`flex items-center gap-1.5 ${hasRate ? '' : 'opacity-40'}`}>
                Max
                <input
                    type="number"
                    min={1}
                    value={item.maxQuantity ?? ''}
                    onChange={e => onMaxQuantity(parseQty(e.target.value))}
                    disabled={!hasRate}
                    aria-label={`Maximum quantity for ${item.text || 'item'}`}
                    className="w-12 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
            </label>
            <span className="text-gray-400 dark:text-gray-500">
                e.g. socks: 1 per night; a jumper: 1 per 4 nights. Suggests a
                quantity when a list has nights away — leave blank to skip
            </span>
        </div>
    )
})
