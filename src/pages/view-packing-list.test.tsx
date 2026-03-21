import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ViewPackingList } from './view-packing-list'
import type { PackingAppDatabase } from '../services/database'

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(() => ({ showToast: vi.fn() })),
}))

vi.mock('../hooks/usePodSync', () => ({
    usePodSync: vi.fn(),
}))

vi.mock('../hooks/useSyncCoordinator', () => ({
    useSyncCoordinator: vi.fn(),
}))

import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { usePodSync } from '../hooks/usePodSync'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockUsePodSync = vi.mocked(usePodSync)
const mockUseSyncCoordinator = vi.mocked(useSyncCoordinator)

const testPackingList = {
    id: 'test-list-1',
    name: 'Test Trip',
    createdAt: '2026-01-01T00:00:00Z',
    items: [
        {
            id: 'item-1',
            itemText: 'Passport',
            personName: 'Alice',
            personId: 'p1',
            questionId: 'q1',
            optionId: 'o1',
            packed: false,
        },
    ],
}

function makeDb() {
    return {
        getPackingList: vi.fn().mockResolvedValue(testPackingList),
        savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
    }
}

function renderComponent() {
    return render(
        <MemoryRouter initialEntries={['/view-list/test-list-1']}>
            <Routes>
                <Route path="/view-list/:id" element={<ViewPackingList />} />
            </Routes>
        </MemoryRouter>
    )
}

describe('ViewPackingList hidden items banner', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({
            saveToPod: vi.fn(),
        })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not show the hidden items banner when no items are checked', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        expect(screen.queryByText(/item.* hidden/i)).toBeNull()
    })

    it('shows the hidden items banner when an item is checked', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByRole('checkbox'))

        await waitFor(() => {
            expect(screen.getByText(/item.* hidden/i)).toBeTruthy()
        })
    })

    it('hides the banner when "Show Packed" is clicked', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByRole('checkbox'))

        await waitFor(() => expect(screen.getByText(/item.* hidden/i)).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /show packed/i }))

        expect(screen.queryByText(/item.* hidden/i)).toBeNull()
    })

    it('uses primary button variant for "Show Packed" when items are hidden', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByRole('checkbox'))

        await waitFor(() => {
            const showPackedBtn = screen.getByRole('button', { name: /show packed/i })
            expect(showPackedBtn.className).toContain('bg-gradient-primary')
        })
    })
})

describe('ViewPackingList checked item styling', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({
            saveToPod: vi.fn(),
        })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('applies strikethrough styling to item text when checked', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        // Enable "Show Packed" so the item remains visible after checking
        fireEvent.click(screen.getByRole('button', { name: /show packed/i }))
        fireEvent.click(screen.getByRole('checkbox'))

        await waitFor(() => {
            const span = screen.getByText('Passport')
            expect(span.className).toContain('line-through')
        })
    })

    it('does not apply strikethrough styling when item is unchecked', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        const span = screen.getByText('Passport')
        expect(span.className).not.toContain('line-through')
    })
})
