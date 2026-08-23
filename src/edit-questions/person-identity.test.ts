import { describe, it, expect } from 'vitest'
import { buildPersonIdentityLookup, personIdentityAt } from './person-identity'
import { personColorAt, personColorFor, PERSON_COLORS } from './person-colors'
import { personEmojiAt } from './person-emoji'
import type { Person } from './types'

const alice: Person = { id: 'p1', name: 'Alice' }
const bob: Person = { id: 'p2', name: 'Bob', color: 'pink' }

describe('the identity of everyone on a list', () => {
    it('gives each person their colour and the emoji their position hands them', () => {
        const identity = buildPersonIdentityLookup([alice, bob])

        expect(identity(alice)).toEqual({ color: personColorAt(0), emoji: personEmojiAt(0) })
        expect(identity(bob)).toEqual({
            color: PERSON_COLORS.find(c => c.id === 'pink'),
            emoji: personEmojiAt(1),
        })
    })

    it('leaves out the emoji of someone who cleared it, so their initial shows', () => {
        const identity = buildPersonIdentityLookup([{ ...alice, emoji: '' }])
        expect(identity(alice).emoji).toBeUndefined()
    })

    it('counts positions past the people who have been deleted', () => {
        const gone: Person = { id: 'p0', name: 'Gone', deletedAt: '2025-01-01T00:00:00.000Z' }
        const identity = buildPersonIdentityLookup([gone, alice])
        expect(identity(alice).emoji).toBe(personEmojiAt(0))
    })

    it('gives a guest the question set has never heard of a mark of their own', () => {
        const identity = buildPersonIdentityLookup([alice, bob], [{ id: 'g1', name: 'Zoe' }])
        const zoe = identity({ id: 'g1', name: 'Zoe' })

        expect(zoe.emoji).toBeTruthy()
        expect(zoe.color.id).not.toBe(personColorAt(0).id)
        expect(zoe.color.id).not.toBe('pink')
    })
})

describe('the photo on an avatar', () => {
    const withWebId: Person = { ...alice, webId: 'https://alice.example/profile/card#me' }
    const photos = { 'https://alice.example/profile/card#me': 'https://alice.example/me.jpg' }
    const photoFor = (webId: string) => photos[webId as keyof typeof photos]

    it('comes from the person’s own WebID', () => {
        const identity = buildPersonIdentityLookup([withWebId], [], photoFor)
        expect(identity(withWebId).photoUrl).toBe('https://alice.example/me.jpg')
    })

    it('is absent for someone who has not given a WebID', () => {
        const identity = buildPersonIdentityLookup([withWebId, bob], [], photoFor)
        expect(identity(bob).photoUrl).toBeUndefined()
    })

    it('does not leak between two people who share a name', () => {
        // The bug this replaces keyed photos by name: one Sam's face turned up
        // on the other Sam.
        const samWithPhoto: Person = { id: 'p1', name: 'Sam', webId: 'https://alice.example/profile/card#me' }
        const otherSam: Person = { id: 'p2', name: 'Sam' }
        const identity = buildPersonIdentityLookup([samWithPhoto, otherSam], [], photoFor)

        expect(identity(samWithPhoto).photoUrl).toBe('https://alice.example/me.jpg')
        expect(identity(otherSam).photoUrl).toBeUndefined()
    })

    it('keeps the person’s colour alongside the photo, never instead of it', () => {
        const identity = buildPersonIdentityLookup([bob, { ...withWebId, id: 'p1' }], [], photoFor)
        const found = identity({ id: 'p1', name: 'Alice' })

        expect(found.photoUrl).toBe('https://alice.example/me.jpg')
        expect(found.color).toEqual(personColorAt(1))
    })

    it('follows a renamed person, because a WebID is not their name', () => {
        const renamed: Person = { ...withWebId, name: 'Alicia' }
        const identity = buildPersonIdentityLookup([renamed], [], photoFor)
        expect(identity({ id: 'p1', name: 'Alicia' }).photoUrl).toBe('https://alice.example/me.jpg')
    })
})

describe('the identity of one person at a known position', () => {
    it('agrees with the colour and emoji they would get on a list', () => {
        expect(personIdentityAt(bob, 1)).toEqual({
            color: personColorFor(bob, 1),
            emoji: personEmojiAt(1),
        })
    })
})
