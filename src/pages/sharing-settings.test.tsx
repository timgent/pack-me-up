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
import { saveRdfToPod, getFullCollaborators, getCollaborators } from '../services/solidPod'
import { useToast } from '../components/ToastContext'
import { getPendingSignInAction, setPendingSignInAction } from '../utils/pendingSignInAction'

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

// ── Share your full setup ─────────────────────────────────────────────────────

function renderLoggedOut(login = vi.fn()) {
    const db: Partial<PackingAppDatabase> = {
        getSharedWithMe: vi.fn(() => Promise.resolve({ contexts: [], lastModified: '' })),
        saveSharedWithMe: vi.fn(() => Promise.resolve({ rev: '1' })),
        getSharedListsWithMe: vi.fn(() => Promise.resolve({ lists: [], lastModified: '' })),
        saveSharedListsWithMe: vi.fn(() => Promise.resolve({ rev: '1' })),
        getAllPackingLists: vi.fn(() => Promise.resolve([])),
    }
    mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)
    mockUseSolidPod.mockReturnValue({ session: null, isLoggedIn: false, login } as unknown as ReturnType<typeof useSolidPod>)
    return render(<MemoryRouter><SharingSettingsPage /></MemoryRouter>)
}

describe('SharingSettingsPage — share your full setup', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        sessionStorage.clear()
    })

    it('leads with a clearly labelled full-setup entry point', async () => {
        renderPage()

        expect(await screen.findByRole('heading', { name: /share your full setup/i })).toBeTruthy()
        expect(screen.getByText(/let someone else use your questions and lists/i)).toBeTruthy()
    })

    it('spells out that the question set and every list go together', async () => {
        renderPage()

        expect(await screen.findByText(/your question set and every packing list/i)).toBeTruthy()
    })

    it('keeps the copy relationship-agnostic', async () => {
        const { container } = renderPage()

        await screen.findByRole('heading', { name: /share your full setup/i })
        expect(container.textContent).not.toMatch(/partner/i)
        // Breadth is shown by example rather than assumed
        expect(container.textContent).toMatch(/families/i)
    })

    it('points single-list sharing somewhere else so the two are not confused', async () => {
        renderPage()

        expect(await screen.findByText(/just one list/i)).toBeTruthy()
    })

    it('confirms the share and offers the invite link to copy', async () => {
        const writeText = vi.fn(() => Promise.resolve())
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        renderPage()

        fireEvent.change(await screen.findByLabelText(/webid/i), {
            target: { value: 'https://alice.example.com/profile/card#me' },
        })
        fireEvent.click(screen.getByRole('button', { name: /share my setup/i }))

        expect(await screen.findByText(/your full setup is shared/i)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/view-lists')))
    })

    it('offers a benefit-framed sign-in instead of a bare log-in notice when logged out', async () => {
        renderLoggedOut()

        expect(await screen.findByRole('heading', { name: /share your full setup/i })).toBeTruthy()
        expect(screen.getByRole('button', { name: /sign in to share your setup/i })).toBeTruthy()
        expect(screen.queryByText(/please log in to manage sharing settings/i)).toBeNull()
    })

    it('remembers the full-setup share while the user signs in', async () => {
        const login = vi.fn()
        renderLoggedOut(login)

        fireEvent.click(await screen.findByRole('button', { name: /sign in to share your setup/i }))
        fireEvent.click(screen.getByRole('button', { name: /sign in and share/i }))
        fireEvent.click(screen.getByLabelText('Inrupt PodSpaces'))

        expect(login).toHaveBeenCalledWith('https://login.inrupt.com')
        expect(getPendingSignInAction()).toEqual({ type: 'share-full-setup' })
    })

    it('picks the share back up once the user returns signed in', async () => {
        setPendingSignInAction({ type: 'share-full-setup' })
        renderPage()

        await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/webid/i)))
        // Consumed, so a later visit does not steal focus again
        expect(getPendingSignInAction()).toBeNull()
    })
})

describe('SharingSettingsPage — full setup vs individual lists', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        sessionStorage.clear()
    })

    it('confirms the share in the language of the feature, not the plumbing', async () => {
        const showToast = vi.fn()
        vi.mocked(useToast).mockReturnValue({ showToast } as unknown as ReturnType<typeof useToast>)
        renderPage()

        fireEvent.change(await screen.findByLabelText(/webid/i), {
            target: { value: 'https://alice.example.com/profile/card#me' },
        })
        fireEvent.click(screen.getByRole('button', { name: /share my setup/i }))

        await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/full setup is shared/i), 'success'))
    })

    it('does not count a full-setup collaborator as an individual list share', async () => {
        vi.mocked(getFullCollaborators).mockResolvedValue(['https://alice.example.com/profile/card#me'])
        // The whole-setup grant sits on the container, so the ACL check on each
        // child list reports the same person
        vi.mocked(getCollaborators).mockResolvedValue(['https://alice.example.com/profile/card#me'])
        renderPage({
            getAllPackingLists: vi.fn(() => Promise.resolve([
                { id: 'list-1', name: 'Alps hut trip' },
            ] as unknown as PackingList[])),
        })

        expect(await screen.findByText(/haven't shared any individual lists yet/i)).toBeTruthy()
        expect(screen.queryByText(/Alps hut trip/)).toBeNull()
    })

    it('still lists a genuinely individually shared list', async () => {
        vi.mocked(getFullCollaborators).mockResolvedValue([])
        vi.mocked(getCollaborators).mockResolvedValue(['https://bob.example.com/profile/card#me'])
        renderPage({
            getAllPackingLists: vi.fn(() => Promise.resolve([
                { id: 'list-1', name: 'Alps hut trip' },
            ] as unknown as PackingList[])),
        })

        expect(await screen.findByText(/Alps hut trip/)).toBeTruthy()
    })
})
