import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Navigation } from './Navigation'

vi.mock('./SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('./SolidProviderSelector', () => ({
    SolidProviderSelector: () => null,
}))

import { useSolidPod } from './SolidPodContext'

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

    it('hides Backups link when not logged in', () => {
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.queryByText('Backups')).toBeNull()
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

    it('shows feedback email link', () => {
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        const feedbackLinks = screen.getAllByRole('link', { name: /feedback/i })
        expect(feedbackLinks.length).toBeGreaterThan(0)
        expect(feedbackLinks[0].getAttribute('href')).toBe('mailto:tim.packmeup@gmail.com')
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

        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>
        )

        expect(screen.getAllByText('Backups').length).toBeGreaterThan(0)
    })
})
