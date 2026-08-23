import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Navigation } from './Navigation'

vi.mock('./SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('./SolidProviderSelector', () => ({
    SolidProviderSelector: () => null,
}))

// Only the profile read is faked: podUsernameFromWebId is the real one, so the
// fallback these tests assert on is the fallback the nav actually ships.
vi.mock('../services/solidPod', async importOriginal => ({
    ...(await importOriginal<typeof import('../services/solidPod')>()),
    getSolidProfile: vi.fn().mockResolvedValue({ name: null, photo: null }),
}))

vi.mock('./DatabaseContext', () => ({
    useDatabase: vi.fn().mockReturnValue({
        db: { getSharedWithMe: vi.fn().mockResolvedValue({ contexts: [], lastModified: '' }) },
        loginSyncVersion: 0,
        loginSyncInProgress: false,
    }),
}))

import { useSolidPod } from './SolidPodContext'
import { getSolidProfile } from '../services/solidPod'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetSolidProfile = vi.mocked(getSolidProfile)

const WEB_ID = 'https://user.solidpod.example/profile/card#me'

function signedIn() {
    mockUseSolidPod.mockReturnValue({
        session: null,
        isLoggedIn: true,
        sessionExpired: false,
        clearSessionExpired: vi.fn(),
        webId: WEB_ID,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
    })
}

function renderNav() {
    return render(
        <MemoryRouter>
            <Navigation />
        </MemoryRouter>
    )
}

/** The top row — what "the nav bar" means, as opposed to the mobile menu below it. */
const navBar = () => screen.getByTestId('nav-bar')

const openAccountMenu = () => fireEvent.click(within(navBar()).getByRole('button', { name: /account menu/i }))

describe('Navigation', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            sessionExpired: false,
            clearSessionExpired: vi.fn(),
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('hides Backups link when not logged in', () => {
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.queryByText('Backups')).toBeNull()
    })

    it('keeps the Sharing link reachable when logged out so sharing is discoverable', () => {
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        // Desktop and mobile menus each render one
        expect(screen.getAllByText('Sharing').length).toBeGreaterThan(0)
    })

    it('shows "My Questions & Items" nav link instead of "Edit Questions"', () => {
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.getAllByText('My Questions & Items').length).toBeGreaterThan(0)
        expect(screen.queryByText('Edit Questions')).toBeNull()
    })

    // Feedback, the privacy policy and data deletion live in the Footer now —
    // they're once-in-a-while links, and the nav is for everyday ones. See
    // Footer.test.tsx for their coverage.
    it('keeps once-in-a-while links out of the nav', () => {
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.queryByRole('link', { name: /feedback/i })).toBeNull()
        expect(screen.queryByRole('link', { name: /privacy/i })).toBeNull()
        expect(screen.queryByRole('link', { name: /delete my data/i })).toBeNull()
    })

    // In a normal browser tab the browser's own chrome sits above the page, but
    // Chrome on Android still reports a non-zero safe-area-inset-top, which left
    // a tall empty band above the logo. The inset is applied through a class so
    // CSS can limit it to the cases that actually draw under the status bar.
    it('leaves the status-bar inset to CSS rather than an inline style', () => {
        const { container } = render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        const nav = container.querySelector('nav')!
        expect(nav.style.paddingTop).toBe('')
        expect(nav.className).toContain('safe-area-top')
    })

    it('uses a shorter header row on mobile than on desktop', () => {
        const { container } = render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        const row = container.querySelector('nav .flex.items-center.justify-between')!
        expect(row.className).toContain('h-14')
        expect(row.className).toContain('md:h-16')
    })

    it('shows Backups link when logged in', () => {
        signedIn()

        renderNav()
        openAccountMenu()

        expect(screen.getAllByText('Backups').length).toBeGreaterThan(0)
    })

    // Creating a list starts from Lists now — "New List" is the button on that
    // page, in your own pod and in someone else's. See #302.
    it('keeps Create List out of the nav', () => {
        renderNav()

        expect(screen.queryByRole('link', { name: /create list/i })).toBeNull()
    })

    it('calls the lists destination "Lists"', () => {
        renderNav()

        expect(within(navBar()).getByRole('link', { name: 'Lists' })).toBeTruthy()
        expect(screen.queryByText('View Lists')).toBeNull()
    })

    // #204 promoted sharing deliberately; it does not get demoted into the
    // account menu a release later.
    it('keeps Sharing in the nav bar rather than the account menu', () => {
        signedIn()

        renderNav()

        expect(within(navBar()).getByRole('link', { name: 'Sharing' })).toBeTruthy()
    })
})

describe('Navigation – signed-in account menu', () => {
    beforeEach(() => {
        mockGetSolidProfile.mockResolvedValue({ name: null, photo: null })
        signedIn()
    })

    it('does not print the raw WebID in the nav bar', async () => {
        renderNav()

        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalled())
        expect(within(navBar()).queryByText(WEB_ID)).toBeNull()
    })

    it('names the signed-in user from their profile card', async () => {
        mockGetSolidProfile.mockResolvedValue({ name: 'Alice Adams', photo: 'https://user.solidpod.example/me.png' })

        renderNav()

        await waitFor(() => expect(within(navBar()).getByText('Alice Adams')).toBeTruthy())
        expect(within(navBar()).getByTestId('profile-photo').getAttribute('src'))
            .toBe('https://user.solidpod.example/me.png')
    })

    it('falls back to the pod username and a generic icon when the card names neither', async () => {
        renderNav()

        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalled())
        expect(within(navBar()).getAllByText('user').length).toBeGreaterThan(0)
        expect(within(navBar()).getByTestId('profile-icon')).toBeTruthy()
    })

    it('keeps the WebID reachable inside the account menu', () => {
        renderNav()

        openAccountMenu()

        expect(within(navBar()).getByText(WEB_ID)).toBeTruthy()
        expect(within(navBar()).getByRole('button', { name: 'Logout' })).toBeTruthy()
        expect(within(navBar()).getByRole('link', { name: 'Backups' })).toBeTruthy()
    })

    it('reads the profile through the shared cached path', async () => {
        renderNav()

        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalledWith(null, WEB_ID))
    })

    it('gives the mobile menu the same affordances without a dropdown', () => {
        renderNav()

        const mobile = screen.getByTestId('mobile-menu')
        expect(within(mobile).getByText(WEB_ID)).toBeTruthy()
        expect(within(mobile).getByRole('link', { name: 'Backups' })).toBeTruthy()
        expect(within(mobile).getByRole('button', { name: 'Logout' })).toBeTruthy()
        expect(within(mobile).queryByRole('button', { name: /account menu/i })).toBeNull()
    })
})

describe('Navigation – signed-out auth control', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            sessionExpired: false,
            clearSessionExpired: vi.fn(),
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('labels the auth control with the benefit in both desktop nav and mobile menu', () => {
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.getAllByRole('button', { name: 'Sync & Share' })).toHaveLength(2)
    })

    it('does not lead with "Solid Pod" on the auth control', () => {
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.queryByRole('button', { name: /solid pod/i })).toBeNull()
    })

    it('notes the payoff alongside the auth control', () => {
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.getAllByText(/sync across devices/i).length).toBeGreaterThanOrEqual(2)
    })
})
