/**
 * Everything an avatar needs to stand for one person: their colour, their
 * emoji, and — when they have told us their WebID — the photo from their Solid
 * profile.
 *
 * The three are one idea, not three, which is why they are resolved together
 * here rather than by three lookups the call sites would have to keep in step.
 * A person is drawn as *one* mark, and the mark is the first of these they
 * have:
 *
 *   photo → emoji → the first letter of their name
 *
 * always inside their colour. The colour never drops out, whichever mark wins:
 * a photo is ringed in it. "Find your colour, that's your pile" has to keep
 * working for the person who added a photo.
 */

import {
    buildPersonColorLookup,
    personColorFor,
    type ColorablePerson,
    type PersonColor,
} from './person-colors'
import { personEmojiFor, personEmojiForName } from './person-emoji'
import type { Person } from './types'

export interface PersonIdentity {
    color: PersonColor
    /** Absent means "wear the initial" — see `personEmojiFor`. */
    emoji?: string
    /** Absent means there is no photo, or it has not arrived yet. */
    photoUrl?: string
}

export type PersonIdentityLookup = (person: ColorablePerson) => PersonIdentity

/** Where a photo comes from, given a person's WebID. */
export type PhotoLookup = (webId: string) => string | undefined

const NO_PHOTOS: PhotoLookup = () => undefined

/**
 * How to draw everyone a packing list mentions.
 *
 * `others` are the people the list names that the question set has never heard
 * of — guests, and the whole cast of a list shared from someone else's pod.
 * They have no position to count from, so they fall back to a hash of their
 * name, and to whichever colour `buildPersonColorLookup` has left over.
 *
 * Photos are looked up by WebID rather than by name or by person id: a WebID is
 * already the identity of exactly one profile, so two people called Sam cannot
 * collide, a rename cannot orphan an entry, and a removed person's photo has
 * nothing left pointing at it.
 */
export function buildPersonIdentityLookup(
    people: readonly Person[],
    others: readonly ColorablePerson[] = [],
    photoFor: PhotoLookup = NO_PHOTOS,
): PersonIdentityLookup {
    const colorFor = buildPersonColorLookup(people, others)

    // The position the colour rotation counts with, so a person's default emoji
    // and their default colour are read off the same place in the list.
    const living = people.filter(person => !person.deletedAt)
    const byId = new Map(living.map((person, index) => [person.id, { person, index }]))
    const byName = new Map<string, { person: Person; index: number }>()
    living.forEach((person, index) => {
        // First one wins, as everywhere else a name is used to find a person.
        if (!byName.has(person.name)) byName.set(person.name, { person, index })
    })

    return ({ id, name }) => {
        const color = colorFor({ id, name })
        const found = (id ? byId.get(id) : undefined) ?? byName.get(name)
        if (!found) return { color, emoji: personEmojiForName(name) }

        const emoji = personEmojiFor(found.person, found.index)
        const photoUrl = found.person.webId ? photoFor(found.person.webId) : undefined
        return {
            color,
            ...(emoji !== undefined ? { emoji } : {}),
            ...(photoUrl ? { photoUrl } : {}),
        }
    }
}

/** The identity of one person at a known position — for the People editor, which has both. */
export function personIdentityAt(person: Person, index: number, photoFor: PhotoLookup = NO_PHOTOS): PersonIdentity {
    const emoji = personEmojiFor(person, index)
    const photoUrl = person.webId ? photoFor(person.webId) : undefined
    return {
        color: personColorFor(person, index),
        ...(emoji !== undefined ? { emoji } : {}),
        ...(photoUrl ? { photoUrl } : {}),
    }
}
