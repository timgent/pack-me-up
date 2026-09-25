import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SharedAccessHelp } from './SharedAccessHelp'

vi.mock('./ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const mockLogin = vi.fn()
vi.mock('./SolidPodContext', () => ({ useSolidPod: () => ({ login: mockLogin }) }))

const WEB_ID = 'https://bob.solidcommunity.net/profile/card#me'

describe('SharedAccessHelp', () => {
    beforeEach(() => {
        mockLogin.mockReset()
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        })
    })

    describe('when the person following the link is signed out', () => {
        it('explains what the link is and offers a way in', () => {
            render(<SharedAccessHelp what="list" isLoggedIn={false} webId={null} />)

            expect(screen.getByRole('heading', { name: /shared a packing list with you/i })).toBeTruthy()
            expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy()
        })

        it('does not ask them for an address they cannot have yet', () => {
            render(<SharedAccessHelp what="list" isLoggedIn={false} webId={null} />)

            // Signed out, there is no address of theirs to send anyone.
            expect(screen.queryByRole('button', { name: /copy my address/i })).toBeNull()
        })

        it('speaks of a whole setup when that is what was shared', () => {
            render(<SharedAccessHelp what="lists" isLoggedIn={false} webId={null} />)

            expect(screen.getByRole('heading', { name: /shared their packing lists with you/i })).toBeTruthy()
        })
    })

    describe('when they are signed in and still cannot see it', () => {
        it('names the account they are actually signed in as', () => {
            render(<SharedAccessHelp what="list" isLoggedIn webId={WEB_ID} />)

            // Twice over: in the sentence that explains the mismatch, and in
            // the card that hands the address back to them.
            expect(screen.getAllByText(WEB_ID).length).toBeGreaterThan(0)
        })

        it('gives them the address to send back, which is the usual fix', () => {
            render(<SharedAccessHelp what="list" isLoggedIn webId={WEB_ID} />)

            expect(screen.getByRole('button', { name: /copy my address/i })).toBeTruthy()
        })

        // An invite link lands on whichever account accepts it, so it fixes a
        // mixed-up address without either of them having to find the right one.
        it('suggests asking for an invite link before swapping addresses', () => {
            const { container } = render(<SharedAccessHelp what="list" isLoggedIn webId={WEB_ID} />)

            const body = container.textContent ?? ''
            expect(body.search(/new invite link/i)).toBeGreaterThan(-1)
            expect(body.search(/new invite link/i)).toBeLessThan(body.search(/or send them your address/i))
        })

        it('offers both explanations rather than only the alarming one', () => {
            render(<SharedAccessHelp what="list" isLoggedIn webId={WEB_ID} />)

            // "Access denied. The owner may have revoked access" told people
            // they had been shut out, when the likelier truth is a mismatched
            // address they can fix in a message.
            const body = document.body.textContent ?? ''
            expect(body).toMatch(/different address/i)
            expect(body).toMatch(/removed|revoked/i)
        })

        it('starts sign-in from here when there is no WebID to show', () => {
            // Signed in but with no readable WebID is not a state worth its own
            // screen; treat it as signed out rather than rendering a blank.
            render(<SharedAccessHelp what="list" isLoggedIn webId={null} />)

            expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy()
        })
    })

    it('opens the sign-in prompt when asked', () => {
        render(<SharedAccessHelp what="list" isLoggedIn={false} webId={null} />)

        fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

        expect(screen.getByRole('heading', { name: /sign in to open/i })).toBeTruthy()
    })
})
