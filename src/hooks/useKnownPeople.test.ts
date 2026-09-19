import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useKnownPeople } from './useKnownPeople'

const mockGetQuestionSet = vi.fn()
const mockGetSharedWithMe = vi.fn()
const mockGetSharedListsWithMe = vi.fn()

const mockOwnWebId = vi.fn<() => string | undefined>(() => undefined)
vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: () => ({ session: { info: { webId: mockOwnWebId() } } }),
}))

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: () => ({
        db: {
            getQuestionSet: mockGetQuestionSet,
            getSharedWithMe: mockGetSharedWithMe,
            getSharedListsWithMe: mockGetSharedListsWithMe,
        },
    }),
}))

const BOB = 'https://bob.solidcommunity.net/profile/card#me'
const CAROL = 'https://carol.solidcommunity.net/profile/card#me'

function withData({
    people = [] as unknown[],
    contexts = [] as unknown[],
    lists = [] as unknown[],
} = {}) {
    mockGetQuestionSet.mockResolvedValue({ questions: [], people })
    mockGetSharedWithMe.mockResolvedValue({ contexts, lastModified: '' })
    mockGetSharedListsWithMe.mockResolvedValue({ lists, lastModified: '' })
}

describe('useKnownPeople', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockOwnWebId.mockReturnValue(undefined)
        withData()
    })

    it('is empty before anything has been read, and stays empty with nothing to show', async () => {
        const { result } = renderHook(() => useKnownPeople())

        expect(result.current).toEqual([])
        await waitFor(() => expect(mockGetQuestionSet).toHaveBeenCalled())
        expect(result.current).toEqual([])
    })

    it('offers the people in your question set who have an address', async () => {
        withData({
            people: [
                { id: '1', name: 'Bob', webId: BOB },
                { id: '2', name: 'Nobody' },
            ],
        })

        const { result } = renderHook(() => useKnownPeople())

        await waitFor(() => expect(result.current).toEqual([{ webId: BOB, name: 'Bob' }]))
    })

    it('leaves out people who have been deleted', async () => {
        withData({ people: [{ id: '1', name: 'Bob', webId: BOB, deletedAt: '2026-01-01T00:00:00Z' }] })

        const { result } = renderHook(() => useKnownPeople())

        await waitFor(() => expect(mockGetQuestionSet).toHaveBeenCalled())
        expect(result.current).toEqual([])
    })

    it('offers people who shared their setup with you, named from the stored label', async () => {
        withData({ contexts: [{ podUrl: 'https://carol.solidcommunity.net/', addedAt: '', webId: CAROL, label: 'Carol Jones' }] })

        const { result } = renderHook(() => useKnownPeople())

        // Sharing back should not mean typing an address you already have.
        await waitFor(() => expect(result.current).toEqual([{ webId: CAROL, name: 'Carol Jones' }]))
    })

    it('offers people who shared one list with you, named from their address when nothing better exists', async () => {
        withData({ lists: [{ listId: 'abc', podUrl: 'https://carol.solidcommunity.net/', ownerWebId: CAROL }] })

        const { result } = renderHook(() => useKnownPeople())

        await waitFor(() => expect(result.current.length).toBe(1))
        expect(result.current[0].webId).toBe(CAROL)
        expect(result.current[0].name).toMatch(/carol/i)
    })

    it('lists a person once, however many places they turn up in', async () => {
        withData({
            people: [{ id: '1', name: 'Carol', webId: CAROL }],
            contexts: [{ podUrl: 'https://carol.solidcommunity.net/', addedAt: '', webId: CAROL, label: 'Carol Jones' }],
            lists: [{ listId: 'abc', podUrl: 'https://carol.solidcommunity.net/', ownerWebId: CAROL }],
        })

        const { result } = renderHook(() => useKnownPeople())

        await waitFor(() => expect(result.current.length).toBe(1))
        // The name you gave them wins over the one their pod publishes: it is
        // what you call them.
        expect(result.current[0].name).toBe('Carol')
    })

    it('matches the same person across the different shapes their address is stored in', async () => {
        withData({
            people: [{ id: '1', name: 'Bob', webId: 'bob.solidcommunity.net' }],
            contexts: [{ podUrl: 'https://bob.solidcommunity.net/', addedAt: '', webId: BOB }],
        })

        const { result } = renderHook(() => useKnownPeople())

        await waitFor(() => expect(mockGetQuestionSet).toHaveBeenCalled())
        // A Pod root typed into the People editor and a full WebID from a share
        // are one person, and offering both would be worse than offering neither.
        await waitFor(() => expect(result.current).toEqual([{ webId: BOB, name: 'Bob' }]))
    })

    it('drops an address that is not one rather than offering it', async () => {
        withData({ people: [{ id: '1', name: 'Typo', webId: 'not an address' }] })

        const { result } = renderHook(() => useKnownPeople())

        await waitFor(() => expect(mockGetQuestionSet).toHaveBeenCalled())
        expect(result.current).toEqual([])
    })

    it('never offers you yourself', async () => {
        // The wizard's first person is the user, so their own address turns up
        // in their own question set as a matter of course.
        mockOwnWebId.mockReturnValue(BOB)
        withData({
            people: [{ id: '1', name: 'Me', webId: BOB }, { id: '2', name: 'Carol', webId: CAROL }],
        })

        const { result } = renderHook(() => useKnownPeople())

        await waitFor(() => expect(result.current).toEqual([{ webId: CAROL, name: 'Carol' }]))
    })

    it('recognises itself under a differently shaped address', async () => {
        mockOwnWebId.mockReturnValue('https://bob.solidcommunity.net/')
        withData({ people: [{ id: '1', name: 'Me', webId: BOB }] })

        const { result } = renderHook(() => useKnownPeople())

        await waitFor(() => expect(mockGetQuestionSet).toHaveBeenCalled())
        expect(result.current).toEqual([])
    })

    it('reads nothing until the caller says it is wanted', async () => {
        // A packing list page mounts this for a dialog that is closed; three
        // document reads for a row of chips nobody has asked for is three too
        // many.
        renderHook(() => useKnownPeople(false))

        await new Promise(resolve => setTimeout(resolve, 0))
        expect(mockGetQuestionSet).not.toHaveBeenCalled()
        expect(mockGetSharedWithMe).not.toHaveBeenCalled()
        expect(mockGetSharedListsWithMe).not.toHaveBeenCalled()
    })

    it('reads once the caller turns it on', async () => {
        withData({ people: [{ id: '1', name: 'Bob', webId: BOB }] })
        const { result, rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) => useKnownPeople(enabled),
            { initialProps: { enabled: false } },
        )

        rerender({ enabled: true })

        await waitFor(() => expect(result.current).toEqual([{ webId: BOB, name: 'Bob' }]))
    })

    it('survives a device with none of these documents yet', async () => {
        mockGetQuestionSet.mockRejectedValue({ name: 'not_found' })
        mockGetSharedWithMe.mockRejectedValue({ name: 'not_found' })
        mockGetSharedListsWithMe.mockRejectedValue({ name: 'not_found' })

        const { result } = renderHook(() => useKnownPeople())

        await waitFor(() => expect(mockGetQuestionSet).toHaveBeenCalled())
        expect(result.current).toEqual([])
    })
})
