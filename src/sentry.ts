import * as Sentry from '@sentry/capacitor'
import * as SentryReact from '@sentry/react'

// Sentry DSNs are public identifiers, safe to ship in client-side code.
const SENTRY_DSN = 'https://a331ffe142776c6dd8d5fcecfb2a4a97@o4511757730578432.ingest.de.sentry.io/4511757737525328'

export function initSentry() {
  if (import.meta.env.MODE === 'test') return

  Sentry.init(
    {
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [SentryReact.feedbackIntegration({ colorScheme: 'system' })],
    },
    SentryReact.init,
  )
}
