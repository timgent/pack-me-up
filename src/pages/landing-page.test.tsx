import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from './landing-page'

vi.mock('../hooks/useHasQuestions', () => ({
    useHasQuestions: vi.fn(),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('../services/solidPod', async importOriginal => ({
    ...(await importOriginal<typeof import('../services/solidPod')>()),
    getSolidProfile: vi.fn().mockResolvedValue({ name: null, photo: null }),
}))

import { useHasQuestions } from '../hooks/useHasQuestions'
import { useSolidPod } from '../components/SolidPodContext'
import { getSolidProfile } from '../services/solidPod'

const mockUseHasQuestions = vi.mocked(useHasQuestions)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetSolidProfile = vi.mocked(getSolidProfile)

describe('LandingPage', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('shows "Get Started with the Wizard" as primary CTA when no questions exist', () => {
        mockUseHasQuestions.mockReturnValue(false)

        render(
            <MemoryRouter>
                <LandingPage />
            </MemoryRouter>
        )

        expect(screen.getByRole('link', { name: /get started with the wizard/i })).toBeTruthy()
        expect(screen.queryByRole('link', { name: /view packing lists/i })).toBeNull()
    })

    it('shows "View Packing Lists" as primary CTA when questions exist', () => {
        mockUseHasQuestions.mockReturnValue(true)

        render(
            <MemoryRouter>
                <LandingPage />
            </MemoryRouter>
        )

        expect(screen.getByRole('link', { name: /view packing lists/i })).toBeTruthy()
        expect(screen.queryByRole('link', { name: /get started with the wizard/i })).toBeNull()
    })

    it('does not show secondary action links when questions exist', () => {
        mockUseHasQuestions.mockReturnValue(true)

        render(
            <MemoryRouter>
                <LandingPage />
            </MemoryRouter>
        )

        expect(screen.queryByRole('link', { name: /reconfigure your questions/i })).toBeNull()
        expect(screen.queryByRole('link', { name: /create a new packing list/i })).toBeNull()
    })

    it('leads with the travel and sharing benefit in the h1', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        const heading = screen.getByRole('heading', { level: 1 })
        expect(heading.textContent).toMatch(/packing lists that learn how you travel/i)
    })

    it('does not mention Solid Pod or data ownership above the fold', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        const heading = screen.getByRole('heading', { level: 1 })
        const hero = heading.parentElement as HTMLElement
        expect(hero.textContent).not.toMatch(/solid pod/i)
        expect(hero.textContent).not.toMatch(/own your data/i)
    })

    it('supports the h1 with a sharing-focused subheadline', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        expect(screen.getByText(/share one list with your partner or the whole family/i)).toBeTruthy()
    })

    it('renders the primary CTA before the "How it works" section so it is above the fold', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        const cta = screen.getByRole('link', { name: /get started with the wizard/i })
        const howItWorks = screen.getByRole('heading', { name: /how it works/i })
        expect(
            cta.compareDocumentPosition(howItWorks) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })

    it('renders the "View Packing Lists" CTA before the "How it works" section too', () => {
        mockUseHasQuestions.mockReturnValue(true)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        const cta = screen.getByRole('link', { name: /view packing lists/i })
        const howItWorks = screen.getByRole('heading', { name: /how it works/i })
        expect(
            cta.compareDocumentPosition(howItWorks) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })

    it('frames the data-ownership section as a benefit rather than a mechanism', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        const trustSection = screen.getByRole('heading', { name: /own your data/i })
            .closest('div') as HTMLElement
        expect(trustSection.textContent).toMatch(/your lists live in storage you control/i)
    })

    it('renders the Solid Pod section after the CTA in the DOM', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        const cta = screen.getByRole('link', { name: /get started with the wizard/i })
        const solidPodHeading = screen.getByRole('heading', { name: /own your data/i })
        expect(
            cta.compareDocumentPosition(solidPodHeading) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })

    it('does not render the Solid Pod section as a dark full-width card', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        const solidPodHeading = screen.getByRole('heading', { name: /own your data/i })
        expect(solidPodHeading.closest('[class*="bg-primary-950"]')).toBeNull()
    })

    it('shows a "Get a free Solid Pod" button on the page when not logged in', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        expect(screen.getByRole('button', { name: /get a free solid pod/i })).toBeTruthy()
    })

    it('opens the provider selector modal when the login button is clicked', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        const loginButton = screen.getByRole('button', { name: /get a free solid pod/i })
        fireEvent.click(loginButton)
        expect(screen.getByRole('dialog')).toBeTruthy()
    })
})

// The nav stopped printing the raw WebID in #302; this banner sat right under it
// still doing exactly that.
describe('LandingPage – signed-in greeting', () => {
    const WEB_ID = 'https://user.solidpod.example/profile/card#me'

    beforeEach(() => {
        mockUseHasQuestions.mockReturnValue(false)
        mockGetSolidProfile.mockResolvedValue({ name: null, photo: null })
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: true,
            webId: WEB_ID,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    function renderPage() {
        return render(
            <MemoryRouter>
                <LandingPage />
            </MemoryRouter>
        )
    }

    it('greets you by the name on your profile card', async () => {
        mockGetSolidProfile.mockResolvedValue({ name: 'Alice Adams', photo: null })

        renderPage()

        expect(await screen.findByText('Alice Adams')).toBeTruthy()
    })

    it('never prints the raw WebID', async () => {
        renderPage()

        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalled())
        expect(screen.queryByText(WEB_ID)).toBeNull()
    })

    it('falls back to the pod username when the card has no name', async () => {
        renderPage()

        expect(await screen.findByText('user')).toBeTruthy()
    })

    it('reads the profile through the shared cached path', async () => {
        renderPage()

        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalledWith(null, WEB_ID))
    })

    it('says nothing at all when signed out', () => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })

        renderPage()

        expect(screen.queryByText(/signed in as/i)).toBeNull()
    })

    // Offline is not signed out (#342): the greeting stays, and says which it is.
    it('still greets a signed-in user whose Pod is out of reach', async () => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            isReconnecting: true,
            webId: WEB_ID,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })

        renderPage()

        expect(await screen.findByText(/signed in as/i)).toBeTruthy()
        expect(screen.getByText(/offline/i)).toBeTruthy()
    })
})
