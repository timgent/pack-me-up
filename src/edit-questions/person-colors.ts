/**
 * The colours people are shown in — the coloured initial beside every item on
 * the questions page, and the same person's section on a packing list.
 *
 * The colour is the fastest way to answer "whose is this?", so it has to mean
 * the same thing everywhere it appears. That is the whole reason this palette
 * is one shared table rather than a couple of class lists next to the two
 * components that happened to need them.
 *
 * How a person's colour is decided, in order:
 *
 *   1. `person.color`, if they picked one.
 *   2. Their position in the question set's people — the rotation the app has
 *      always used, so nobody who never opens the picker sees anything change.
 *   3. A hash of their name, where there is no position to count: guests added
 *      straight to a list, and lists shared from someone else's pod, whose
 *      people aren't in your question set at all.
 *
 * Every class is written out in full. Tailwind scans source text, so a class
 * assembled from a colour variable would simply not exist at runtime.
 */

import { z } from 'zod'

export const PersonColorSchema = z.enum([
    'blue',
    'violet',
    'emerald',
    'amber',
    'rose',
    'cyan',
    'orange',
    'indigo',
    'teal',
    'fuchsia',
    'lime',
    'pink',
])

export type PersonColorId = z.infer<typeof PersonColorSchema>

export interface PersonColor {
    /** Stored on the person; the palette is keyed by it. */
    id: PersonColorId
    /** Shown in the picker, and read out to screen readers there. */
    label: string
    /** The filled disc carrying the person's initial. */
    avatar: string
    /** Outline of that person's card on a packing list. */
    border: string
    /** Tinted fill, for a heading strip that belongs to one person. */
    soft: string
    /** Text on that tinted fill. */
    text: string
    /** Ring around the swatch currently chosen in the picker. */
    ring: string
}

export const PERSON_COLORS: readonly PersonColor[] = [
    { id: 'blue', label: 'Blue', avatar: 'bg-blue-500 text-white', border: 'border-blue-300 dark:border-blue-700', soft: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-900 dark:text-blue-200', ring: 'ring-blue-400' },
    { id: 'violet', label: 'Violet', avatar: 'bg-violet-500 text-white', border: 'border-violet-300 dark:border-violet-700', soft: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-900 dark:text-violet-200', ring: 'ring-violet-400' },
    { id: 'emerald', label: 'Emerald', avatar: 'bg-emerald-500 text-white', border: 'border-emerald-300 dark:border-emerald-700', soft: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-900 dark:text-emerald-200', ring: 'ring-emerald-400' },
    { id: 'amber', label: 'Amber', avatar: 'bg-amber-500 text-white', border: 'border-amber-300 dark:border-amber-700', soft: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-900 dark:text-amber-200', ring: 'ring-amber-400' },
    { id: 'rose', label: 'Rose', avatar: 'bg-rose-500 text-white', border: 'border-rose-300 dark:border-rose-700', soft: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-900 dark:text-rose-200', ring: 'ring-rose-400' },
    { id: 'cyan', label: 'Cyan', avatar: 'bg-cyan-500 text-white', border: 'border-cyan-300 dark:border-cyan-700', soft: 'bg-cyan-50 dark:bg-cyan-950/40', text: 'text-cyan-900 dark:text-cyan-200', ring: 'ring-cyan-400' },
    { id: 'orange', label: 'Orange', avatar: 'bg-orange-500 text-white', border: 'border-orange-300 dark:border-orange-700', soft: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-900 dark:text-orange-200', ring: 'ring-orange-400' },
    { id: 'indigo', label: 'Indigo', avatar: 'bg-indigo-500 text-white', border: 'border-indigo-300 dark:border-indigo-700', soft: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-900 dark:text-indigo-200', ring: 'ring-indigo-400' },
    { id: 'teal', label: 'Teal', avatar: 'bg-teal-500 text-white', border: 'border-teal-300 dark:border-teal-700', soft: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-900 dark:text-teal-200', ring: 'ring-teal-400' },
    { id: 'fuchsia', label: 'Fuchsia', avatar: 'bg-fuchsia-500 text-white', border: 'border-fuchsia-300 dark:border-fuchsia-700', soft: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', text: 'text-fuchsia-900 dark:text-fuchsia-200', ring: 'ring-fuchsia-400' },
    // The one initial not written in white: lime is too bright to carry it.
    { id: 'lime', label: 'Lime', avatar: 'bg-lime-400 text-lime-950', border: 'border-lime-300 dark:border-lime-700', soft: 'bg-lime-50 dark:bg-lime-950/40', text: 'text-lime-900 dark:text-lime-200', ring: 'ring-lime-500' },
    { id: 'pink', label: 'Pink', avatar: 'bg-pink-500 text-white', border: 'border-pink-300 dark:border-pink-700', soft: 'bg-pink-50 dark:bg-pink-950/40', text: 'text-pink-900 dark:text-pink-200', ring: 'ring-pink-400' },
]

/**
 * The avatar classes the app rotated through before colours could be chosen,
 * in their original order. The palette starts with exactly these, so the
 * position fallback hands every existing person the colour they already had —
 * asserted in the tests rather than left to whoever next edits the table.
 */
export const LEGACY_AVATAR_ROTATION: readonly string[] = [
    'bg-blue-500 text-white',
    'bg-violet-500 text-white',
    'bg-emerald-500 text-white',
    'bg-amber-500 text-white',
    'bg-rose-500 text-white',
    'bg-cyan-500 text-white',
]

/** An avatar for someone this item isn't for: present, but plainly off. */
export const PERSON_COLOR_OFF = 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600'

const BY_ID = new Map<string, PersonColor>(PERSON_COLORS.map(color => [color.id, color]))

/** The default colour for the nth person in a list of people. */
export function personColorAt(index: number): PersonColor {
    return PERSON_COLORS[((index % PERSON_COLORS.length) + PERSON_COLORS.length) % PERSON_COLORS.length]
}

/** Plain string hash — stable across reloads, machines and stored data. */
function hashName(name: string): number {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
}

/**
 * A colour for someone with no position to count from. Two names can land on
 * the same colour; that costs nothing, because the name is written next to it.
 */
export function personColorForName(name: string): PersonColor {
    return PERSON_COLORS[hashName(name) % PERSON_COLORS.length]
}

/**
 * The colour of the person at `index` in a set of people. An unrecognised
 * stored colour — one a newer version of the app knows and this one doesn't —
 * falls back to the position rather than leaving the avatar unpainted.
 */
export function personColorFor(person: { color?: string }, index: number): PersonColor {
    return (person.color !== undefined ? BY_ID.get(person.color) : undefined) ?? personColorAt(index)
}

/** Someone a packing list knows about: an item's person, or a guest. */
export interface ColorablePerson {
    id?: string
    name: string
}

/**
 * A colour for anyone a packing list mentions, resolved against the people in
 * the question set.
 *
 * Lists carry a person's id and name, not their colour, so the colours are read
 * from the question set when the list is shown rather than copied onto it. Same
 * reasoning as the section order: how you want your people coloured is one
 * setting, not a decision frozen into each trip on the day you made it.
 *
 * `others` are the people a list mentions that the question set has never heard
 * of — guests added straight to a list, and everyone on a list shared from
 * someone else's pod. They can't have a position in the question set to count
 * from, so they take the first colour nobody on this list is already using.
 * That is what keeps a guest from turning up in the same colour as the person
 * sitting next to them, which the position rotation alone cannot promise.
 */
export function buildPersonColorLookup(
    people: readonly { id: string; name: string; color?: string; deletedAt?: string }[],
    others: readonly ColorablePerson[] = []
): (person: ColorablePerson) => PersonColor {
    const byId = new Map<string, PersonColor>()
    const byName = new Map<string, PersonColor>()
    const taken = new Set<PersonColorId>()

    const assign = (id: string | undefined, name: string, color: PersonColor) => {
        if (id) byId.set(id, color)
        // First one wins: two people sharing a name is already ambiguous
        // everywhere else in the app, and an id will usually settle it.
        if (!byName.has(name)) byName.set(name, color)
        taken.add(color.id)
    }

    people
        .filter(person => !person.deletedAt)
        .forEach((person, index) => assign(person.id, person.name, personColorFor(person, index)))

    for (const other of others) {
        if (other.id && byId.has(other.id)) continue
        if (!other.id && byName.has(other.name)) continue
        // Once every colour is spoken for there is nothing left to hand out, so
        // fall back to the hash rather than always reaching for the same one.
        const free = PERSON_COLORS.find(color => !taken.has(color.id))
        assign(other.id, other.name, free ?? personColorForName(other.name))
    }

    return ({ id, name }) =>
        (id ? byId.get(id) : undefined) ?? byName.get(name) ?? personColorForName(name)
}
