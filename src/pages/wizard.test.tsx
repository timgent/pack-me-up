import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Wizard } from './wizard'

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('./useWizardGeneration', () => ({
    useWizardGeneration: vi.fn(),
}))

vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(() => ({ showToast: vi.fn() })),
}))

import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { useWizardGeneration } from './useWizardGeneration'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockUseWizardGeneration = vi.mocked(useWizardGeneration)

function makeDb(overrides: { getQuestionSet?: ReturnType<typeof vi.fn> } = {}) {
    return {
        getQuestionSet: overrides.getQuestionSet ?? vi.fn().mockRejectedValue({ name: 'not_found' }),
    }
}

describe('Wizard', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})

        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })

        mockUseWizardGeneration.mockReturnValue({
            isLoading: false,
            isSuccess: false,
            generateAndSave: vi.fn(),
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('shows warning banner when questions already exist', async () => {
        const db = makeDb({ getQuestionSet: vi.fn().mockResolvedValue({ questions: [] }) })
        mockUseDatabase.mockReturnValue({ db: db as any })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByText(/you already have packing list questions set up/i)).toBeTruthy()
        )
    })

    it('does not show warning banner when no questions exist', async () => {
        const db = makeDb({ getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }) })
        mockUseDatabase.mockReturnValue({ db: db as any })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() => screen.getByRole('button', { name: /generate/i }))
        expect(screen.queryByText(/you already have packing list questions set up/i)).toBeNull()
    })
})
