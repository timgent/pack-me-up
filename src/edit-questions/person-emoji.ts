/**
 * The little creature beside a person's name — the second half of the mark
 * `person-colors.ts` starts.
 *
 * Colour alone answers "whose is this?" only once you have learnt the code, and
 * only if you can see colour at all. An emoji is learnable in one glance and
 * survives being printed, screenshotted, or looked at by a five-year-old who
 * cannot read yet but knows perfectly well that the fox is theirs.
 *
 * How a person's emoji is decided, in order:
 *
 *   1. `person.emoji`, if they picked one — including the empty string, which
 *      means "no emoji, use my initial". Absent is not the same as empty: only
 *      the second is a decision.
 *   2. Their species, for pets. A dog wants to be a dog, not the fourth animal
 *      in a rotation.
 *   3. Their position in the question set's people, rotated through `PERSON_EMOJI`
 *      alongside the colour rotation, so a household of four gets four
 *      different creatures without anybody choosing anything.
 *
 * The rotation is the same length as the colour palette and is walked with the
 * same index, so two people who differ in colour also differ in creature.
 */

import type { PetSpecies } from './types'

export interface PersonEmoji {
    /** The character itself; stored on the person. */
    emoji: string
    /** Named in the picker, and read out there. */
    label: string
}

/**
 * Twelve creatures, one per palette colour. Chosen to stay legible filled into
 * a 20px disc — no faces that turn to mush, nothing that is mostly one colour
 * the disc behind it might also be.
 */
export const PERSON_EMOJI: readonly PersonEmoji[] = [
    { emoji: '🦊', label: 'Fox' },
    { emoji: '🐼', label: 'Panda' },
    { emoji: '🐨', label: 'Koala' },
    { emoji: '🦁', label: 'Lion' },
    { emoji: '🐸', label: 'Frog' },
    { emoji: '🐙', label: 'Octopus' },
    { emoji: '🦄', label: 'Unicorn' },
    { emoji: '🐝', label: 'Bee' },
    { emoji: '🐬', label: 'Dolphin' },
    { emoji: '🦉', label: 'Owl' },
    { emoji: '🐢', label: 'Turtle' },
    { emoji: '🦋', label: 'Butterfly' },
]

/** What the picker offers beyond the twelve defaults, for people who want to be a rocket. */
export const EXTRA_PERSON_EMOJI: readonly PersonEmoji[] = [
    { emoji: '🐕', label: 'Dog' },
    { emoji: '🐈', label: 'Cat' },
    { emoji: '🐰', label: 'Rabbit' },
    { emoji: '🐧', label: 'Penguin' },
    { emoji: '🦖', label: 'Dinosaur' },
    { emoji: '🐳', label: 'Whale' },
    { emoji: '⚽', label: 'Football' },
    { emoji: '🎸', label: 'Guitar' },
    { emoji: '🚀', label: 'Rocket' },
    { emoji: '🌈', label: 'Rainbow' },
    { emoji: '⭐', label: 'Star' },
    { emoji: '🍄', label: 'Mushroom' },
]

const SPECIES_EMOJI: Record<PetSpecies, string> = {
    dog: '🐕',
    cat: '🐈',
    other: '🐾',
}

/** The default emoji for the nth person in a list of people. */
export function personEmojiAt(index: number): string {
    return PERSON_EMOJI[((index % PERSON_EMOJI.length) + PERSON_EMOJI.length) % PERSON_EMOJI.length].emoji
}

/**
 * The emoji shown for a person, or `undefined` when they should wear their
 * initial instead — which is what an explicitly cleared emoji (`''`) asks for.
 */
export function personEmojiFor(
    person: { emoji?: string; species?: PetSpecies },
    index: number
): string | undefined {
    if (person.emoji !== undefined) return person.emoji || undefined
    if (person.species) return SPECIES_EMOJI[person.species]
    return personEmojiAt(index)
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
 * An emoji for someone with no position to count from — a guest, or anyone on a
 * list shared from a pod whose question set you have never seen.
 */
export function personEmojiForName(name: string): string {
    return personEmojiAt(hashName(name))
}
