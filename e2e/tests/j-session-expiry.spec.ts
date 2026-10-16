import { test, expect } from '../fixtures'
import { accountMenu, loginToCss, signInAndConsentAtCss, waitForLiveSession } from '../helpers/login'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { emitNativeEvent, runAsNativeApp } from '../helpers/native-shell'
import {
  APP_URL,
  JUSER_EMAIL,
  JUSER_PASSWORD,
  JNATIVE_EMAIL,
  JNATIVE_PASSWORD,
  NATIVE_CLIENT_ID_URL,
} from '../../playwright.config'
import { NATIVE_AUTH_REDIRECT_URI } from '../../src/services/solidClientIdentity'

const CSS_ISSUER = process.env.CSS_ISSUER ?? 'http://localhost:4001'
const TEST_POD_NAME = 'testuser'

const isTokenRequest = (url: URL) =>
  url.port === new URL(CSS_ISSUER).port && url.pathname.endsWith('/token')

// The banner's wording differs by SessionEndedError.reason (SessionExpiredBanner.tsx):
// a provider-side reason like invalid_grant gets its own explanation, everything
// else falls back to "Your session has expired." Match the sentence both share.
const expiredBanner = (page: import('@playwright/test').Page) =>
  page.getByText(/your data is saved locally/i).first()

test.describe('J – Session Expiry', () => {
  /**
   * The app used to answer a 401 by calling the auth library's logout(), which
   * clears IndexedDB — and the refresh token with it. That turned an access token
   * that had merely aged out into a mandatory re-login. A 401 is the *recoverable*
   * case, so it must never end the session.
   */
  test('J1: a 401 from the pod does not sign the user out', async ({ authedPage: page }) => {
    const webIdUrl = `${CSS_ISSUER}/${TEST_POD_NAME}/profile/card`
    await page.route(webIdUrl, route => route.fulfill({ status: 401 }))

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await expect(expiredBanner(page)).not.toBeVisible({ timeout: 5_000 })
    await waitForLiveSession(page)
  })

  /**
   * The one failure that genuinely ends a session: the provider itself refusing
   * the refresh token. Only this may show the user the expired banner.
   */
  test('J2: the provider rejecting the refresh token does sign the user out', async ({ authedPage: page }) => {
    await page.route(
      url => isTokenRequest(url),
      route => route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'grant request is invalid' }),
      }),
    )

    // A reload makes the app restore from its stored refresh token.
    await page.reload()

    await expect(expiredBanner(page)).toBeVisible({ timeout: 30_000 })
  })

  /**
   * A struggling token endpoint is not a logged-out user. The app must keep
   * trying, and pick the session back up once the endpoint recovers.
   */
  test('J3: a failing token endpoint is retried, not treated as a logout', async ({ authedPage: page }) => {
    let failures = 0
    await page.route(
      url => isTokenRequest(url),
      async route => {
        if (failures < 3) {
          failures++
          return route.fulfill({ status: 503, body: 'upstream unavailable' })
        }
        return route.continue()
      },
    )

    await page.reload()

    // The session comes back on its own, without the user touching anything.
    await waitForLiveSession(page, 60_000)
    expect(failures).toBe(3)
    await expect(expiredBanner(page)).not.toBeVisible()
  })

  /**
   * Offline is not signed out (#342).
   *
   * A session only becomes live once the provider answers a refresh, so a start
   * with no network cannot have one — and the app used to answer that by showing
   * its logged-out face: "Sync & Share" in the nav, the marketing page instead of
   * the lists, and the pod-scoped local database swapped for the empty one. On a
   * phone, where a cold start with no signal is routine, that is what "it logged
   * me out again" turned out to be.
   *
   * Every request to the pod and its provider is refused here; the app itself is
   * already loaded, which is exactly the shape of a phone that has lost signal.
   */
  test('J4: a pod that cannot be reached reads as offline, not signed out', async ({ authedPage: page }) => {
    await page.route(
      url => url.port === new URL(CSS_ISSUER).port,
      route => route.abort('internetdisconnected'),
    )

    await page.reload()

    // Still their account, not an invitation to sign in.
    await expect(accountMenu(page).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Sync & Share' })).toHaveCount(0)
    // Said out loud, so the quiet pod is explained rather than mysterious.
    await expect(page.getByTestId('offline-banner')).toBeVisible()
    await expect(expiredBanner(page)).not.toBeVisible()
  })

  /**
   * The half of #342 that loses more than confidence: the PouchDB namespace is
   * derived from the pod URL, which is read from the WebID profile over the
   * network. With none, the app opened the empty `local` database and the user's
   * lists were simply not there.
   */
  /**
   * The half of #342 that loses more than confidence: the PouchDB namespace is
   * derived from the pod URL, which is read from the WebID profile over the
   * network. With none, the app opened the empty `local` database and the user's
   * lists were simply not there.
   *
   * Its own pod user, and its own context: this is the only test in J that
   * writes, and `testuser` is shared with suites E and Z.
   */
  test('J5: the lists made while online are still there when the pod is not', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      await loginToCss(page, CSS_ISSUER, JUSER_EMAIL, JUSER_PASSWORD)
      await waitForLiveSession(page)

      await page.goto('/#/wizard')
      await fillPersonRequiredFields(page)
      await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
      try { await page.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* no existing questions */ }
      await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 15_000 })

      const listName = `Offline Survivor ${Date.now()}`
      await page.goto('/#/create-packing-list')
      await page.getByLabel('Packing List Name').waitFor({ timeout: 15_000 })
      await page.getByLabel('Packing List Name').fill(listName)
      await page.getByRole('button', { name: 'Create Packing List' }).click()
      await page.waitForURL(/#\/view-lists\//, { timeout: 15_000 })

      // Every request to the pod and its provider refused, as for J4.
      await page.route(
        url => url.port === new URL(CSS_ISSUER).port,
        route => route.abort('internetdisconnected'),
      )
      await page.goto('/#/view-lists')
      await page.reload()

      await expect(page.getByText(listName)).toBeVisible({ timeout: 30_000 })
    } finally {
      await ctx.close()
    }
  })

  /**
   * The native app signs in through the system browser, not its own WebView
   * (#358) — RFC 8252 rules out embedded user agents for authorization
   * requests, and the WebView let the app reach the password field.
   *
   * There is no Custom Tab in Chromium, so this plays one: `runAsNativeApp`
   * stands in for Capacitor's native bridge, and opens the Browser plugin's
   * tab as a popup. The custom-scheme redirect CSS answers with is what the OS
   * would route back to the app; it is handed over as the `appUrlOpen` event
   * the OS would deliver.
   *
   * Everything on the provider's side is real: CSS fetches the native Client
   * ID Document (served by global setup), validates its custom-scheme redirect,
   * and issues the tokens the app then refreshes from after a reload.
   */
  test('J6: the native app signs in through the system browser, never its own WebView', async ({ browser }) => {
    const ctx = await browser.newContext()
    await runAsNativeApp(ctx)
    const page = await ctx.newPage()
    const appNavigations: string[] = []
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) appNavigations.push(frame.url()) })
    const requests: string[] = []
    ctx.on('request', request => { requests.push(request.url()) })

    try {
      await page.goto('/')
      await page.getByRole('button', { name: 'Sync & Share' }).click()
      await page.getByLabel('Search providers or paste your Pod URL').fill(CSS_ISSUER)

      const browserTab = page.waitForEvent('popup')
      const callback = ctx.waitForEvent('response', {
        predicate: response => (response.headers()['location'] ?? '').startsWith(NATIVE_AUTH_REDIRECT_URI),
        timeout: 60_000,
      })
      await page.getByRole('button', { name: `Connect to ${CSS_ISSUER}` }).click()

      const tab = await browserTab
      await expect(page.getByText(/opens in your browser/i)).toBeVisible()
      await signInAndConsentAtCss(tab, CSS_ISSUER, JNATIVE_EMAIL, JNATIVE_PASSWORD)
      const callbackUrl = (await callback).headers()['location']

      // The request the provider saw: the native client, returning to the app's scheme.
      const authorize = new URL(requests.find(url => url.includes('/.oidc/auth?')) ?? 'about:blank')
      expect(authorize.searchParams.get('client_id')).toBe(NATIVE_CLIENT_ID_URL)
      expect(authorize.searchParams.get('redirect_uri')).toBe(NATIVE_AUTH_REDIRECT_URI)

      await emitNativeEvent(page, 'App', 'appUrlOpen', { url: callbackUrl })

      await waitForLiveSession(page)
      // The tab is dismissed and the provider picker is out of the way.
      await expect.poll(() => tab.isClosed()).toBe(true)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      // The app's own page never left the app — the provider only ever loaded in the tab.
      expect(appNavigations.length).toBeGreaterThan(0)
      for (const url of appNavigations) expect(new URL(url).origin).toBe(APP_URL)

      // What was banked is a session the app can come back to.
      await page.reload()
      await waitForLiveSession(page)
      await expect(expiredBanner(page)).not.toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  /**
   * The other way out of the tab: closing it. The native app never navigates
   * away, so nothing reloads to reset the provider picker — without the
   * outcome `login()` now reports, it would sit on "Connecting…" for good.
   * No sign-in happens here, so no pod is touched.
   */
  test('J7: closing the system browser mid sign-in leaves the app ready to try again', async ({ browser }) => {
    const ctx = await browser.newContext()
    await runAsNativeApp(ctx)
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      await page.getByRole('button', { name: 'Sync & Share' }).click()
      await page.getByLabel('Search providers or paste your Pod URL').fill(CSS_ISSUER)
      const browserTab = page.waitForEvent('popup')
      await page.getByRole('button', { name: `Connect to ${CSS_ISSUER}` }).click()
      const tab = await browserTab
      await expect(page.getByText(/opens in your browser/i)).toBeVisible()

      // The user backs out of the provider's page; the OS reports the tab gone.
      await tab.close()
      await emitNativeEvent(page, 'Browser', 'browserFinished', {})

      // Back to the list, no error — and still signed out, with nothing lost.
      await expect(page.getByLabel('Search providers or paste your Pod URL')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(accountMenu(page)).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })
})
