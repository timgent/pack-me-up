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

/**
 * Mirrors Sentry's `eventFromUnknownInput`: anything captured that isn't an
 * Error loses its message and stack and is titled by its keys instead. That is
 * how a thrown `{ name, message }` object reached Sentry as the useless
 * "Object captured as exception with keys: message, name", with only Sentry's
 * own minified frames attached.
 */
function sentryTitle(captured: unknown): string {
    if (captured instanceof Error) return `${captured.name}: ${captured.message}`
    if (typeof captured === 'object' && captured !== null) {
        return `Object captured as exception with keys: ${Object.keys(captured).sort().join(', ')}`
    }
    return String(captured)
}

describe('reportError with values that are not Errors', () => {
    beforeEach(() => {
        captureException.mockClear()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('sends a thrown { name, message } object to Sentry as a real Error', () => {
        reportError({ name: 'not_found', message: 'Packing list not found' }, 'Error fetching packing list')

        const captured = captureException.mock.calls[0][0]
        expect(sentryTitle(captured)).not.toBe('Object captured as exception with keys: message, name')
        expect(captured).toBeInstanceOf(Error)
        expect((captured as Error).name).toBe('not_found')
        expect((captured as Error).message).toBe('Packing list not found')
        expect((captured as Error).stack).toBeTruthy()
    })

    it('sends a thrown string to Sentry as a real Error carrying that message', () => {
        reportError('403 Forbidden', 'Save to Pod error')

        const captured = captureException.mock.calls[0][0]
        expect(captured).toBeInstanceOf(Error)
        expect((captured as Error).message).toBe('403 Forbidden')
    })

    it('keeps the original value in the console log and in the copyable details', () => {
        const thrown = { name: 'not_found', message: 'Packing list not found' }
        const details = reportError(thrown, 'Error fetching packing list')

        expect(console.error).toHaveBeenCalledWith('Error fetching packing list', thrown)
        expect(details).toContain('not_found')
        expect(details).toContain('Packing list not found')
    })

    it('preserves extra properties of the thrown object as Sentry context', () => {
        reportError({ name: 'conflict', message: 'Document update conflict', status: 409 })

        const captured = captureException.mock.calls[0][0] as Error & { cause?: unknown }
        expect(captured.cause).toEqual({ name: 'conflict', message: 'Document update conflict', status: 409 })
    })

    it('attaches a numeric status from a thrown object as Sentry extra context', () => {
        reportError({ name: 'conflict', message: 'Document update conflict', status: 409 })

        const [, options] = captureException.mock.calls[0]
        expect(options).toEqual({ extra: { status: 409 } })
    })
})

describe('reportError with a status carried on a real Error', () => {
    beforeEach(() => {
        captureException.mockClear()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('attaches a numeric status property as Sentry extra context', () => {
        class WithStatus extends Error {
            constructor(message: string, readonly status: number) {
                super(message)
            }
        }
        const error = new WithStatus('This invite link is not accepting replies.', 403)

        reportError(error)

        expect(captureException).toHaveBeenCalledWith(error, { extra: { status: 403 } })
    })

    it('sends no extra context when the error has no numeric status', () => {
        const error = new Error('boom')

        reportError(error)

        expect(captureException).toHaveBeenCalledWith(error)
    })
})
