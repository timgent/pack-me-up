import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { WebIdField } from './WebIdField'
import type { WebIdLookup } from '../hooks/useWebIdLookup'

const lookup = (over: Partial<WebIdLookup>): WebIdLookup => ({
    webId: null,
    status: 'empty',
    profile: { name: null, photo: null, resolved: false },
    ...over,
})

describe('WebIdField', () => {
    it('passes what is typed straight back out', () => {
        const onChange = vi.fn()
        render(
            <WebIdField
                label="Their sharing address"
                value=""
                onChange={onChange}
                lookup={lookup({})}
            />,
        )

        fireEvent.change(screen.getByLabelText('Their sharing address'), {
            target: { value: 'bob.solidcommunity.net' },
        })

        expect(onChange).toHaveBeenCalledWith('bob.solidcommunity.net')
    })

    it('names the person it found', () => {
        render(
            <WebIdField
                label="Their sharing address"
                value="bob.solidcommunity.net"
                onChange={vi.fn()}
                lookup={lookup({
                    webId: 'https://bob.solidcommunity.net/profile/card#me',
                    status: 'found',
                    profile: { name: 'Bob Smith', photo: null, resolved: true },
                })}
            />,
        )

        expect(screen.getByText('Bob Smith')).toBeTruthy()
    })

    it('shows the address it will actually use when that is not what was typed', () => {
        render(
            <WebIdField
                label="Their sharing address"
                value="bob.solidcommunity.net"
                onChange={vi.fn()}
                lookup={lookup({
                    webId: 'https://bob.solidcommunity.net/profile/card#me',
                    status: 'found',
                    profile: { name: 'Bob Smith', photo: null, resolved: true },
                })}
            />,
        )

        expect(screen.getByText(/https:\/\/bob\.solidcommunity\.net\/profile\/card#me/)).toBeTruthy()
    })

    it('falls back to a name drawn from the address when the card has none', () => {
        render(
            <WebIdField
                label="Their sharing address"
                value="https://bob.solidcommunity.net/profile/card#me"
                onChange={vi.fn()}
                lookup={lookup({
                    webId: 'https://bob.solidcommunity.net/profile/card#me',
                    status: 'found',
                    profile: { name: null, photo: null, resolved: true },
                })}
            />,
        )

        expect(screen.getByText(/bob/i)).toBeTruthy()
    })

    it('warns, without blocking, when nobody answers at the address', () => {
        render(
            <WebIdField
                label="Their sharing address"
                value="https://nobody.example.org/profile/card#me"
                onChange={vi.fn()}
                lookup={lookup({ webId: 'https://nobody.example.org/profile/card#me', status: 'unknown' })}
            />,
        )

        expect(screen.getByRole('status').textContent).toMatch(/couldn't find/i)
    })

    it('says so when the input is not an address at all', () => {
        render(
            <WebIdField
                label="Their sharing address"
                value="bob"
                onChange={vi.fn()}
                lookup={lookup({ status: 'invalid' })}
            />,
        )

        expect(screen.getByRole('status').textContent).toMatch(/doesn't look like/i)
    })

    it('says it is checking while it checks', () => {
        render(
            <WebIdField
                label="Their sharing address"
                value="https://bob.example.org/profile/card#me"
                onChange={vi.fn()}
                lookup={lookup({ webId: 'https://bob.example.org/profile/card#me', status: 'checking' })}
            />,
        )

        expect(screen.getByRole('status').textContent).toMatch(/checking/i)
    })

    it('tells an empty field where to get an address, and nothing else', () => {
        render(
            <WebIdField
                label="Their sharing address"
                value=""
                onChange={vi.fn()}
                lookup={lookup({})}
            />,
        )

        // The how-to-get-one hint is the whole point of the empty state: it is
        // the step neither person knew how to take.
        expect(screen.getByText(/Sharing page/i)).toBeTruthy()
    })
})
