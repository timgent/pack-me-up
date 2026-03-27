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

    it('shows "Family Setup" nav link when no questions exist', () => {
        mockUseHasQuestions.mockReturnValue(false)

        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.getAllByText('Family Setup').length).toBeGreaterThan(0)
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
        expect(screen.queryByText('Family Setup')).toBeNull()
    })

    it('hides Backups link when not logged in', () => {
        mockUseHasQuestions.mockReturnValue(false)

        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.queryByText('Backups')).toBeNull()
    })

    it('shows "Customise My Lists" nav link instead of "Edit Questions"', () => {
        mockUseHasQuestions.mockReturnValue(false)

        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.getAllByText('Customise My Lists').length).toBeGreaterThan(0)
        expect(screen.queryByText('Edit Questions')).toBeNull()
    })

    it('shows Backups link when logged in', () => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: true,
            sessionExpired: false,
            clearSessionExpired: vi.fn(),
            webId: 'https://user.solidpod.example/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseHasQuestions.mockReturnValue(false)

        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.getAllByText('Backups').length).toBeGreaterThan(0)
    })
})
