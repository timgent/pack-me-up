import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureException = vi.fn()
vi.mock('@sentry/capacitor', () => ({ captureException: (...args: unknown[]) => captureException(...args) }))

import { reportError } from './errorReporting'

describe('reportError', () => {
    beforeEach(() => {
        captureException.mockClear()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('logs and forwards the error to Sentry', () => {
        const error = new Error('boom')
        reportError(error, 'Failed to create packing list')

        expect(console.error).toHaveBeenCalledWith('Failed to create packing list', error)
        expect(captureException).toHaveBeenCalledWith(error)
    })

    it('falls back to a generic log message when no context is given', () => {
        const error = new Error('boom')
        reportError(error)

        expect(console.error).toHaveBeenCalledWith('Unhandled error', error)
    })

    it('returns copyable details including the context and error message', () => {
        const error = new Error('boom')
        const details = reportError(error, 'Failed to create packing list')

        expect(details).toContain('Failed to create packing list')
        expect(details).toContain('boom')
    })

    it('formats non-Error values as their string representation', () => {
        const details = reportError('a plain string error', 'Save to Pod error')

        expect(details).toContain('Save to Pod error')
        expect(details).toContain('a plain string error')
    })
})
