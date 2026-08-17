import * as Sentry from '@sentry/capacitor'
import * as SentryReact from '@sentry/react'

// Sentry DSNs are public identifiers, safe to ship in client-side code.
const SENTRY_DSN = 'https://a331ffe142776c6dd8d5fcecfb2a4a97@o4511757730578432.ingest.de.sentry.io/4511757737525328'

// Local dev and test runs report to the console instead of Sentry, so day-to-day
// development doesn't fill the project's error quota with noise from work in progress.
// Set VITE_SENTRY_ENABLED=true to opt a local dev build back in (e.g. to verify a
// Sentry change end to end).
function isSentryEnabled() {
  if (import.meta.env.VITE_SENTRY_ENABLED === 'true') return true
  return import.meta.env.MODE !== 'development' && import.meta.env.MODE !== 'test'
}

export function initSentry() {
  if (!isSentryEnabled()) return

  Sentry.init(
    {
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [
        SentryReact.feedbackIntegration({ colorScheme: 'system' }),
        // Field-data counterpart to scripts/perf/mobile-repro.mjs — see docs/questions-page-mobile-performance.md.
        SentryReact.browserTracingIntegration(),
      ],
      tracesSampleRate: 0.1,
    },
    SentryReact.init,
  )
}
