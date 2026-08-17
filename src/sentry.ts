import * as Sentry from '@sentry/capacitor'
import * as SentryReact from '@sentry/react'
import type { ErrorEvent, Exception } from '@sentry/react'

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

/**
 * A frame from a script that was evaluated without a source URL.
 *
 * Everything we ship is loaded from a file, so every frame of ours carries a
 * filename (`app:///assets/index-*.js`, once @sentry/capacitor's rewriteFrames
 * has normalised it). Code injected straight into the page — via the WebView's
 * `evaluateJavascript`, an extension, or an `eval` — has no file to point at,
 * so Sentry records it as `<anonymous>`, `<unknown>` or nothing at all.
 */
const NO_SOURCE_FILE = /^(?:app:\/\/\/)?(?:<anonymous>|<unknown>)$/

/**
 * Was this error thrown by a script that isn't ours?
 *
 * Sentry's browserApiErrorsIntegration patches the *global* `setTimeout`, so it
 * wraps timer callbacks belonging to every script sharing the page — including
 * ones the host injects and we have no control over (Android autofill, password
 * managers, in-app-browser overlays). When such a callback throws, our wrapper
 * catches it, reports it to this project and rethrows, so the event arrives
 * looking like ours: the injected frame sits directly on top of a frame from our
 * own bundle, which is only Sentry's wrapper.
 *
 * That is where "Error invoking log: Java bridge method invocation error" at
 * `scanForForms` came from — a WebView form scanner we don't ship, calling a
 * native JavaScript interface we don't register. Nothing in our code can fix or
 * even reach it, and reporting it buries real bugs.
 *
 * The message is the host's to change, so match on origin instead: the innermost
 * frame is the one that actually threw, and if it has no source file the failure
 * happened outside our bundle. Anything thrown by our own code — a genuine
 * Capacitor bridge failure included — still has a real filename there and is kept.
 */
export function isThirdPartyScriptError(event: ErrorEvent): boolean {
  const values = event.exception?.values
  if (!values?.length) return false
  // `every`, so a chained exception survives if any link came from our code.
  return values.every(threwFromScriptWithoutSource)
}

function threwFromScriptWithoutSource(value: Exception): boolean {
  const frames = value.stacktrace?.frames
  // Frames are stored oldest first, so the frame that threw is the last one.
  const threw = frames?.[frames.length - 1]
  // No stack at all says nothing about whose code failed — keep it rather than guess.
  if (!threw) return false
  return !threw.filename || NO_SOURCE_FILE.test(threw.filename)
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
      beforeSend: event => (isThirdPartyScriptError(event) ? null : event),
    },
    SentryReact.init,
  )
}
