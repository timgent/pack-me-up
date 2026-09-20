import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRegisterSW = vi.fn()
vi.mock('virtual:pwa-register', () => ({
    registerSW: (options: unknown) => mockRegisterSW(options),
}))

const mockIsNativePlatform = vi.fn()
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))

import { registerPwaServiceWorker } from './pwaUpdate'

describe('registerPwaServiceWorker', () => {
    beforeEach(() => {
        mockRegisterSW.mockReset()
        mockIsNativePlatform.mockReset()
    })

    it('does nothing on the Capacitor native shell', () => {
        mockIsNativePlatform.mockReturnValue(true)

        const result = registerPwaServiceWorker(vi.fn())

        expect(result).toBeUndefined()
        expect(mockRegisterSW).not.toHaveBeenCalled()
    })

    it('registers the service worker on the web and forwards onNeedRefresh', () => {
        mockIsNativePlatform.mockReturnValue(false)
        const update = vi.fn()
        mockRegisterSW.mockReturnValue(update)
        const onNeedRefresh = vi.fn()

        const result = registerPwaServiceWorker(onNeedRefresh)

        expect(mockRegisterSW).toHaveBeenCalledWith({ onNeedRefresh })
        expect(result).toBe(update)
    })
})
