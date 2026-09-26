import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRegisterSW = vi.fn()
vi.mock('virtual:pwa-register', () => ({
    registerSW: (options: unknown) => mockRegisterSW(options),
}))

const mockIsNativePlatform = vi.fn()
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))

import { registerPwaServiceWorker, RELOAD_FALLBACK_MS } from './pwaUpdate'

type RegisterOptions = {
    onNeedRefresh: () => void
    onRegisteredSW: (url: string, registration: ServiceWorkerRegistration | undefined) => void
}

/** A stand-in for the waiting ServiceWorker: jsdom has none. */
function fakeWorker() {
    const worker = new EventTarget() as EventTarget & { state: string }
    worker.state = 'installed'
    return worker
}

function activate(worker: ReturnType<typeof fakeWorker>) {
    worker.state = 'activated'
    worker.dispatchEvent(new Event('statechange'))
}

/** Registers, and hands back what the registration reported as waiting. */
function registerWith(waiting: ReturnType<typeof fakeWorker> | null) {
    const updateSW = vi.fn(async () => {})
    mockRegisterSW.mockImplementation((options: RegisterOptions) => {
        options.onRegisteredSW('/sw.js', { waiting } as unknown as ServiceWorkerRegistration)
        return updateSW
    })
    const reloadPage = vi.fn()
    const applyUpdate = registerPwaServiceWorker(vi.fn(), reloadPage)
    return { applyUpdate: applyUpdate!, updateSW, reloadPage }
}

describe('registerPwaServiceWorker', () => {
    beforeEach(() => {
        mockRegisterSW.mockReset()
        mockIsNativePlatform.mockReset()
        mockIsNativePlatform.mockReturnValue(false)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('does nothing on the Capacitor native shell', () => {
        mockIsNativePlatform.mockReturnValue(true)

        const result = registerPwaServiceWorker(vi.fn())

        expect(result).toBeUndefined()
        expect(mockRegisterSW).not.toHaveBeenCalled()
    })

    it('registers the service worker on the web and forwards onNeedRefresh', () => {
        mockRegisterSW.mockReturnValue(vi.fn())
        const onNeedRefresh = vi.fn()

        const result = registerPwaServiceWorker(onNeedRefresh)

        expect(mockRegisterSW).toHaveBeenCalledWith(expect.objectContaining({ onNeedRefresh }))
        expect(result).toBeTypeOf('function')
    })

    describe('applying an update', () => {
        it('tells the waiting worker to take over, and reloads once it has', () => {
            const waiting = fakeWorker()
            const { applyUpdate, updateSW, reloadPage } = registerWith(waiting)

            applyUpdate()

            expect(updateSW).toHaveBeenCalled()
            expect(reloadPage).not.toHaveBeenCalled()

            activate(waiting)

            expect(reloadPage).toHaveBeenCalledTimes(1)
        })

        // The library only reloads on `controllerchange`, which never fires in
        // a tab the old worker wasn't controlling — a first visit, or after a
        // hard reload — so Reload did nothing there and the banner stayed.
        it('reloads even when the tab was never controlled by a service worker', () => {
            const waiting = fakeWorker()
            const { applyUpdate, reloadPage } = registerWith(waiting)

            applyUpdate()
            activate(waiting)

            expect(reloadPage).toHaveBeenCalledTimes(1)
        })

        it('reloads straight away when no worker is waiting any more', () => {
            const { applyUpdate, reloadPage } = registerWith(null)

            applyUpdate()

            expect(reloadPage).toHaveBeenCalledTimes(1)
        })

        it('reloads anyway if the waiting worker never activates', () => {
            vi.useFakeTimers()
            const { applyUpdate, reloadPage } = registerWith(fakeWorker())

            applyUpdate()
            vi.advanceTimersByTime(RELOAD_FALLBACK_MS - 1)
            expect(reloadPage).not.toHaveBeenCalled()

            vi.advanceTimersByTime(1)
            expect(reloadPage).toHaveBeenCalledTimes(1)
        })

        it('reloads only once when activation and the fallback both land', () => {
            vi.useFakeTimers()
            const waiting = fakeWorker()
            const { applyUpdate, reloadPage } = registerWith(waiting)

            applyUpdate()
            activate(waiting)
            vi.advanceTimersByTime(RELOAD_FALLBACK_MS)

            expect(reloadPage).toHaveBeenCalledTimes(1)
        })
    })
})
