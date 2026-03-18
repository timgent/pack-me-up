import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
