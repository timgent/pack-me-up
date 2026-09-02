import { test, expect } from '../fixtures'
import { accountMenu, loginToCss, waitForLiveSession } from '../helpers/login'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { JUSER_EMAIL, JUSER_PASSWORD } from '../../playwright.config'

const CSS_ISSUER = process.env.CSS_ISSUER ?? 'http://localhost:4001'
const TEST_POD_NAME = 'testuser'

const isTokenRequest = (url: URL) =>
  url.port === new URL(CSS_ISSUER).port && url.pathname.endsWith('/token')

const expiredBanner = (page: import('@playwright/test').Page) =>
  page.getByText(/session has expired/i).first()

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
})
