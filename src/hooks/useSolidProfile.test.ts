import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { AppSession } from '../types/AppSession'
import { useSolidProfile } from './useSolidProfile'

vi.mock('../services/solidPod', () => ({
    getSolidProfile: vi.fn(),
}))

import { getSolidProfile } from '../services/solidPod'

const mockGetSolidProfile = vi.mocked(getSolidProfile)

const session = { fetch: globalThis.fetch, info: { isLoggedIn: true } } as AppSession

describe('useSolidProfile', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('reports nothing until the profile card has been read', () => {
        mockGetSolidProfile.mockReturnValue(new Promise(() => {}))

        const { result } = renderHook(() => useSolidProfile('https://alice.example/profile/card#me', session))

        expect(result.current).toEqual({ name: null, photo: null })
    })

    it('reports the name and photo the card names', async () => {
        mockGetSolidProfile.mockResolvedValue({ name: 'Alice', photo: 'https://alice.example/me.png' })

        const { result } = renderHook(() => useSolidProfile('https://alice.example/profile/card#me', session))

        await waitFor(() => expect(result.current).toEqual({ name: 'Alice', photo: 'https://alice.example/me.png' }))
    })

    it('reads nothing when there is no WebID to read', () => {
        renderHook(() => useSolidProfile(undefined, session))

        expect(mockGetSolidProfile).not.toHaveBeenCalled()
    })

    // A profile card is public by convention, and getSolidProfile reads it
    // unauthenticated when there is no session — same as usePersonPhotos.
    it('still reads the card when there is no session', async () => {
        mockGetSolidProfile.mockResolvedValue({ name: 'Alice', photo: null })

        const { result } = renderHook(() => useSolidProfile('https://alice.example/profile/card#me', null))

        await waitFor(() => expect(result.current.name).toBe('Alice'))
        expect(mockGetSolidProfile).toHaveBeenCalledWith(null, 'https://alice.example/profile/card#me')
    })

    it('keeps a card that cannot be read from breaking the caller', async () => {
        mockGetSolidProfile.mockRejectedValue(new Error('404'))

        const { result } = renderHook(() => useSolidProfile('https://gone.example/profile/card#me', session))

        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalled())
        expect(result.current).toEqual({ name: null, photo: null })
    })

    it('does not write state for a profile that lands after unmount', async () => {
        let resolve!: (p: { name: string | null; photo: string | null }) => void
        mockGetSolidProfile.mockReturnValue(new Promise(r => { resolve = r }))
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

        const { unmount } = renderHook(() => useSolidProfile('https://alice.example/profile/card#me', session))
        unmount()
        resolve({ name: 'Alice', photo: null })
        await Promise.resolve()

        expect(errors).not.toHaveBeenCalled()
        errors.mockRestore()
    })
})
