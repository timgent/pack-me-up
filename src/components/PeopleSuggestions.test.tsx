import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { PeopleSuggestions } from './PeopleSuggestions'

const BOB = 'https://bob.solidcommunity.net/profile/card#me'
const CAROL = 'https://carol.solidcommunity.net/profile/card#me'

describe('PeopleSuggestions', () => {
    it('offers a chip per person', () => {
        render(
            <PeopleSuggestions
                people={[{ webId: BOB, name: 'Bob' }, { webId: CAROL, name: 'Carol' }]}
                alreadyShared={[]}
                onPick={vi.fn()}
            />,
        )

        expect(screen.getByRole('button', { name: /Bob/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Carol/ })).toBeTruthy()
    })

    it('hands back the address when one is picked', () => {
        const onPick = vi.fn()
        render(
            <PeopleSuggestions people={[{ webId: BOB, name: 'Bob' }]} alreadyShared={[]} onPick={onPick} />,
        )

        fireEvent.click(screen.getByRole('button', { name: /Bob/ }))

        expect(onPick).toHaveBeenCalledWith(BOB)
    })

    it('leaves out people who already have access', () => {
        render(
            <PeopleSuggestions
                people={[{ webId: BOB, name: 'Bob' }, { webId: CAROL, name: 'Carol' }]}
                alreadyShared={[BOB]}
                onPick={vi.fn()}
            />,
        )

        expect(screen.queryByRole('button', { name: /Bob/ })).toBeNull()
        expect(screen.getByRole('button', { name: /Carol/ })).toBeTruthy()
    })

    it('recognises someone who already has access under a differently shaped address', () => {
        render(
            <PeopleSuggestions
                people={[{ webId: BOB, name: 'Bob' }]}
                alreadyShared={['https://bob.solidcommunity.net/']}
                onPick={vi.fn()}
            />,
        )

        expect(screen.queryByRole('button', { name: /Bob/ })).toBeNull()
    })

    it('renders nothing at all when there is nobody left to suggest', () => {
        const { container } = render(
            <PeopleSuggestions people={[{ webId: BOB, name: 'Bob' }]} alreadyShared={[BOB]} onPick={vi.fn()} />,
        )

        // Not an empty-state message: a heading over no chips is worse than
        // the absence of both.
        expect(container.textContent).toBe('')
    })

    it('renders nothing when nobody is known yet', () => {
        const { container } = render(
            <PeopleSuggestions people={[]} alreadyShared={[]} onPick={vi.fn()} />,
        )

        expect(container.textContent).toBe('')
    })

    it('names the address behind each chip for anyone checking', () => {
        render(
            <PeopleSuggestions people={[{ webId: BOB, name: 'Bob' }]} alreadyShared={[]} onPick={vi.fn()} />,
        )

        expect(screen.getByRole('button', { name: /Bob/ }).getAttribute('title')).toBe(BOB)
    })
})
