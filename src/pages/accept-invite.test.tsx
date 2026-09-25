import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockAcceptInvite = vi.fn()
vi.mock('../services/invites', async importOriginal => {
    const actual = await importOriginal<typeof import('../services/invites')>()
    return { ...actual, acceptInvite: mockAcceptInvite }
})

const mockProfile = vi.fn()
vi.mock('../hooks/useSolidProfile', () => ({ useSolidProfile: () => mockProfile() }))

const mockSolidPod = vi.fn()
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: () => mockSolidPod() }))
vi.mock('../errorReporting', () => ({ reportError: vi.fn() }))

const mockSharedWithMe = vi.fn()
const mockSaveSharedWithMe = vi.fn()
vi.mock('../hooks/useSharedWithMeSync', () => ({
    useSharedWithMeSync: () => ({ sharedWithMe: mockSharedWithMe(), saveSharedWithMe: mockSaveSharedWithMe }),
}))
const mockSharedListsWithMe = vi.fn()
const mockSaveSharedListsWithMe = vi.fn()
vi.mock('../hooks/useSharedListsSync', () => ({
    useSharedListsSync: () => ({ sharedListsWithMe: mockSharedListsWithMe(), saveSharedListsWithMe: mockSaveSharedListsWithMe }),
}))

const { AcceptInvitePage } = await import('./accept-invite')

const TOKEN = 'tok-aaaaaaaaaaaaaaaaaaaa'
const POD = 'https://alice.example.org/'
const OWNER = 'https://alice.example.org/profile/card#me'
const BOB = 'https://bob.example.org/profile/card#me'

function renderPage({ token = TOKEN, params = '', signedIn = true } = {}) {
    mockSolidPod.mockReturnValue({
        session: signedIn ? { info: { isLoggedIn: true, webId: BOB }, fetch: vi.fn() } : null,
        isLoggedIn: signedIn,
        login: vi.fn(),
    })
    const search = params || `?pod=${encodeURIComponent(POD)}&owner=${encodeURIComponent(OWNER)}&kind=full-setup`
    return render(
        <MemoryRouter initialEntries={[`/invite/${token}${search}`]}>
            <Routes>
                <Route path="/invite/:token" element={<AcceptInvitePage />} />
            </Routes>
        </MemoryRouter>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    mockAcceptInvite.mockResolvedValue(undefined)
    mockSharedWithMe.mockReturnValue({ contexts: [], lastModified: '2026-01-01T00:00:00.000Z' })
    mockSharedListsWithMe.mockReturnValue({ lists: [], lastModified: '2026-01-01T00:00:00.000Z' })
    mockSaveSharedWithMe.mockImplementation(async data => data)
    mockSaveSharedListsWithMe.mockImplementation(async data => data)
    mockProfile.mockReturnValue({ name: 'Alice Smith', photo: null, resolved: true })
})

describe('AcceptInvitePage', () => {
    it('names the sender from their own profile card, not from the link', () => {
        renderPage()

        // The link is attacker-writable; the profile card is not.
        expect(screen.getByRole('heading', { name: /Alice Smith wants to share/i })).toBeTruthy()
    })

    it('falls back to a name drawn from their address when their card has none', () => {
        mockProfile.mockReturnValue({ name: null, photo: null, resolved: false })

        renderPage()

        expect(screen.getByRole('heading', { name: /wants to share/i }).textContent).toMatch(/alice/i)
    })

    it('says a whole setup is a whole setup', () => {
        renderPage()

        expect(screen.getByRole('heading', { name: /questions and all their packing lists/i })).toBeTruthy()
    })

    it('names the list when the invite is for one', () => {
        renderPage({
            params: `?pod=${encodeURIComponent(POD)}&owner=${encodeURIComponent(OWNER)}&kind=list&label=${encodeURIComponent('Ski trip')}`,
        })

        expect(screen.getByRole('heading', { name: /Ski trip/ })).toBeTruthy()
    })

    it('accepts with the signed-in address', async () => {
        renderPage()

        fireEvent.click(screen.getByRole('button', { name: /accept invite/i }))

        await waitFor(() => expect(mockAcceptInvite).toHaveBeenCalledWith(
            expect.anything(),
            `${POD}pack-me-up/invites/${TOKEN}`,
            BOB,
        ))
    })

    it('shows which address it is accepting as, so a wrong account is visible', () => {
        renderPage()

        expect(screen.getByText(BOB)).toBeTruthy()
    })

    it('is honest that nothing happens until the sender opens the app', async () => {
        renderPage()

        fireEvent.click(screen.getByRole('button', { name: /accept invite/i }))

        // The one real cost of the design. Hiding it behind a spinner would
        // leave people waiting on a screen that implies otherwise.
        expect(await screen.findByRole('heading', { name: /accepted/i })).toBeTruthy()
        expect(screen.getByText(/next time they open Pack Me Up/i)).toBeTruthy()
    })

    it('shows why accepting failed, in the words the service chose', async () => {
        mockAcceptInvite.mockRejectedValue(new Error('This invite link no longer exists. Ask them to send you a new one.'))
        renderPage()

        fireEvent.click(screen.getByRole('button', { name: /accept invite/i }))

        expect(await screen.findByText(/no longer exists/i)).toBeTruthy()
        // Still on the accept screen, not the success one.
        expect(screen.queryByRole('heading', { name: /^accepted$/i })).toBeNull()
    })

    // Accepting only writes to the sender's Pod. Without a record on this
    // side, the invitee's Sharing page had nothing to show for it — before
    // access arrived or after.
    describe('keeping a record on the invitee\'s side', () => {
        it('records an accepted setup as shared with me', async () => {
            renderPage()

            fireEvent.click(screen.getByRole('button', { name: /accept invite/i }))

            await waitFor(() => expect(mockSaveSharedWithMe).toHaveBeenCalledWith({
                contexts: [expect.objectContaining({ podUrl: POD, webId: OWNER, label: 'Alice Smith' })],
                lastModified: expect.any(String),
            }))
            expect(mockSaveSharedListsWithMe).not.toHaveBeenCalled()
        })

        it('records an accepted list as a list shared with me', async () => {
            renderPage({
                params: `?pod=${encodeURIComponent(POD)}&owner=${encodeURIComponent(OWNER)}&kind=list&list=list-123&label=${encodeURIComponent('Ski trip')}`,
            })

            fireEvent.click(screen.getByRole('button', { name: /accept invite/i }))

            await waitFor(() => expect(mockSaveSharedListsWithMe).toHaveBeenCalledWith({
                lists: [expect.objectContaining({ listId: 'list-123', podUrl: POD, ownerWebId: OWNER, label: 'Ski trip' })],
                lastModified: expect.any(String),
            }))
            expect(mockSaveSharedWithMe).not.toHaveBeenCalled()
        })

        it('does not follow a list id that is not shaped like one', async () => {
            renderPage({
                params: `?pod=${encodeURIComponent(POD)}&owner=${encodeURIComponent(OWNER)}&kind=list&list=${encodeURIComponent('../../private')}`,
            })

            fireEvent.click(screen.getByRole('button', { name: /accept invite/i }))

            expect(await screen.findByRole('heading', { name: /accepted/i })).toBeTruthy()
            expect(mockSaveSharedListsWithMe).not.toHaveBeenCalled()
        })

        it('records nothing when accepting failed', async () => {
            mockAcceptInvite.mockRejectedValue(new Error('This invite link no longer exists.'))
            renderPage()

            fireEvent.click(screen.getByRole('button', { name: /accept invite/i }))

            await screen.findByText(/no longer exists/i)
            expect(mockSaveSharedWithMe).not.toHaveBeenCalled()
        })

        // The acceptance is on their Pod whatever happens here, so saying it
        // failed would be untrue — and accepting again would fail for real.
        it('still reports accepted when the record could not be saved', async () => {
            mockSaveSharedWithMe.mockRejectedValue(new Error('offline'))
            renderPage()

            fireEvent.click(screen.getByRole('button', { name: /accept invite/i }))

            expect(await screen.findByRole('heading', { name: /accepted/i })).toBeTruthy()
        })

        // Saving over a record that has not loaded yet would replace every
        // other share with this one.
        it('waits for the existing record before letting them accept', () => {
            mockSharedWithMe.mockReturnValue(null)
            renderPage()

            expect((screen.getByRole('button', { name: /accept invite|loading/i }) as HTMLButtonElement).disabled).toBe(true)
        })

        it('points them at where it will appear', async () => {
            renderPage()

            fireEvent.click(screen.getByRole('button', { name: /accept invite/i }))

            const link = await screen.findByRole('link', { name: /sharing/i })
            expect(link.getAttribute('href')).toBe('/sharing')
        })
    })

    it('offers sign-in rather than an accept button when signed out', () => {
        renderPage({ signedIn: false })

        expect(screen.getByRole('button', { name: /sign in to accept/i })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /accept invite/i })).toBeNull()
    })

    it('says so when the link arrived broken', () => {
        // Chat apps wrap long URLs, and a truncated token is the result.
        renderPage({ token: 'short' })

        expect(screen.getByRole('heading', { name: /doesn't look right/i })).toBeTruthy()
    })

    it('says so when the link is missing where to send the reply', () => {
        renderPage({ params: `?owner=${encodeURIComponent(OWNER)}&kind=full-setup` })

        expect(screen.getByRole('heading', { name: /doesn't look right/i })).toBeTruthy()
    })
})
