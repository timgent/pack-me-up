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
    resolvePodUrl: vi.fn(() => Promise.resolve({ podUrl: 'https://pod.example.com/' })),
    isRetryablePodUrlFailure: () => false,
    PodUrlUnavailableError: class PodUrlUnavailableError extends Error {},
    getPodOwnerName: vi.fn(() => Promise.resolve(null)),
    // The page names the people it lists, and confirms an address before
    // granting to it — both of which read profile cards.
    getSolidProfile: vi.fn(() => Promise.resolve({ name: null, photo: null, resolved: false })),
    friendlyWebIdName: vi.fn((webId: string) => new URL(webId).hostname),
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

vi.mock('../services/invites', async importOriginal => {
    const actual = await importOriginal<typeof import('../services/invites')>()
    return { ...actual, listInvites: vi.fn(() => Promise.resolve([])), deleteInvite: vi.fn(() => Promise.resolve()) }
})

import { listInvites, deleteInvite } from '../services/invites'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { saveRdfToPod, getFullCollaborators, getCollaborators, grantFullCollaboratorAccess } from '../services/solidPod'
import { useToast } from '../components/ToastContext'
import { SUCCESS_TOAST_VARIANTS } from '../utils/successToastCopy'
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
        // Read by `useKnownPeople`, behind the suggestion chips.
        getQuestionSet: vi.fn(() => Promise.resolve({ questions: [], people: [] })),
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
        // Read by `useKnownPeople`, behind the suggestion chips.
        getQuestionSet: vi.fn(() => Promise.resolve({ questions: [], people: [] })),
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

    it('offers an invite link before asking for an address at all', async () => {
        renderPage()

        // The address field is the path that needs something only the other
        // person has; the link is the path that needs nothing.
        expect(await screen.findByRole('button', { name: /create invite link/i })).toBeTruthy()
        expect(screen.getByText(/or share with an address you already have/i)).toBeTruthy()
    })

    it('lists an invite link that has been sent but not used', async () => {
        vi.mocked(listInvites).mockResolvedValue([{
            token: 'tok-aaaaaaaaaaaaaaaaaaaa',
            kind: 'full-setup',
            createdAt: '2026-01-01T00:00:00.000Z',
            acceptedBy: [],
            url: 'https://pod.example.com/pack-me-up/invites/tok-aaaaaaaaaaaaaaaaaaaa',
        }])
        renderPage()

        expect(await screen.findByRole('heading', { name: /invite links you've sent/i })).toBeTruthy()
        expect(screen.getByText(/not accepted yet/i)).toBeTruthy()
    })

    it('says when an invite is accepted but not yet acted on', async () => {
        // The one real cost of having no server: it is stated rather than
        // left to be discovered.
        vi.mocked(listInvites).mockResolvedValue([{
            token: 'tok-bbbbbbbbbbbbbbbbbbbb',
            kind: 'list',
            listId: 'l1',
            label: 'Ski trip',
            createdAt: '2026-01-01T00:00:00.000Z',
            acceptedBy: ['https://bob.example.com/profile/card#me'],
            url: 'https://pod.example.com/pack-me-up/invites/tok-bbbbbbbbbbbbbbbbbbbb',
        }])
        renderPage()

        expect(await screen.findByText(/access is granted next time this app opens/i)).toBeTruthy()
        expect(screen.getByText('Ski trip')).toBeTruthy()
    })

    it('revokes an invite link and drops it from the list', async () => {
        vi.mocked(listInvites).mockResolvedValue([{
            token: 'tok-cccccccccccccccccccc',
            kind: 'full-setup',
            createdAt: '2026-01-01T00:00:00.000Z',
            acceptedBy: [],
            url: 'https://pod.example.com/pack-me-up/invites/tok-cccccccccccccccccccc',
        }])
        vi.mocked(deleteInvite).mockResolvedValue(undefined)
        renderPage()

        fireEvent.click(await screen.findByRole('button', { name: /revoke invite link/i }))

        await waitFor(() => expect(deleteInvite).toHaveBeenCalled())
        await waitFor(() => expect(screen.queryByRole('heading', { name: /invite links you've sent/i })).toBeNull())
    })

    it('shows no invite section when there is nothing outstanding', async () => {
        renderPage()

        await screen.findByRole('heading', { name: /share your full setup/i })
        expect(screen.queryByRole('heading', { name: /invite links you've sent/i })).toBeNull()
    })

    it('hands them their own address, which is the step neither side could take', async () => {
        renderPage()

        // Sharing starts with an address only the *other* person can produce,
        // and until this the app showed theirs nowhere they could copy it.
        expect(await screen.findByText('https://me.example.com/profile#me')).toBeTruthy()
        expect(screen.getByRole('button', { name: /copy my address/i })).toBeTruthy()
    })

    it('offers someone you already know instead of asking for their address again', async () => {
        renderPage({
            getQuestionSet: vi.fn(() => Promise.resolve({
                questions: [],
                people: [{ id: '1', name: 'Bob', webId: 'https://bob.example.com/profile/card#me' }],
            })),
        } as unknown as Partial<PackingAppDatabase>)

        fireEvent.click(await screen.findByRole('button', { name: 'Bob' }))

        await waitFor(() => expect((screen.getByLabelText(/webid/i) as HTMLInputElement).value)
            .toBe('https://bob.example.com/profile/card#me'))
    })

    it('confirms the share by naming the person, not reciting their address', async () => {
        renderPage()

        fireEvent.change(await screen.findByLabelText(/webid/i), {
            target: { value: 'https://alice.example.com/profile/card#me' },
        })
        fireEvent.click(screen.getByRole('button', { name: /share my setup/i }))

        // The list below has said "alice.example.com" rather than the whole
        // WebID since names arrived; the confirmation above it should agree.
        const banner = await screen.findByText(/your full setup is shared with/i)
        expect(banner.textContent).toContain('alice.example.com')
        expect(banner.textContent).not.toContain('/profile/card#me')
    })

    it('never offers to share with the person doing the sharing', async () => {
        // The wizard's first person is you — named "Me" — so a question set
        // with your own address on it made the app suggest sharing with
        // yourself.
        renderPage({
            getQuestionSet: vi.fn(() => Promise.resolve({
                questions: [],
                people: [{ id: '1', name: 'Me', webId: 'https://me.example.com/profile#me' }],
            })),
        } as unknown as Partial<PackingAppDatabase>)

        await screen.findByRole('heading', { name: /share your full setup/i })
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Me' })).toBeNull())
    })

    it('does not offer someone who already has the full setup', async () => {
        vi.mocked(getFullCollaborators).mockResolvedValue(['https://bob.example.com/profile/card#me'])
        renderPage({
            getQuestionSet: vi.fn(() => Promise.resolve({
                questions: [],
                people: [{ id: '1', name: 'Bob', webId: 'https://bob.example.com/profile/card#me' }],
            })),
        } as unknown as Partial<PackingAppDatabase>)

        await screen.findByRole('heading', { name: /share your full setup/i })
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Bob' })).toBeNull())
    })

    it('shares with the WebID behind a Pod root, rather than the Pod root itself', async () => {
        renderPage()

        fireEvent.change(await screen.findByLabelText(/webid/i), {
            target: { value: 'alice.solidcommunity.net' },
        })
        fireEvent.click(screen.getByRole('button', { name: /share my setup/i }))

        await waitFor(() => expect(vi.mocked(grantFullCollaboratorAccess)).toHaveBeenCalledWith(
            expect.anything(),
            'https://pod.example.com/',
            'https://alice.solidcommunity.net/profile/card#me',
        ))
    })

    it('stops claiming the setup is shared with someone once they are revoked', async () => {
        const BOB = 'https://bob.example.com/profile/card#me'
        vi.mocked(getFullCollaborators).mockResolvedValue([BOB])
        renderPage()

        fireEvent.change(await screen.findByLabelText(/webid/i), { target: { value: BOB } })
        fireEvent.click(screen.getByRole('button', { name: /share my setup/i }))
        expect(await screen.findByText(/your full setup is shared/i)).toBeTruthy()

        vi.mocked(getFullCollaborators).mockResolvedValue([])
        fireEvent.click(screen.getByRole('button', { name: `Revoke access for ${BOB}` }))

        // The banner outlived the thing it described: this page is not
        // remounted by hash navigation, so its state has to be corrected here.
        await waitFor(() => expect(screen.queryByText(/your full setup is shared/i)).toBeNull())
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

        await waitFor(() => {
            const success = showToast.mock.calls.find(call => call[1] === 'success')
            expect(SUCCESS_TOAST_VARIANTS.setupShared as readonly string[]).toContain(success?.[0])
        })
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
