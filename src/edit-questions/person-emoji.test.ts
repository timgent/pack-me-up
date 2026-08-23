import { describe, it, expect } from 'vitest'
import { EXTRA_PERSON_EMOJI, PERSON_EMOJI, personEmojiAt, personEmojiFor, personEmojiForName } from './person-emoji'
import { PERSON_COLORS } from './person-colors'

describe('the default emoji rotation', () => {
    it('has one creature per colour, so a household never runs out before the palette does', () => {
        expect(PERSON_EMOJI.length).toBe(PERSON_COLORS.length)
    })

    it('offers no emoji twice, in the defaults or in the extras', () => {
        const all = [...PERSON_EMOJI, ...EXTRA_PERSON_EMOJI].map(e => e.emoji)
        expect(new Set(all).size).toBe(all.length)
    })

    it('gives everyone in a household a different creature', () => {
        const marks = [0, 1, 2, 3, 4].map(personEmojiAt)
        expect(new Set(marks).size).toBe(5)
    })

    it('wraps past the end of the table rather than falling off it', () => {
        expect(personEmojiAt(PERSON_EMOJI.length)).toBe(personEmojiAt(0))
        expect(personEmojiAt(-1)).toBe(personEmojiAt(PERSON_EMOJI.length - 1))
    })
})

describe('the emoji a person ends up wearing', () => {
    it('is the one they picked', () => {
        expect(personEmojiFor({ emoji: '🚀' }, 3)).toBe('🚀')
    })

    it('is nothing at all when they cleared it — which is not the same as never choosing', () => {
        expect(personEmojiFor({ emoji: '' }, 3)).toBeUndefined()
        expect(personEmojiFor({}, 3)).toBe(personEmojiAt(3))
    })

    it('is their species, for a pet, rather than the next animal in the rotation', () => {
        expect(personEmojiFor({ species: 'dog' }, 0)).toBe('🐕')
        expect(personEmojiFor({ species: 'cat' }, 1)).toBe('🐈')
        expect(personEmojiFor({ species: 'other' }, 2)).toBe('🐾')
    })

    it('still lets a pet be something else if they were given one', () => {
        expect(personEmojiFor({ species: 'dog', emoji: '🦖' }, 0)).toBe('🦖')
    })

    it('is stable for a guest with no position, and depends only on their name', () => {
        expect(personEmojiForName('Zoe')).toBe(personEmojiForName('Zoe'))
        expect(PERSON_EMOJI.map(e => e.emoji)).toContain(personEmojiForName('Zoe'))
    })
})
