import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { PersonAvatar } from './PersonAvatar'
import { personColorAt } from '../edit-questions/person-colors'
import type { PersonIdentity } from '../edit-questions/person-identity'

const blue = personColorAt(0)
const PHOTO = 'https://alice.example/me.jpg'

const identity = (extra: Partial<PersonIdentity> = {}): PersonIdentity => ({ color: blue, ...extra })

const avatar = () => screen.getByTestId('person-avatar')

describe('the mark one person is drawn as', () => {
    it('is their initial when there is nothing else to show', () => {
        render(<PersonAvatar name="Alice" identity={identity()} />)
        expect(avatar().textContent).toBe('A')
        expect(avatar().className).toContain(blue.avatar)
    })

    it('is the initial the caller worked out, where two people share a letter', () => {
        render(<PersonAvatar name="Alice" identity={identity()} initial="Al" />)
        expect(avatar().textContent).toBe('Al')
    })

    it('is their emoji in preference to any letter', () => {
        render(<PersonAvatar name="Alice" identity={identity({ emoji: '🦊' })} initial="Al" />)
        expect(avatar().textContent).toBe('🦊')
    })

    it('is their photo in preference to their emoji', () => {
        render(<PersonAvatar name="Alice" identity={identity({ emoji: '🦊', photoUrl: PHOTO })} />)
        expect(avatar().getAttribute('src')).toBe(PHOTO)
    })

    it('falls back to something when the name is empty', () => {
        render(<PersonAvatar name="" identity={identity()} />)
        expect(avatar().textContent).toBe('?')
    })
})

describe('the colour, which never drops out', () => {
    it('rings a photo in the person’s colour', () => {
        // "Find your colour, that's your pile" has to keep working for the
        // person who added a photo — this is the assertion the first attempt
        // at photo avatars had nothing standing in for.
        render(<PersonAvatar name="Alice" identity={identity({ photoUrl: PHOTO })} />)
        expect(avatar().className).toContain(blue.ring)
    })

    it('fills an emoji disc with it just as it fills an initial', () => {
        render(<PersonAvatar name="Alice" identity={identity({ emoji: '🦊' })} />)
        expect(avatar().className).toContain(blue.avatar)
    })
})

describe('a photo that will not load', () => {
    it('gives the person their initial back', () => {
        render(<PersonAvatar name="Alice" identity={identity({ photoUrl: PHOTO })} />)
        fireEvent.error(avatar())
        expect(avatar().textContent).toBe('A')
    })

    it('does not keep them there when a working photo arrives later', () => {
        // A WebID typed wrongly and then corrected has to show the new face,
        // not stay broken because the first URL 404'd.
        const { rerender } = render(<PersonAvatar name="Alice" identity={identity({ photoUrl: PHOTO })} />)
        fireEvent.error(avatar())
        expect(avatar().textContent).toBe('A')

        rerender(<PersonAvatar name="Alice" identity={identity({ photoUrl: 'https://alice.example/fixed.jpg' })} />)
        expect(avatar().getAttribute('src')).toBe('https://alice.example/fixed.jpg')
    })

    it('does not retry the same broken URL on every render', () => {
        const broken = identity({ photoUrl: PHOTO })
        const { rerender } = render(<PersonAvatar name="Alice" identity={broken} />)
        fireEvent.error(avatar())
        rerender(<PersonAvatar name="Alice" identity={{ ...broken }} />)
        expect(avatar().textContent).toBe('A')
    })
})

describe('what a screen reader is told', () => {
    it('nothing: the name is always written beside the mark', () => {
        render(<PersonAvatar name="Alice" identity={identity({ photoUrl: PHOTO })} />)
        expect(avatar().getAttribute('aria-hidden')).toBe('true')
        expect(avatar().getAttribute('alt')).toBe('')
    })
})
