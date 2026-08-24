import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import type { AppSession as Session } from '../types/AppSession'
import type { PackingAppDatabase } from '../services/database'

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

const mockShowToast = vi.fn()
vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(() => ({ showToast: mockShowToast })),
}))

vi.mock('../hooks/usePodErrorHandler', () => ({
    usePodErrorHandler: vi.fn(() => vi.fn()),
}))

vi.mock('../services/solidPod', () => ({
    getPrimaryPodUrl: vi.fn(),
}))

vi.mock('../services/solidPodBackup', () => ({
    createBackup: vi.fn(),
    listBackups: vi.fn(),
    deleteBackup: vi.fn(),
    restoreBackup: vi.fn(),
}))

import { BackupsPage } from './backups'
import { useSolidPod } from '../components/SolidPodContext'
import { useDatabase } from '../components/DatabaseContext'
import { getPrimaryPodUrl } from '../services/solidPod'
import { listBackups, createBackup } from '../services/solidPodBackup'
import { SUCCESS_TOAST_VARIANTS, resetSuccessToastVariety } from '../utils/successToastCopy'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockUseDatabase = vi.mocked(useDatabase)
const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockListBackups = vi.mocked(listBackups)
const mockCreateBackup = vi.mocked(createBackup)

describe('BackupsPage loading state', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: {} as Session,
            webId: 'https://pod.example/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({ db: {} as PackingAppDatabase })
        mockGetPrimaryPodUrl.mockResolvedValue('https://pod.example/')
    })

    afterEach(() => {
        cleanup()
    })

    it('uses the shared loading treatment while backups load', async () => {
        mockListBackups.mockReturnValue(new Promise(() => {}))

        render(<BackupsPage />)

        await waitFor(() => {
            expect(screen.getByRole('status').textContent).toContain('Loading backups...')
        })
        expect(screen.getAllByTestId('loading-skeleton-card').length).toBeGreaterThan(0)
    })

    it('replaces the loading treatment with the real content once backups arrive', async () => {
        mockListBackups.mockResolvedValue([])

        render(<BackupsPage />)

        await waitFor(() => expect(screen.getByText('No backups yet')).toBeTruthy())
        expect(screen.queryByRole('status')).toBeNull()
    })
})

describe('BackupsPage confirmation copy', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetSuccessToastVariety()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: {} as Session,
            webId: 'https://pod.example/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({ db: {} as PackingAppDatabase })
        mockGetPrimaryPodUrl.mockResolvedValue('https://pod.example/')
        mockListBackups.mockResolvedValue([])
        mockCreateBackup.mockResolvedValue(undefined as never)
    })

    afterEach(() => {
        cleanup()
    })

    async function createABackup() {
        render(<BackupsPage />)
        await screen.findByText('No backups yet')
        fireEvent.click(screen.getByRole('button', { name: /create backup/i }))
        await waitFor(() => expect(mockCreateBackup).toHaveBeenCalled())
    }

    it('confirms a backup with one of the warm success phrasings', async () => {
        await createABackup()

        await waitFor(() => {
            const success = mockShowToast.mock.calls.find(call => call[1] === 'success')
            expect(SUCCESS_TOAST_VARIANTS.backupCreated as readonly string[]).toContain(success?.[0])
        })
    })

    // Backing up is the most repeated action on this page; the same sentence
    // every time is a sentence people stop reading.
    it('does not repeat the same confirmation on a second backup', async () => {
        await createABackup()
        cleanup()
        await createABackup()

        await waitFor(() => {
            const messages = mockShowToast.mock.calls.filter(call => call[1] === 'success').map(call => call[0])
            expect(messages).toHaveLength(2)
            expect(messages[1]).not.toBe(messages[0])
        })
    })
})
