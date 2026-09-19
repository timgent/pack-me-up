import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { StoredInvite } from '../services/invites'

const mockListInvites = vi.fn<() => Promise<StoredInvite[]>>()
const mockDeleteInvite = vi.fn()
const mockGrantFull = vi.fn()
const mockGrantList = vi.fn()
const mockGetPrimaryPodUrl = vi.fn()
const mockShowToast = vi.fn()
const mockReportError = vi.fn()

vi.mock('../services/invites', async importOriginal => {
    const actual = await importOriginal<typeof import('../services/invites')>()
    return { ...actual, listInvites: mockListInvites, deleteInvite: mockDeleteInvite }
})
vi.mock('../services/solidPod', async importOriginal => {
    const actual = await importOriginal<typeof import('../services/solidPod')>()
    return {
        ...actual,
        grantFullCollaboratorAccess: mockGrantFull,
        grantCollaboratorAccess: mockGrantList,
        getPrimaryPodUrl: mockGetPrimaryPodUrl,
    }
})
vi.mock('../components/ToastContext', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
vi.mock('../errorReporting', () => ({ reportError: mockReportError }))

const mockSolidPod = vi.fn()
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: () => mockSolidPod() }))

const { useInviteRedemption } = await import('./useInviteRedemption')

const POD = 'https://alice.example.org/'
const BOB = 'https://bob.example.org/profile/card#me'
const CAROL = 'https://carol.example.org/profile/card#me'

const invite = (over: Partial<StoredInvite> = {}): StoredInvite => ({
    token: 'tok-aaaaaaaaaaaaaaaaaaaa',
    kind: 'full-setup',
    createdAt: '2026-01-01T00:00:00.000Z',
    acceptedBy: [],
    url: `${POD}pack-me-up/invites/tok-aaaaaaaaaaaaaaaaaaaa`,
    ...over,
})

const session = { info: { isLoggedIn: true, webId: 'https://alice.example.org/profile/card#me' }, fetch: vi.fn() }

beforeEach(() => {
    vi.clearAllMocks()
    mockSolidPod.mockReturnValue({ session, isLoggedIn: true })
    mockGetPrimaryPodUrl.mockResolvedValue(POD)
    mockListInvites.mockResolvedValue([])
    mockGrantFull.mockResolvedValue(undefined)
    mockGrantList.mockResolvedValue(undefined)
    mockDeleteInvite.mockResolvedValue(undefined)
})

describe('useInviteRedemption', () => {
    it('does nothing at all when signed out', async () => {
        mockSolidPod.mockReturnValue({ session: null, isLoggedIn: false })

        renderHook(() => useInviteRedemption())

        await new Promise(r => setTimeout(r, 0))
        expect(mockListInvites).not.toHaveBeenCalled()
    })

    it('leaves an invite nobody has accepted alone', async () => {
        mockListInvites.mockResolvedValue([invite()])

        renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockListInvites).toHaveBeenCalled())
        expect(mockGrantFull).not.toHaveBeenCalled()
        expect(mockDeleteInvite).not.toHaveBeenCalled()
    })

    it('grants the whole setup to whoever accepted a full-setup invite', async () => {
        mockListInvites.mockResolvedValue([invite({ acceptedBy: [BOB] })])

        const { result } = renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockGrantFull).toHaveBeenCalledWith(session, POD, BOB))
        await waitFor(() => expect(result.current.redeemed).toHaveLength(1))
        expect(result.current.redeemed[0].webIds).toEqual([BOB])
    })

    it('grants one list to whoever accepted a list invite', async () => {
        mockListInvites.mockResolvedValue([invite({ kind: 'list', listId: 'list-1', acceptedBy: [BOB] })])

        renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockGrantList).toHaveBeenCalledWith(
            session,
            `${POD}pack-me-up/packing-lists/list-1.ttl`,
            BOB,
        ))
    })

    it('grants to everyone who used the same link', async () => {
        // One link handed round a family is a real thing to do, and each of
        // them appended separately.
        mockListInvites.mockResolvedValue([invite({ acceptedBy: [BOB, CAROL] })])

        renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockGrantFull).toHaveBeenCalledTimes(2))
        expect(mockGrantFull).toHaveBeenCalledWith(session, POD, BOB)
        expect(mockGrantFull).toHaveBeenCalledWith(session, POD, CAROL)
    })

    it('tidies the invite away once it has been acted on', async () => {
        mockListInvites.mockResolvedValue([invite({ acceptedBy: [BOB] })])

        renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockDeleteInvite).toHaveBeenCalledWith(session, invite().url))
    })

    it('keeps the invite when the grant failed, so the next run can retry', async () => {
        // Deleting here would lose the acceptance entirely: the person who
        // accepted has no way to tell, and no way to do it again.
        mockGrantFull.mockRejectedValue(new Error('pod unreachable'))
        mockListInvites.mockResolvedValue([invite({ acceptedBy: [BOB] })])

        renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockReportError).toHaveBeenCalled())
        expect(mockDeleteInvite).not.toHaveBeenCalled()
    })

    it('ignores a list invite with no list on it', async () => {
        // Nothing sensible to grant, and "grant something else instead" would
        // be the worst possible guess.
        mockListInvites.mockResolvedValue([invite({ kind: 'list', acceptedBy: [BOB] })])

        renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockListInvites).toHaveBeenCalled())
        expect(mockGrantList).not.toHaveBeenCalled()
        expect(mockGrantFull).not.toHaveBeenCalled()
    })

    it('says who just got access', async () => {
        mockListInvites.mockResolvedValue([invite({ acceptedBy: [BOB] })])

        renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/accepted/i), 'success'))
    })

    it('stays quiet when there was nothing to do', async () => {
        renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockListInvites).toHaveBeenCalled())
        expect(mockShowToast).not.toHaveBeenCalled()
    })

    it('looks only once per sign-in, however often it re-renders', async () => {
        const { rerender } = renderHook(() => useInviteRedemption())

        await waitFor(() => expect(mockListInvites).toHaveBeenCalledTimes(1))
        rerender()
        rerender()

        await new Promise(r => setTimeout(r, 0))
        expect(mockListInvites).toHaveBeenCalledTimes(1)
    })

    it('carries on when the Pod cannot be reached at all', async () => {
        // Offline is normal, and it is not an error worth shouting about: the
        // acceptance is still sitting on the Pod for next time.
        mockGetPrimaryPodUrl.mockRejectedValue(new Error('offline'))

        renderHook(() => useInviteRedemption())

        await new Promise(r => setTimeout(r, 0))
        expect(mockShowToast).not.toHaveBeenCalled()
    })
})
