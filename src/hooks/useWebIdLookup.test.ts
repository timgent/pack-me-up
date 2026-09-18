import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useWebIdLookup } from './useWebIdLookup'
import type { SolidProfile } from '../services/solidPod'

const mockGetSolidProfile = vi.fn<(session: unknown, webId: string) => Promise<SolidProfile>>()

vi.mock('../services/solidPod', async importOriginal => {
    const actual = await importOriginal<typeof import('../services/solidPod')>()
    return { ...actual, getSolidProfile: (s: unknown, w: string) => mockGetSolidProfile(s, w) }
})

// The debounce is real time, so the tests wait for it rather than fake it —
// 500ms of wall clock across a handful of cases is cheaper than the mess of
// faking timers around React's act().
const found = (name: string | null): SolidProfile => ({ name, photo: null, resolved: true })
const missing: SolidProfile = { name: null, photo: null, resolved: false }

describe('useWebIdLookup', () => {
    beforeEach(() => {
        mockGetSolidProfile.mockReset()
        mockGetSolidProfile.mockResolvedValue(found('Bob Smith'))
    })

    it('says nothing about an empty field', () => {
        const { result } = renderHook(() => useWebIdLookup('', null))

        expect(result.current.status).toBe('empty')
        expect(result.current.webId).toBeNull()
        expect(mockGetSolidProfile).not.toHaveBeenCalled()
    })

    it('reports input that is not a web address as invalid, and never looks it up', async () => {
        const { result } = renderHook(() => useWebIdLookup('bob', null))

        expect(result.current.status).toBe('invalid')
        expect(result.current.webId).toBeNull()
        await new Promise(resolve => setTimeout(resolve, 600))
        expect(mockGetSolidProfile).not.toHaveBeenCalled()
    })

    it('normalises what was typed and confirms who is there', async () => {
        const { result } = renderHook(() => useWebIdLookup('bob.solidcommunity.net', null))

        // Available immediately — the parent needs it to enable its button
        // without waiting for any network.
        expect(result.current.webId).toBe('https://bob.solidcommunity.net/profile/card#me')
        expect(result.current.status).toBe('checking')

        await waitFor(() => expect(result.current.status).toBe('found'))
        expect(result.current.profile.name).toBe('Bob Smith')
        expect(mockGetSolidProfile).toHaveBeenCalledWith(null, 'https://bob.solidcommunity.net/profile/card#me')
    })

    it('reports an address with nobody behind it as unknown', async () => {
        mockGetSolidProfile.mockResolvedValue(missing)

        const { result } = renderHook(() => useWebIdLookup('https://nobody.example.org/profile/card#me', null))

        await waitFor(() => expect(result.current.status).toBe('unknown'))
        // Still offered to the parent: an address we cannot read is not proof
        // it is wrong, so sharing stays possible.
        expect(result.current.webId).toBe('https://nobody.example.org/profile/card#me')
    })

    it('counts a card with no name as found', async () => {
        mockGetSolidProfile.mockResolvedValue(found(null))

        const { result } = renderHook(() => useWebIdLookup('https://bob.example.org/profile/card#me', null))

        await waitFor(() => expect(result.current.status).toBe('found'))
    })

    it('checks an address that is there on the first render without waiting', async () => {
        // A field can open pre-filled — "share this list too" with someone you
        // already share with — and making them wait half a second to be told
        // who they already picked would be silly.
        const { result } = renderHook(() => useWebIdLookup('https://bob.example.org/profile/card#me', null))

        await waitFor(() => expect(result.current.status).toBe('found'))
    })

    it('goes back to checking when the address changes under a settled answer', async () => {
        const { result, rerender } = renderHook(
            ({ raw }: { raw: string }) => useWebIdLookup(raw, null),
            { initialProps: { raw: 'https://bob.example.org/profile/card#me' } },
        )
        await waitFor(() => expect(result.current.status).toBe('found'))

        rerender({ raw: 'https://carol.example.org/profile/card#me' })

        // The old answer must not stand in for the new address — that is how
        // you confidently share with the wrong person.
        expect(result.current.status).toBe('checking')
        await waitFor(() => expect(result.current.status).toBe('found'))
    })

    it('waits for typing to settle before asking the network', async () => {
        // From empty, as the real fields start: one lookup for what they
        // finished typing, not one per keystroke.
        const { rerender } = renderHook(
            ({ raw }: { raw: string }) => useWebIdLookup(raw, null),
            { initialProps: { raw: '' } },
        )
        rerender({ raw: 'https://bob.example.org/profile/car' })
        rerender({ raw: 'https://bob.example.org/profile/card' })
        rerender({ raw: 'https://bob.example.org/profile/card#' })
        rerender({ raw: 'https://bob.example.org/profile/card#me' })

        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalled())
        expect(mockGetSolidProfile).toHaveBeenCalledTimes(1)
        expect(mockGetSolidProfile).toHaveBeenCalledWith(null, 'https://bob.example.org/profile/card#me')
    })
})
