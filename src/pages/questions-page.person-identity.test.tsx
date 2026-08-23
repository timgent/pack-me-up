import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import { PeopleModal } from './questions-page'
import type { Person } from '../edit-questions/types'
import { PERSON_COLORS, personColorAt } from '../edit-questions/person-colors'
import { personEmojiAt } from '../edit-questions/person-emoji'

vi.mock('../components/DatabaseContext', () => ({ useDatabase: vi.fn() }))
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: vi.fn() }))
vi.mock('../components/ForeignPodContext', () => ({ useForeignPod: vi.fn() }))

const people: Person[] = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
]

function renderModal(initial: Person[] = people) {
    const onSave = vi.fn()
    render(<PeopleModal people={initial} onSave={onSave} onClose={vi.fn()} session={null} />)
    return { onSave }
}

/** The button that opens someone's appearance, and the mark inside it. */
const avatarButtonFor = (name: string) => screen.getByRole('button', { name: `Change appearance for ${name}` })
const markFor = (name: string) => within(avatarButtonFor(name)).getByTestId('person-avatar')

describe('PeopleModal appearance picker', () => {
    it('paints each avatar with the colour for that person’s position', () => {
        renderModal()
        expect(markFor('Alice').className).toContain(personColorAt(0).avatar)
        expect(markFor('Bob').className).toContain(personColorAt(1).avatar)
    })

    it('paints an avatar with the colour the person chose earlier', () => {
        renderModal([{ id: 'p1', name: 'Alice', color: 'lime' }])
        const lime = PERSON_COLORS.find(c => c.id === 'lime')!
        expect(markFor('Alice').className).toContain(lime.avatar)
    })

    it('hands each person a different emoji without anybody choosing one', () => {
        renderModal()
        expect(markFor('Alice').textContent).toBe(personEmojiAt(0))
        expect(markFor('Bob').textContent).toBe(personEmojiAt(1))
        expect(markFor('Alice').textContent).not.toBe(markFor('Bob').textContent)
    })

    it('keeps the panel shut until the avatar is tapped', () => {
        renderModal()
        expect(screen.queryByRole('group', { name: /Colour for Alice/ })).toBeNull()
        fireEvent.click(avatarButtonFor('Alice'))
        expect(screen.getByRole('group', { name: 'Colour for Alice' })).toBeTruthy()
        expect(screen.getByRole('group', { name: 'Emoji for Alice' })).toBeTruthy()
    })

    it('opens one panel at a time', () => {
        renderModal()
        fireEvent.click(avatarButtonFor('Alice'))
        fireEvent.click(avatarButtonFor('Bob'))
        expect(screen.queryByRole('group', { name: 'Colour for Alice' })).toBeNull()
        expect(screen.getByRole('group', { name: 'Colour for Bob' })).toBeTruthy()
    })

    it('marks the person’s current colour as the chosen swatch', () => {
        renderModal()
        fireEvent.click(avatarButtonFor('Alice'))
        const group = screen.getByRole('group', { name: 'Colour for Alice' })
        const chosen = within(group).getByRole('button', { name: personColorAt(0).label })
        expect(chosen.getAttribute('aria-pressed')).toBe('true')
    })

    it('repaints the avatar when a colour is picked, and stays open for the next choice', () => {
        // Three things to set behind one tap: closing after the first would
        // make setting the second a second trip.
        renderModal()
        fireEvent.click(avatarButtonFor('Alice'))
        fireEvent.click(screen.getByRole('button', { name: 'Pink' }))
        const pink = PERSON_COLORS.find(c => c.id === 'pink')!
        expect(markFor('Alice').className).toContain(pink.avatar)
        expect(screen.getByRole('group', { name: 'Colour for Alice' })).toBeTruthy()
    })

    it('saves the chosen colour on the person', () => {
        const { onSave } = renderModal()
        fireEvent.click(avatarButtonFor('Bob'))
        fireEvent.click(screen.getByRole('button', { name: 'Teal' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onSave).toHaveBeenCalledWith([
            { id: 'p1', name: 'Alice' },
            { id: 'p2', name: 'Bob', color: 'teal' },
        ])
    })

    it('swaps the mark for the emoji that was picked, and saves it', () => {
        const { onSave } = renderModal()
        fireEvent.click(avatarButtonFor('Alice'))
        fireEvent.click(within(screen.getByRole('group', { name: 'Emoji for Alice' })).getByRole('button', { name: 'Rocket' }))

        expect(markFor('Alice').textContent).toBe('🚀')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onSave).toHaveBeenCalledWith([
            { id: 'p1', name: 'Alice', emoji: '🚀' },
            { id: 'p2', name: 'Bob' },
        ])
    })

    it('puts someone back in their initial when they clear their emoji', () => {
        // Stored as '', not dropped: absent would only hand back the default.
        const { onSave } = renderModal()
        fireEvent.click(avatarButtonFor('Alice'))
        fireEvent.click(screen.getByRole('button', { name: 'No emoji, use their initial' }))

        expect(markFor('Alice').textContent).toBe('A')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onSave).toHaveBeenCalledWith([
            { id: 'p1', name: 'Alice', emoji: '' },
            { id: 'p2', name: 'Bob' },
        ])
    })

    it('saves a WebID, trimmed, and drops it again when the field is emptied', () => {
        const { onSave } = renderModal([{ id: 'p1', name: 'Alice', webId: 'https://old.example/profile/card#me' }])
        fireEvent.click(avatarButtonFor('Alice'))
        const field = screen.getByLabelText('Solid WebID for Alice')

        fireEvent.change(field, { target: { value: '  https://alice.example/profile/card#me  ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onSave).toHaveBeenCalledWith([
            { id: 'p1', name: 'Alice', webId: 'https://alice.example/profile/card#me' },
        ])

        fireEvent.change(screen.getByLabelText('Solid WebID for Alice'), { target: { value: '' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onSave).toHaveBeenLastCalledWith([{ id: 'p1', name: 'Alice', webId: undefined }])
    })

    it('names an unnamed person by position so the picker is still findable', () => {
        renderModal([{ id: 'p1', name: '' }])
        expect(screen.getByRole('button', { name: 'Change appearance for Person 1' })).toBeTruthy()
    })
})
