import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Navigation } from './Navigation'
import { ThemeProvider } from './ThemeContext'

vi.mock('./SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('./SolidProviderSelector', () => ({
    SolidProviderSelector: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="provider-selector" /> : null,
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
import { useDatabase } from './DatabaseContext'
import { getSolidProfile } from '../services/solidPod'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetSolidProfile = vi.mocked(getSolidProfile)

const WEB_ID = 'https://user.solidpod.example/profile/card#me'

function signedIn() {
    mockUseSolidPod.mockReturnValue({
        session: null,
        isLoggedIn: true,
        isReconnecting: false,
        sessionExpired: false,
        clearSessionExpired: vi.fn(),
        webId: WEB_ID,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
    })
}

/** Signed in, but the Pod is out of reach — a phone that started with no signal. */
function reconnecting() {
    mockUseSolidPod.mockReturnValue({
        session: null,
        isLoggedIn: false,
        isReconnecting: true,
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
            <ThemeProvider>
                <Navigation />
            </ThemeProvider>
        </MemoryRouter>
    )
}

/** The top row — what "the nav bar" means, as opposed to the mobile menu below it. */
const navBar = () => screen.getByTestId('nav-bar')

/**
 * The bar renders both layouts and lets CSS pick one, so a query across the
 * whole row now finds the desktop and mobile copies of the same thing. These
 * two say which layout an assertion is about.
 */
const desktopBar = () => screen.getByTestId('nav-bar-desktop')
const mobileBar = () => screen.getByTestId('nav-bar-mobile')

const openAccountMenu = () => fireEvent.click(within(desktopBar()).getByRole('button', { name: /account menu/i }))

describe('Navigation', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            isReconnecting: false,
            sessionExpired: false,
            clearSessionExpired: vi.fn(),
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('hides Backups link when not logged in', () => {
        renderNav()

        expect(screen.queryByText('Backups')).toBeNull()
    })

    it('keeps the Sharing link reachable when logged out so sharing is discoverable', () => {
        renderNav()

        // Desktop and mobile menus each render one
        expect(screen.getAllByText('Sharing').length).toBeGreaterThan(0)
    })

    it('shows "My Questions & Items" nav link instead of "Edit Questions"', () => {
        renderNav()

        expect(screen.getAllByText('My Questions & Items').length).toBeGreaterThan(0)
        expect(screen.queryByText('Edit Questions')).toBeNull()
    })

    // Feedback, the privacy policy and data deletion live in the Footer now —
    // they're once-in-a-while links, and the nav is for everyday ones. See
    // Footer.test.tsx for their coverage.
    it('keeps once-in-a-while links out of the nav', () => {
        renderNav()

        expect(screen.queryByRole('link', { name: /feedback/i })).toBeNull()
        expect(screen.queryByRole('link', { name: /privacy/i })).toBeNull()
        expect(screen.queryByRole('link', { name: /delete my data/i })).toBeNull()
    })

    // In a normal browser tab the browser's own chrome sits above the page, but
    // Chrome on Android still reports a non-zero safe-area-inset-top, which left
    // a tall empty band above the logo. The inset is applied through a class so
    // CSS can limit it to the cases that actually draw under the status bar.
    it('leaves the status-bar inset to CSS rather than an inline style', () => {
        const { container } = renderNav()

        const nav = container.querySelector('nav')!
        expect(nav.style.paddingTop).toBe('')
        expect(nav.className).toContain('safe-area-top')
    })

    it('uses a shorter header row on mobile than on desktop', () => {
        const { container } = renderNav()

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

        await waitFor(() => expect(within(desktopBar()).getByText('Alice Adams')).toBeTruthy())
        expect(within(desktopBar()).getByTestId('profile-photo').getAttribute('src'))
            .toBe('https://user.solidpod.example/me.png')
    })

    it('falls back to the pod username and a generic icon when the card names neither', async () => {
        renderNav()

        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalled())
        expect(within(desktopBar()).getAllByText('user').length).toBeGreaterThan(0)
        expect(within(desktopBar()).getByTestId('profile-icon')).toBeTruthy()
    })

    it('keeps the WebID reachable inside the account menu', () => {
        renderNav()

        openAccountMenu()

        expect(within(desktopBar()).getByText(WEB_ID)).toBeTruthy()
        expect(within(desktopBar()).getByRole('button', { name: 'Logout' })).toBeTruthy()
        expect(within(desktopBar()).getByRole('link', { name: 'Backups' })).toBeTruthy()
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
            isReconnecting: false,
            sessionExpired: false,
            clearSessionExpired: vi.fn(),
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('labels the auth control with the benefit in both desktop nav and mobile menu', () => {
        renderNav()

        expect(screen.getAllByRole('button', { name: 'Sync & Share' })).toHaveLength(2)
    })

    it('does not lead with "Solid Pod" on the auth control', () => {
        renderNav()

        expect(screen.queryByRole('button', { name: /solid pod/i })).toBeNull()
    })

    it('notes the payoff alongside the auth control', () => {
        renderNav()

        expect(screen.getAllByText(/sync across devices/i).length).toBeGreaterThanOrEqual(2)
    })
})

/**
 * Offline is not signed out (#342). A phone that starts with no signal cannot
 * make its session live, and the nav used to answer that by offering to sign the
 * user in — the single loudest "you are logged out" signal in the app, shown to
 * someone who never left.
 */
describe('Navigation – signed in but offline', () => {
    beforeEach(() => {
        reconnecting()
    })

    it('keeps showing the account rather than offering to sign in', async () => {
        renderNav()

        expect(within(navBar()).queryByRole('button', { name: 'Sync & Share' })).toBeNull()
        expect(await within(desktopBar()).findByRole('button', { name: /account menu/i })).toBeTruthy()
    })

    it('says the Pod is out of reach rather than leaving it unexplained', () => {
        renderNav()

        expect(within(desktopBar()).getByText(/offline/i)).toBeTruthy()
    })

    it('keeps the mobile menu signed in too, with a way out', () => {
        renderNav()

        const mobile = screen.getByTestId('mobile-menu')
        expect(within(mobile).queryByRole('button', { name: 'Sync & Share' })).toBeNull()
        expect(within(mobile).getByText(/offline/i)).toBeTruthy()
        expect(within(mobile).getByRole('button', { name: 'Logout' })).toBeTruthy()
    })
})

/**
 * #337. The theme control held a permanent slot in both bars — on mobile, one of
 * only two — while sign-in was a tap deep inside the hamburger. The control now
 * lives on /settings and the slot went to the thing a user actually came for.
 */
describe('Navigation – theme control and the mobile top bar', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            isReconnecting: false,
            sessionExpired: false,
            clearSessionExpired: vi.fn(),
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('has no theme control anywhere in the nav', () => {
        renderNav()

        expect(screen.queryByRole('button', { name: /switch to (dark|light) mode/i })).toBeNull()
        expect(screen.queryByText(/^(dark|light) mode$/i)).toBeNull()
    })

    it('points at the settings page from the mobile menu instead', () => {
        renderNav()

        const mobile = screen.getByTestId('mobile-menu')
        expect(within(mobile).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
    })

    it('offers sign-in from the mobile bar itself, not only inside the hamburger', () => {
        renderNav()

        expect(within(mobileBar()).getByRole('button', { name: 'Sign in' })).toBeTruthy()
    })

    it('starts sign-in straight from that button', () => {
        renderNav()

        expect(screen.queryByTestId('provider-selector')).toBeNull()

        fireEvent.click(within(mobileBar()).getByRole('button', { name: 'Sign in' }))

        expect(screen.getByTestId('provider-selector')).toBeTruthy()
    })

    it('shows the profile in the mobile bar once signed in, and no sign-in prompt', async () => {
        signedIn()
        renderNav()

        expect(await within(mobileBar()).findByRole('button', { name: /your profile/i })).toBeTruthy()
        expect(within(mobileBar()).queryByRole('button', { name: 'Sign in' })).toBeNull()
    })

    // Offline is not signed out (#342): the bar must not fall back to a
    // sign-in prompt just because the pod is out of reach.
    it('keeps the profile in the mobile bar while reconnecting', async () => {
        reconnecting()
        renderNav()

        expect(await within(mobileBar()).findByRole('button', { name: /your profile/i })).toBeTruthy()
        expect(within(mobileBar()).queryByRole('button', { name: 'Sign in' })).toBeNull()
    })

    it('opens the account section from that profile control', async () => {
        signedIn()
        renderNav()
        // The profile read resolves into state; let it land before clicking.
        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalled())

        fireEvent.click(within(mobileBar()).getByRole('button', { name: /your profile/i }))

        expect(screen.getByTestId('mobile-menu').className).toContain('block')
    })
})

// ── Whose data you are viewing ───────────────────────────────────────────────

// It lived in the header as a select, which crowded the nav links at mid widths
// and so was hidden below lg — leaving phones and narrow windows without it.
// In the account menu it is there at every width.
describe('Navigation — viewing a setup shared with me', () => {
    const INRUPT_POD = 'https://storage.inrupt.com/d8c8c02b-b47c-48e9-b737-619f2958689f/'
    const ALICE_POD = 'https://alice.example.org/'

    function withShared(contexts: { podUrl: string; webId?: string; label?: string; addedAt: string }[]) {
        vi.mocked(useDatabase).mockReturnValue({
            db: { getSharedWithMe: vi.fn().mockResolvedValue({ contexts, lastModified: '' }) },
            loginSyncVersion: 0,
            loginSyncInProgress: false,
        } as unknown as ReturnType<typeof useDatabase>)
    }

    function renderAt(path: string) {
        return render(
            <MemoryRouter initialEntries={[path]}>
                <ThemeProvider>
                    <Navigation />
                    <Routes>
                        <Route path="*" element={<LocationProbe />} />
                    </Routes>
                </ThemeProvider>
            </MemoryRouter>
        )
    }

    function LocationProbe() {
        const location = useLocation()
        return <div data-testid="location">{location.pathname}</div>
    }

    const viewing = (root: HTMLElement) => within(within(root).getByRole('group', { name: /viewing/i }))

    // Opened once the shared list has loaded; opening inside a waitFor would
    // toggle it shut again on every retry.
    async function openWithViewing(reads = 1) {
        await waitFor(() => expect(vi.mocked(useDatabase)().db.getSharedWithMe).toHaveBeenCalledTimes(reads))
        await act(async () => {})
        openAccountMenu()
    }

    beforeEach(() => signedIn())

    it('is no longer a select in the header', async () => {
        withShared([{ podUrl: ALICE_POD, label: 'Alice Smith', addedAt: '' }])
        renderNav()

        await waitFor(() => expect(vi.mocked(useDatabase)().db.getSharedWithMe).toHaveBeenCalled())
        expect(screen.queryByRole('combobox')).toBeNull()
    })

    it('lists your data and each shared setup in the account menu, by name', async () => {
        withShared([
            { podUrl: ALICE_POD, label: 'Alice Smith', addedAt: '' },
            // An Inrupt Pod's address is a UUID on a storage host: named for the person.
            { podUrl: INRUPT_POD, webId: 'https://id.inrupt.com/timgent', addedAt: '' },
        ])
        renderAt('/view-lists')

        await openWithViewing()
        const group = viewing(desktopBar())
        expect(group.getByRole('button', { name: /your data/i })).toBeTruthy()
        expect(group.getByRole('button', { name: /Alice Smith/ })).toBeTruthy()
        expect(group.getByRole('button', { name: /timgent on id\.inrupt\.com/ })).toBeTruthy()
        expect(group.queryByText(INRUPT_POD)).toBeNull()
    })

    it('marks the one on screen', async () => {
        withShared([{ podUrl: ALICE_POD, label: 'Alice Smith', addedAt: '' }])
        renderAt(`/pod/${encodeURIComponent(ALICE_POD)}/view-lists`)

        await openWithViewing()
        const group = viewing(desktopBar())
        expect(group.getByRole('button', { name: /Alice Smith/ }).getAttribute('aria-current')).toBe('true')
        expect(group.getByRole('button', { name: /your data/i }).getAttribute('aria-current')).toBeNull()
    })

    it('switches to a shared setup, and back to your own', async () => {
        withShared([{ podUrl: ALICE_POD, label: 'Alice Smith', addedAt: '' }])
        renderAt('/view-lists')

        await openWithViewing()
        fireEvent.click(viewing(desktopBar()).getByRole('button', { name: /Alice Smith/ }))
        expect(screen.getByTestId('location').textContent).toBe(`/pod/${encodeURIComponent(ALICE_POD)}/view-lists`)

        openAccountMenu()
        fireEvent.click(viewing(desktopBar()).getByRole('button', { name: /your data/i }))
        expect(screen.getByTestId('location').textContent).toBe('/view-lists')
    })

    it('has nothing to offer when nothing is shared with you', async () => {
        withShared([])
        renderNav()

        openAccountMenu()
        await waitFor(() => expect(vi.mocked(useDatabase)().db.getSharedWithMe).toHaveBeenCalled())
        expect(screen.queryByRole('group', { name: /viewing/i })).toBeNull()
    })

    // A household is one to three; a menu that grows without end is not a menu.
    it('lists five and points to the Sharing page for the rest', async () => {
        withShared(Array.from({ length: 7 }, (_, i) => ({ podUrl: `https://p${i}.example.org/`, label: `Person ${i}`, addedAt: '' })))
        renderAt('/view-lists')

        await openWithViewing()
        const group = viewing(desktopBar())
        expect(group.getAllByRole('button', { name: /Person/ })).toHaveLength(5)
        expect(group.getByRole('link', { name: /all shared with me/i }).getAttribute('href')).toBe('/sharing')
    })

    it('offers the same on a phone, in the mobile menu', async () => {
        withShared([{ podUrl: ALICE_POD, label: 'Alice Smith', addedAt: '' }])
        renderAt('/view-lists')

        await waitFor(() => expect(vi.mocked(useDatabase)().db.getSharedWithMe).toHaveBeenCalled())
        await act(async () => {})
        fireEvent.click(screen.getByRole('button', { name: /open main menu/i }))

        const mobile = screen.getByTestId('mobile-menu')
        expect(viewing(mobile).getByRole('button', { name: /Alice Smith/ })).toBeTruthy()
    })

    // Opening a shared setup records it; the menu should know without a
    // fresh sign-in, which is all that used to re-read it.
    it('picks up a setup recorded since sign-in when the page changes', async () => {
        const getSharedWithMe = vi.fn().mockResolvedValue({ contexts: [], lastModified: '' })
        vi.mocked(useDatabase).mockReturnValue({ db: { getSharedWithMe }, loginSyncVersion: 0, loginSyncInProgress: false } as unknown as ReturnType<typeof useDatabase>)
        renderAt('/view-lists')
        await waitFor(() => expect(getSharedWithMe).toHaveBeenCalledTimes(1))

        getSharedWithMe.mockResolvedValue({ contexts: [{ podUrl: ALICE_POD, label: 'Alice Smith', addedAt: '' }], lastModified: '' })
        fireEvent.click(screen.getAllByRole('link', { name: 'Sharing' })[0])

        await openWithViewing(2)
        expect(viewing(desktopBar()).getByRole('button', { name: /Alice Smith/ })).toBeTruthy()
    })
})
