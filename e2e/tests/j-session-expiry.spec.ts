import { test, expect } from '../fixtures'
import { accountMenu } from '../helpers/login'

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
    await expect(accountMenu(page).first()).toBeVisible()
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
    await expect(accountMenu(page).first()).toBeVisible({ timeout: 60_000 })
    expect(failures).toBe(3)
    await expect(expiredBanner(page)).not.toBeVisible()
  })
})
