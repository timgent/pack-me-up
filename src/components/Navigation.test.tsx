import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Navigation } from './Navigation'

vi.mock('../hooks/useHasQuestions', () => ({
    useHasQuestions: vi.fn(),
}))

vi.mock('./SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('./SolidProviderSelector', () => ({
    SolidProviderSelector: () => null,
}))

import { useHasQuestions } from '../hooks/useHasQuestions'
import { useSolidPod } from './SolidPodContext'

const mockUseHasQuestions = vi.mocked(useHasQuestions)
const mockUseSolidPod = vi.mocked(useSolidPod)

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

    it('shows "Get Started" nav link when no questions exist', () => {
        mockUseHasQuestions.mockReturnValue(false)

        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.getAllByText('Get Started').length).toBeGreaterThan(0)
        expect(screen.queryByText('Reconfigure Questions')).toBeNull()
    })

    it('shows "Reconfigure Questions" nav link when questions exist', () => {
        mockUseHasQuestions.mockReturnValue(true)

        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.getAllByText('Reconfigure Questions').length).toBeGreaterThan(0)
        expect(screen.queryByText('Get Started')).toBeNull()
    })
})
