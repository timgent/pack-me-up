import * as Sentry from '@sentry/capacitor'

export function reportError(error: unknown, context?: string): string {
    console.error(context ?? 'Unhandled error', error)
    Sentry.captureException(error)
    return formatErrorDetails(error, context)
}

function formatErrorDetails(error: unknown, context?: string): string {
    const lines = [`Time: ${new Date().toISOString()}`]
    if (context) lines.push(context)
    lines.push(error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error))
    return lines.join('\n')
}
