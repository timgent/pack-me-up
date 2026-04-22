import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Wizard } from './wizard'
import type { PackingAppDatabase } from '../services/database'

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
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

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
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() => screen.getByRole('button', { name: /generate my packing questions/i }))
        expect(screen.queryByText(/you already have packing list questions set up/i)).toBeNull()
    })

    it('shows success modal but not pod prompt immediately after generation succeeds', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
        mockUseWizardGeneration.mockReturnValue({
            isLoading: false,
            isSuccess: true,
            generateAndSave: vi.fn(),
        })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByText(/questions generated successfully/i)).toBeTruthy()
        )
        expect(screen.queryByText(/great! your questions are ready/i)).toBeNull()
    })

    it('closes the success modal when the X button is clicked', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
        mockUseWizardGeneration.mockReturnValue({
            isLoading: false,
            isSuccess: true,
            generateAndSave: vi.fn(),
        })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByText(/questions generated successfully/i)).toBeTruthy()
        )

        const closeButton = screen.getByRole('button', { name: /close/i })
        closeButton.click()

        await waitFor(() =>
            expect(screen.queryByText(/questions generated successfully/i)).toBeNull()
        )
    })

    it('shows pod prompt only after a success modal CTA is clicked', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
        mockUseWizardGeneration.mockReturnValue({
            isLoading: false,
            isSuccess: true,
            generateAndSave: vi.fn(),
        })
        localStorage.removeItem('solid-pod-upsell-shown')

        const { getByRole } = render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByText(/questions generated successfully/i)).toBeTruthy()
        )
        expect(screen.queryByText(/great! your questions are ready/i)).toBeNull()

        const createListBtn = getByRole('button', { name: /create my first packing list/i })
        createListBtn.click()

        await waitFor(() =>
            expect(screen.getByText(/great! your questions are ready/i)).toBeTruthy()
        )
    })

    it('sets solid-pod-upsell-shown global key when pod prompt is dismissed', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
        mockUseWizardGeneration.mockReturnValue({
            isLoading: false,
            isSuccess: true,
            generateAndSave: vi.fn(),
        })
        localStorage.removeItem('solid-pod-upsell-shown')

        const { getByRole } = render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByText(/questions generated successfully/i)).toBeTruthy()
        )

        getByRole('button', { name: /create my first packing list/i }).click()

        await waitFor(() =>
            expect(screen.getByText(/great! your questions are ready/i)).toBeTruthy()
        )

        getByRole('button', { name: /maybe later/i }).click()

        expect(localStorage.getItem('solid-pod-upsell-shown')).toBe('true')
    })

    it('shows the create packing questions heading', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByText(/create your packing questions/i)).toBeTruthy()
        )
    })

    it('shows the one-time setup note', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByText(/do this once to get started/i)).toBeTruthy()
        )
    })

    it('does not render the activities section', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() => screen.getByRole('button', { name: /generate my packing questions/i }))
        expect(screen.queryByText(/what activities are you planning/i)).toBeNull()
    })

    it('submit button says "Generate My Packing Questions"', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /generate my packing questions/i })).toBeTruthy()
        )
    })

    it('renders a gender select for each person', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByText('Select gender...')).toBeTruthy()
        )
    })


    describe("Who's Packing? - remove person", () => {
        function renderWizard() {
            const db = makeDb()
            mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
            return render(
                <MemoryRouter>
                    <Wizard />
                </MemoryRouter>
            )
        }

        it('shows a remove button for the first person even when only one person exists', async () => {
            renderWizard()
            const removeBtn = await screen.findByTitle('Remove person')
            expect(removeBtn).toBeTruthy()
        })

        it('clicking remove on the only person clears their name field', async () => {
            renderWizard()
            const removeBtn = await screen.findByTitle('Remove person')
            removeBtn.click()
            await waitFor(() => expect(screen.getByDisplayValue('')).toBeTruthy())
            // Ensure there is still exactly one person entry
            expect(screen.getAllByTitle('Remove person')).toHaveLength(1)
        })
    })

    it('does not show pod prompt when solid-pod-upsell-shown is already set', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
        mockUseWizardGeneration.mockReturnValue({
            isLoading: false,
            isSuccess: true,
            generateAndSave: vi.fn(),
        })
        localStorage.setItem('solid-pod-upsell-shown', 'true')

        const { getByRole } = render(
            <MemoryRouter>
                <Wizard />
            </MemoryRouter>
        )

        await waitFor(() =>
            expect(screen.getByText(/questions generated successfully/i)).toBeTruthy()
        )

        getByRole('button', { name: /create my first packing list/i }).click()

        // Give React a chance to update - pod prompt should NOT appear
        await new Promise(r => setTimeout(r, 50))
        expect(screen.queryByText(/great! your questions are ready/i)).toBeNull()
    })
})
