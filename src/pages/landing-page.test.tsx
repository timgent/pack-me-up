import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from './landing-page'

vi.mock('../hooks/useHasQuestions', () => ({
    useHasQuestions: vi.fn(),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

import { useHasQuestions } from '../hooks/useHasQuestions'
import { useSolidPod } from '../components/SolidPodContext'

const mockUseHasQuestions = vi.mocked(useHasQuestions)
const mockUseSolidPod = vi.mocked(useSolidPod)

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

    it('shows "Reconfigure your questions" as secondary link when questions exist', () => {
        mockUseHasQuestions.mockReturnValue(true)

        render(
            <MemoryRouter>
                <LandingPage />
            </MemoryRouter>
        )

        expect(screen.getByRole('link', { name: /reconfigure your questions/i })).toBeTruthy()
    })

    it('displays the correct h1 heading', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        expect(screen.getByRole('heading', { level: 1, name: /smart packing lists, made simple/i })).toBeTruthy()
    })

    it('does not show a separate tagline below the h1', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        expect(screen.queryByText(/smart packing lists for every trip/i)).toBeNull()
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

    it('shows a "Login with Solid Pod" button on the page when not logged in', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        expect(screen.getByRole('button', { name: /login with solid pod/i })).toBeTruthy()
    })

    it('opens the provider selector modal when the login button is clicked', () => {
        mockUseHasQuestions.mockReturnValue(false)
        render(<MemoryRouter><LandingPage /></MemoryRouter>)
        const loginButton = screen.getByRole('button', { name: /login with solid pod/i })
        fireEvent.click(loginButton)
        expect(screen.getByRole('dialog')).toBeTruthy()
    })
})
