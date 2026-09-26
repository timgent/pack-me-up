import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
    // Mirrors the real builder, whose whole point is that the origin is the
    // app's public one and never `window.location.origin` (#357). The sentinel
    // origin below is what proves the page delegates instead of composing the
    // URL itself, as it used to.
    buildSharedSetupUrl: vi.fn((podUrl: string, ownerWebId?: string) => {
        const base = `https://public.example.com/#/pod/${encodeURIComponent(podUrl)}/view-lists`
        return ownerWebId ? `${base}?owner=${encodeURIComponent(ownerWebId)}` : base
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

// Whether a share can be opened yet is a Pod read; every entry is open unless
// a test says otherwise.
vi.mock('../services/sharedAccess', () => ({ checkSharedAccess: vi.fn(() => Promise.resolve('open')) }))

import { listInvites, deleteInvite } from '../services/invites'
import { InviteRedemptionContext } from '../components/InviteRedemptionContext'
import { checkSharedAccess } from '../services/sharedAccess'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { saveRdfToPod, getFullCollaborators, getCollaborators, grantFullCollaboratorAccess } from '../services/solidPod'
import { useToast } from '../components/ToastContext'
import { SUCCESS_TOAST_VARIANTS } from '../utils/successToastCopy'
import { getPendingSignInAction, setPendingSignInAction } from '../utils/pendingSignInAction'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockSaveRdfToPod = vi.mocked(saveRdfToPod)

/** Whether `b` comes after `a` in the document — i.e. is read after it. */
const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

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
        expect(await screen.findByRole('button', { name: /create invite link/i })).toBeTruthy()
    })

    // The control goes first; what it shares is worth saying, but underneath
    // it, not as something to read past on the way to it (#360).
    it('puts the invite button above the explanation of what it shares', async () => {
        renderPage()

        const button = await screen.findByRole('button', { name: /create invite link/i })
        expect(follows(button, screen.getByText(/your questions and every packing list/i))).toBe(true)
        expect(follows(button, screen.getByText(/just one list\?/i))).toBe(true)
    })

    it('puts the sign-in button above the explanation when logged out', async () => {
        renderLoggedOut()

        const button = await screen.findByRole('button', { name: /sign in to share your setup/i })
        expect(follows(button, screen.getByText(/your questions and every packing list/i))).toBe(true)
        expect(follows(button, screen.getByText(/stays on this device/i))).toBe(true)
    })

    it('spells out that the question set and every list go together', async () => {
        renderPage()

        expect(await screen.findByText(/your questions and every packing list/i)).toBeTruthy()
    })

    it('keeps the copy relationship-agnostic', async () => {
        const { container } = renderPage()

        await screen.findByRole('heading', { name: /share your full setup/i })
        expect(container.textContent).not.toMatch(/partner/i)
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
        // The link has to open on somebody else's device, so it carries the
        // app's public origin rather than whatever this one is served from.
        expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/public\.example\.com\/#\/pod\//))
        expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining(window.location.origin))
    })

    it('offers an invite link before asking for an address at all', async () => {
        renderPage()

        // The address field is the path that needs something only the other
        // person has; the link is the path that needs nothing.
        expect(await screen.findByRole('button', { name: /create invite link/i })).toBeTruthy()
        // Still there for whoever wants it, but closed: laid out beside the
        // link it was a second way of doing the same thing, read by everybody.
        const disclosure = screen.getByText(/use a sharing address instead/i).closest('details')
        expect(disclosure?.open).toBe(false)
        expect(disclosure?.contains(screen.getByLabelText(/webid/i))).toBe(true)
    })

    it('keeps the pitch to a sentence', async () => {
        renderPage()

        await screen.findByRole('heading', { name: /share your full setup/i })
        expect(screen.queryByText(/scout troops/i)).toBeNull()
        expect(screen.getByText(/just one list\?/i)).toBeTruthy()
    })

    it('only lists who has the full setup when somebody does', async () => {
        renderPage()

        await screen.findByRole('heading', { name: /share your full setup/i })
        await waitFor(() => expect(vi.mocked(getFullCollaborators)).toHaveBeenCalled())
        expect(screen.queryByText(/people with your full setup/i)).toBeNull()
        expect(screen.queryByText(/haven't shared your full setup/i)).toBeNull()
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
        // With the address path, not heading the page: only somebody sharing
        // by address needs it.
        expect(screen.getByText(/use a sharing address instead/i).closest('details')
            ?.contains(screen.getByText('https://me.example.com/profile#me'))).toBe(true)
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
        // Opened, so the pick and the Share button are on screen.
        expect(screen.getByText(/use a sharing address instead/i).closest('details')?.open).toBe(true)
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

    // It answers the Share button, so it belongs straight under it — not
    // below "Your own address", which is about the other direction.
    it('confirms the share right under the Share button, above your own address', async () => {
        renderPage()

        fireEvent.change(await screen.findByLabelText(/webid/i), {
            target: { value: 'https://alice.example.com/profile/card#me' },
        })
        fireEvent.click(screen.getByRole('button', { name: /share my setup/i }))

        const banner = await screen.findByText(/your full setup is shared with/i)
        const button = screen.getByRole('button', { name: /share my setup/i })
        const yourAddress = screen.getByText(/your own address/i)
        expect(follows(button, banner)).toBe(true)
        expect(follows(banner, yourAddress)).toBe(true)
    })

    it('hands over the link first and says what to do with it after', async () => {
        renderPage()

        fireEvent.change(await screen.findByLabelText(/webid/i), {
            target: { value: 'https://alice.example.com/profile/card#me' },
        })
        fireEvent.click(screen.getByRole('button', { name: /share my setup/i }))

        const banner = await screen.findByText(/your full setup is shared with/i)
        const link = screen.getByRole('textbox', { name: /invite link/i })
        const instruction = screen.getByText(/send them this link/i)
        expect(follows(banner, link)).toBe(true)
        expect(follows(link, instruction)).toBe(true)
        // The banner's heading already says they have everything.
        expect(screen.queryByText(/they now have your question set/i)).toBeNull()
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

        // The invite link, now the way to share, rather than the address field.
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /create invite link/i })))
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

        await waitFor(() => expect(vi.mocked(getCollaborators)).toHaveBeenCalled())
        // Nothing individually shared, so no section saying so.
        await waitFor(() => expect(screen.queryByText(/Alps hut trip/)).toBeNull())
        expect(screen.queryByRole('heading', { name: /individual lists i've shared/i })).toBeNull()
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

// ── Shares accepted but not yet granted, and shares taken away ───────────────

// Accepting an invite records the share on the invitee's side straight away,
// but access only arrives when the sender's app next runs. Until then the
// entry has to say so, rather than vanish or offer an Open that is refused.
// Once it has opened, being refused means something else: access revoked.
describe('SharingSettingsPage — shares waiting on the sender, and shares revoked', () => {
    const mockCheck = vi.mocked(checkSharedAccess)
    const ALICE_POD = 'https://alice.example.org/'
    const ALICE = 'https://alice.example.org/profile/card#me'
    const LIST_URL = `${ALICE_POD}pack-me-up/packing-lists/list-123.ttl`

    beforeEach(() => {
        vi.clearAllMocks()
        mockCheck.mockResolvedValue('open')
    })

    const withSetup = (awaitingAccess?: boolean, saveSharedWithMe = vi.fn(() => Promise.resolve({ rev: '1' }))) => ({
        getSharedWithMe: vi.fn(() => Promise.resolve({
            contexts: [{ podUrl: ALICE_POD, webId: ALICE, label: 'Alice Smith', addedAt: '', ...(awaitingAccess ? { awaitingAccess } : {}) }],
            lastModified: '',
        })),
        saveSharedWithMe,
    })
    const withList = (awaitingAccess?: boolean, saveSharedListsWithMe = vi.fn(() => Promise.resolve({ rev: '1' }))) => ({
        getSharedListsWithMe: vi.fn(() => Promise.resolve({
            lists: [{ listId: 'list-123', listUrl: LIST_URL, podUrl: ALICE_POD, ownerWebId: ALICE, label: 'Ski trip', addedAt: '', ...(awaitingAccess ? { awaitingAccess } : {}) }],
            lastModified: '',
        })),
        saveSharedListsWithMe,
    })

    it('checks each shared setup and list for access', async () => {
        renderPage({ ...withSetup(), ...withList() })

        await waitFor(() => {
            expect(mockCheck).toHaveBeenCalledWith(mockSession, { kind: 'setup', podUrl: ALICE_POD })
            expect(mockCheck).toHaveBeenCalledWith(mockSession, { kind: 'list', listUrl: LIST_URL })
        })
    })

    it('says a setup never yet opened is waiting on the sender, and does not offer to open it', async () => {
        mockCheck.mockResolvedValue('refused')
        renderPage(withSetup(true))

        expect(await screen.findByText(/waiting for Alice Smith to open Pack Me Up/i)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /^open$/i })).toBeNull()
        // Changing their mind is still possible.
        expect(screen.getByRole('button', { name: /remove/i })).toBeTruthy()
    })

    it('says a list never yet opened is waiting on the sender, and does not offer to open it', async () => {
        mockCheck.mockResolvedValue('refused')
        renderPage(withList(true))

        expect(await screen.findByText(/waiting for .* to open Pack Me Up/i)).toBeTruthy()
        expect(screen.getByText('Ski trip')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /^open$/i })).toBeNull()
    })

    // A share that has opened before and is now refused was taken away —
    // telling them to wait for the sender would have them wait for ever.
    it('says a setup that has opened before has been revoked', async () => {
        mockCheck.mockResolvedValue('refused')
        renderPage(withSetup())

        expect(await screen.findByText(/Alice Smith has stopped sharing this with you/i)).toBeTruthy()
        expect(screen.queryByText(/waiting for/i)).toBeNull()
        expect(screen.queryByRole('button', { name: /^open$/i })).toBeNull()
        expect(screen.getByRole('button', { name: /remove/i })).toBeTruthy()
    })

    it('says a list that has opened before has been revoked', async () => {
        mockCheck.mockResolvedValue('refused')
        renderPage(withList())

        expect(await screen.findByText(/has stopped sharing this with you/i)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /^open$/i })).toBeNull()
    })

    it('offers to open a share once access has arrived', async () => {
        renderPage(withSetup())

        await waitFor(() => expect(mockCheck).toHaveBeenCalled())
        expect(await screen.findByRole('button', { name: /^open$/i })).toBeTruthy()
        expect(screen.queryByText(/waiting for|stopped sharing/i)).toBeNull()
    })

    // Otherwise a later revocation would still read as a wait.
    it('remembers that a waiting setup has now opened', async () => {
        const save = vi.fn(() => Promise.resolve({ rev: '1' }))
        renderPage(withSetup(true, save))

        await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
            contexts: [expect.not.objectContaining({ awaitingAccess: true })],
        })))
    })

    it('remembers that a waiting list has now opened', async () => {
        const save = vi.fn(() => Promise.resolve({ rev: '1' }))
        renderPage(withList(true, save))

        await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
            lists: [expect.not.objectContaining({ awaitingAccess: true })],
        })))
    })

    it('writes nothing for a share that was never waiting', async () => {
        const save = vi.fn(() => Promise.resolve({ rev: '1' }))
        renderPage(withSetup(undefined, save))

        await screen.findByRole('button', { name: /^open$/i })
        expect(save).not.toHaveBeenCalled()
    })
})

// ── Shared with me, as one section ────────────────────────────────────────────

describe('SharingSettingsPage — shared with me', () => {
    beforeEach(() => vi.clearAllMocks())

    // Whole setups and single lists were two sections with two empty states;
    // to the person receiving them they are one question — what do I have?
    it('lists setups and single lists together, each saying what it is', async () => {
        renderPage({
            getSharedWithMe: vi.fn(() => Promise.resolve({
                contexts: [{ podUrl: 'https://alice.example.org/', label: 'Alice Smith', addedAt: '' }],
                lastModified: '',
            })),
            getSharedListsWithMe: vi.fn(() => Promise.resolve({
                lists: [{ listId: 'l1', listUrl: 'https://bob.example.org/pack-me-up/packing-lists/l1.ttl', podUrl: 'https://bob.example.org/', label: 'Ski trip', addedAt: '' }],
                lastModified: '',
            })),
        })

        await screen.findByText('Ski trip')
        const section = (await screen.findByRole('heading', { name: /^shared with me$/i })).closest('section')!
        expect(section.textContent).toMatch(/Alice Smith/)
        expect(section.textContent).toMatch(/Full setup/)
        expect(section.textContent).toMatch(/Ski trip/)
        expect(screen.queryByRole('heading', { name: /individual lists shared with me/i })).toBeNull()
    })

    it('says so once when nothing has been shared', async () => {
        renderPage()

        expect(await screen.findByText(/nothing has been shared with you yet/i)).toBeTruthy()
        expect(screen.queryByText(/no shared pods yet/i)).toBeNull()
        expect(screen.queryByText(/no individual lists yet/i)).toBeNull()
    })
})

// ── Waiting on an invite, in the same room ────────────────────────────────────

// An invite is only granted when this app checks the Pod, which used to be
// once per sign-in — so an invitee accepting across the table stayed invisible
// until the inviter reloaded. While an invite is out, the page keeps asking.
describe('SharingSettingsPage — noticing an acceptance without a reload', () => {
    const POLL_MS = 5_000
    const outstanding = {
        token: 'tok-dddddddddddddddddddd',
        kind: 'full-setup' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        acceptedBy: [],
        url: 'https://pod.example.com/pack-me-up/invites/tok-dddddddddddddddddddd',
    }

    function renderWithRedemption(redeemNow: () => Promise<number>) {
        const db: Partial<PackingAppDatabase> = {
            getSharedWithMe: vi.fn(() => Promise.resolve({ contexts: [], lastModified: '' })),
            saveSharedWithMe: vi.fn(() => Promise.resolve({ rev: '1' })),
            getSharedListsWithMe: vi.fn(() => Promise.resolve({ lists: [], lastModified: '' })),
            saveSharedListsWithMe: vi.fn(() => Promise.resolve({ rev: '1' })),
            getAllPackingLists: vi.fn(() => Promise.resolve([])),
            getQuestionSet: vi.fn(() => Promise.resolve({ questions: [], people: [] })),
        }
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)
        mockUseSolidPod.mockReturnValue({ session: mockSession, isLoggedIn: true } as ReturnType<typeof useSolidPod>)
        return render(
            <InviteRedemptionContext.Provider value={{ version: 0, redeemNow }}>
                <MemoryRouter><SharingSettingsPage /></MemoryRouter>
            </InviteRedemptionContext.Provider>,
        )
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => vi.useRealTimers())

    it('keeps checking for an acceptance while an invite is out', async () => {
        vi.mocked(listInvites).mockResolvedValue([outstanding])
        const redeemNow = vi.fn(() => Promise.resolve(0))
        renderWithRedemption(redeemNow)
        await screen.findByRole('heading', { name: /invite links you've sent/i })

        await vi.advanceTimersByTimeAsync(POLL_MS)
        await vi.advanceTimersByTimeAsync(POLL_MS)

        expect(redeemNow.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('does not check when no invite is out', async () => {
        vi.mocked(listInvites).mockResolvedValue([])
        const redeemNow = vi.fn(() => Promise.resolve(0))
        renderWithRedemption(redeemNow)
        await screen.findByRole('heading', { name: /share your full setup/i })

        await vi.advanceTimersByTimeAsync(POLL_MS * 3)

        expect(redeemNow).not.toHaveBeenCalled()
    })

    it('checks straight away when asked, and says so when nobody has accepted yet', async () => {
        vi.mocked(listInvites).mockResolvedValue([outstanding])
        const redeemNow = vi.fn(() => Promise.resolve(0))
        renderWithRedemption(redeemNow)

        fireEvent.click(await screen.findByRole('button', { name: /check now/i }))

        await waitFor(() => expect(redeemNow).toHaveBeenCalled())
        expect(await screen.findByText(/nobody has accepted yet/i)).toBeTruthy()
    })
})
