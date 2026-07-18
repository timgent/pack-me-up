import * as Sentry from '@sentry/capacitor'

export function reportError(error: unknown, context?: string) {
    console.error(context ?? 'Unhandled error', error)
    Sentry.captureException(error)
}
