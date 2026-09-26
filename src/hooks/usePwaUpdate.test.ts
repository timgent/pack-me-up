import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockRegisterPwaServiceWorker = vi.fn()
vi.mock('../services/pwaUpdate', () => ({
    registerPwaServiceWorker: (onNeedRefresh: () => void) => mockRegisterPwaServiceWorker(onNeedRefresh),
}))

import { usePwaUpdate } from './usePwaUpdate'

describe('usePwaUpdate', () => {
    beforeEach(() => {
        mockRegisterPwaServiceWorker.mockReset()
    })

    it('starts with no refresh pending', () => {
        mockRegisterPwaServiceWorker.mockReturnValue(undefined)

        const { result } = renderHook(() => usePwaUpdate())

        expect(result.current.needsRefresh).toBe(false)
    })

    it('flags a refresh once the service worker reports one is waiting', () => {
        let onNeedRefresh: () => void = () => {}
        mockRegisterPwaServiceWorker.mockImplementation((cb: () => void) => {
            onNeedRefresh = cb
            return vi.fn()
        })

        const { result } = renderHook(() => usePwaUpdate())
        act(() => onNeedRefresh())

        expect(result.current.needsRefresh).toBe(true)
    })

    it('reload() applies the waiting update', () => {
        const update = vi.fn()
        mockRegisterPwaServiceWorker.mockReturnValue(update)

        const { result } = renderHook(() => usePwaUpdate())
        act(() => result.current.reload())

        expect(update).toHaveBeenCalled()
    })

    it('reload() is a no-op when nothing was registered (e.g. native shell)', () => {
        mockRegisterPwaServiceWorker.mockReturnValue(undefined)

        const { result } = renderHook(() => usePwaUpdate())

        expect(() => act(() => result.current.reload())).not.toThrow()
    })
})
