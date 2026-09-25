import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import type { AppSession } from '../types/AppSession'
import type { StoredInvite } from '../services/invites'
import { PUBLIC_APP_ORIGIN } from '../services/publicAppOrigin'

const mockCreateInvite = vi.fn()
vi.mock('../services/invites', async importOriginal => {
    const actual = await importOriginal<typeof import('../services/invites')>()
    return { ...actual, createInvite: mockCreateInvite }
})
vi.mock('./ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('../errorReporting', () => ({ reportError: vi.fn() }))

const { CreateInviteLink } = await import('./CreateInviteLink')
const { InviteAccessError } = await import('../services/invites')

const POD = 'https://alice.example.org/'
const session = { info: { isLoggedIn: true, webId: 'https://alice.example.org/profile/card#me' }, fetch: vi.fn() } as unknown as AppSession

const created: StoredInvite = {
    token: 'tok-aaaaaaaaaaaaaaaaaaaa',
    kind: 'full-setup',
    createdAt: '2026-01-01T00:00:00.000Z',
    acceptedBy: [],
    url: `${POD}pack-me-up/invites/tok-aaaaaaaaaaaaaaaaaaaa`,
}

beforeEach(() => {
    vi.clearAllMocks()
    mockCreateInvite.mockResolvedValue(created)
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
    })
})

const renderIt = (props = {}) => render(
    <CreateInviteLink session={session} podUrl={POD} kind="full-setup" subject="my setup" {...props} />,
)

describe('CreateInviteLink', () => {
    // It is the main way to share now, not the alternative to an address, so
    // it no longer needs a sentence explaining itself.
    it('is a button and nothing more until used', () => {
        const { container } = renderIt()

        expect(screen.getByRole('button', { name: /create invite link/i })).toBeTruthy()
        expect(container.querySelector('p')).toBeNull()
    })

    it('creates an invite of the kind it was given', async () => {
        renderIt({ kind: 'list', listId: 'l1', label: 'Ski trip' })

        fireEvent.click(screen.getByRole('button', { name: /create invite link/i }))

        await waitFor(() => expect(mockCreateInvite).toHaveBeenCalledWith(
            session, POD, { kind: 'list', listId: 'l1', label: 'Ski trip' },
        ))
    })

    it('shows the link, and says what happens next', async () => {
        renderIt()

        fireEvent.click(screen.getByRole('button', { name: /create invite link/i }))

        const field = await screen.findByRole('textbox', { name: /invite link/i })
        expect((field as HTMLInputElement).value).toContain(`/#/invite/${created.token}`)
        // The delay is stated up front rather than discovered later.
        expect(screen.getByText(/next time you open Pack Me Up/i)).toBeTruthy()
    })

    it('builds the link on the app’s public origin, not the device’s', async () => {
        // In the native shell `window.location.origin` is `https://localhost`,
        // and an invite link is by definition opened on somebody else's device
        // (#357). The guard over the builders themselves is in
        // `services/shareLinks.test.ts`; this is the call site.
        const originalLocation = window.location
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, origin: 'https://localhost' },
        })
        try {
            renderIt()

            fireEvent.click(screen.getByRole('button', { name: /create invite link/i }))

            const field = await screen.findByRole('textbox', { name: /invite link/i })
            const link = (field as HTMLInputElement).value
            expect(link).not.toContain('localhost')
            expect(link.startsWith(`${PUBLIC_APP_ORIGIN}/#/invite/`)).toBe(true)
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
        }
    })

    it('tells them the other way still works when the Pod refuses', async () => {
        mockCreateInvite.mockRejectedValue(new InviteAccessError(
            "This Pod won't let the app set access control on an invite, so invite links aren't available here. Sharing by address still works.",
        ))
        renderIt()

        fireEvent.click(screen.getByRole('button', { name: /create invite link/i }))

        expect(await screen.findByText(/sharing by address still works/i)).toBeTruthy()
    })

    it('lets them try again after a failure', async () => {
        mockCreateInvite.mockRejectedValueOnce(new Error('network'))
        renderIt()

        fireEvent.click(screen.getByRole('button', { name: /create invite link/i }))
        await screen.findByText(/network/i)

        fireEvent.click(screen.getByRole('button', { name: /create invite link/i }))

        await waitFor(() => expect(screen.queryByRole('textbox', { name: /invite link/i })).toBeTruthy())
    })

    it('tells the caller what it made, so a pending list can update', async () => {
        const onCreated = vi.fn()
        renderIt({ onCreated })

        fireEvent.click(screen.getByRole('button', { name: /create invite link/i }))

        await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
    })
})
