import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { SharingSettingsPage } from './sharing-settings'
import type { PackingAppDatabase } from '../services/database'

vi.mock('../components/DatabaseContext', () => ({ useDatabase: vi.fn() }))
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: vi.fn() }))
vi.mock('../components/ToastContext', () => ({ useToast: vi.fn(() => ({ showToast: vi.fn() })) }))
vi.mock('../services/solidPod', () => ({
    grantFullCollaboratorAccess: vi.fn(),
    revokeFullCollaboratorAccess: vi.fn(),
    getFullCollaborators: vi.fn(() => Promise.resolve([])),
    getCollaborators: vi.fn(() => Promise.resolve([])),
    isPubliclyAccessible: vi.fn(() => Promise.resolve(false)),
    getPrimaryPodUrl: vi.fn(() => Promise.resolve('https://pod.example.com/')),
    getPodOwnerName: vi.fn(() => Promise.resolve(null)),
    friendlyPodName: vi.fn((url: string) => url),
    resolveOwnerDisplayName: vi.fn((foafName: string | null | undefined, ownerWebId: string | null | undefined, podUrl: string) => foafName ?? ownerWebId ?? podUrl),
    buildSharedListPath: vi.fn((listId: string, podUrl: string, ownerWebId?: string) => {
        const base = `/view-lists/${listId}?pod=${encodeURIComponent(podUrl)}`
        return ownerWebId ? `${base}&owner=${encodeURIComponent(ownerWebId)}` : base
    }),
    saveRdfToPod: vi.fn(() => Promise.resolve()),
    POD_CONTAINERS: {
        SHARED_WITH_ME: 'pack-me-up/shared-with-me.ttl',
        SHARED_LISTS_WITH_ME: 'pack-me-up/shared-lists-with-me.ttl',
        PACKING_LISTS: 'pack-me-up/packing-lists/',
    },
}))

import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { saveRdfToPod } from '../services/solidPod'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockSaveRdfToPod = vi.mocked(saveRdfToPod)

const mockSession = { info: { isLoggedIn: true, webId: 'https://me.example.com/profile#me' }, fetch: vi.fn() }

function renderPage(dbOverrides: Partial<PackingAppDatabase> = {}) {
    const db: Partial<PackingAppDatabase> = {
        getSharedWithMe: vi.fn(() => Promise.resolve({ contexts: [], lastModified: '' })),
        saveSharedWithMe: vi.fn(() => Promise.resolve({ rev: '1' })),
        getSharedListsWithMe: vi.fn(() => Promise.resolve({ lists: [], lastModified: '' })),
        saveSharedListsWithMe: vi.fn(() => Promise.resolve({ rev: '1' })),
        getAllPackingLists: vi.fn(() => Promise.resolve([])),
        ...dbOverrides,
    }
    mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)
    mockUseSolidPod.mockReturnValue({ session: mockSession, isLoggedIn: true } as ReturnType<typeof useSolidPod>)
    return render(<MemoryRouter><SharingSettingsPage /></MemoryRouter>)
}

describe('SharingSettingsPage — remove shared context', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('shows a Remove button for each shared context', async () => {
        renderPage({
            getSharedWithMe: vi.fn(() => Promise.resolve({
                contexts: [{ podUrl: 'https://pod.example.com/', addedAt: '', webId: 'https://id.example.com/alice' }],
                lastModified: '',
            })),
        })

        expect(await screen.findByRole('button', { name: /remove/i })).toBeTruthy()
    })

    it('removes the entry from local DB and pod on click', async () => {
        const saveSharedWithMe = vi.fn(() => Promise.resolve({ rev: '1' }))
        renderPage({
            getSharedWithMe: vi.fn(() => Promise.resolve({
                contexts: [{ podUrl: 'https://pod.example.com/', addedAt: '', webId: 'https://id.example.com/alice' }],
                lastModified: '',
            })),
            saveSharedWithMe,
        })

        fireEvent.click(await screen.findByRole('button', { name: /remove/i }))

        await waitFor(() => {
            expect(saveSharedWithMe).toHaveBeenCalledWith(
                expect.objectContaining({ contexts: [] })
            )
        })
        // The pod write is deferred until after the local change is on screen
        await waitFor(() => expect(mockSaveRdfToPod).toHaveBeenCalled())
    })

    it('removes the entry from the UI after clicking Remove', async () => {
        renderPage({
            getSharedWithMe: vi.fn(() => Promise.resolve({
                contexts: [{ podUrl: 'https://pod.example.com/', addedAt: '' }],
                lastModified: '',
            })),
            saveSharedWithMe: vi.fn(() => Promise.resolve({ rev: '1' })),
        })

        fireEvent.click(await screen.findByRole('button', { name: /remove/i }))

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
        })
    })
})
