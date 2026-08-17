import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const init = vi.fn()
vi.mock('@sentry/capacitor', () => ({ init: (...args: unknown[]) => init(...args) }))
vi.mock('@sentry/react', () => ({
    init: vi.fn(),
    feedbackIntegration: () => ({ name: 'Feedback' }),
    browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
}))

import { initSentry } from './sentry'

describe('initSentry', () => {
    beforeEach(() => {
        init.mockClear()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('does not initialise Sentry in local dev', () => {
        vi.stubEnv('MODE', 'development')

        initSentry()

        expect(init).not.toHaveBeenCalled()
    })

    it('does not initialise Sentry under test', () => {
        vi.stubEnv('MODE', 'test')

        initSentry()

        expect(init).not.toHaveBeenCalled()
    })

    it('initialises Sentry in production builds', () => {
        vi.stubEnv('MODE', 'production')

        initSentry()

        expect(init).toHaveBeenCalledOnce()
        expect(init.mock.calls[0][0]).toMatchObject({ environment: 'production' })
    })

    it('initialises Sentry in local dev when explicitly opted in', () => {
        vi.stubEnv('MODE', 'development')
        vi.stubEnv('VITE_SENTRY_ENABLED', 'true')

        initSentry()

        expect(init).toHaveBeenCalledOnce()
    })
})
