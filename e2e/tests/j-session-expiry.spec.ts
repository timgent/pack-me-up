import { test, expect } from '../fixtures'

const CSS_ISSUER = process.env.CSS_ISSUER ?? 'http://localhost:4001'
const TEST_POD_NAME = 'testuser'

test.describe('J – Session Expiry', () => {
  test('J1: session expired banner shows when pod returns 401', async ({ authedPage: page }) => {
    // Intercept the webId HEAD request to simulate a 401 (session expired).
    // SolidPodContext's validateSession makes a HEAD request to the webId when
    // the tab becomes visible; a 401 triggers setSessionExpired(true).
    const webIdUrl = `${CSS_ISSUER}/${TEST_POD_NAME}/profile/card`
    await page.route(webIdUrl, route => {
      if (route.request().method() === 'HEAD') {
        return route.fulfill({ status: 401 })
      }
      return route.continue()
    })

    // Simulate the user leaving and returning to the tab (triggers validateSession)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // The SessionExpiredBanner shows "Your session has expired." and a "Log in again" button
    await expect(page.getByText(/session has expired/i).first()).toBeVisible({ timeout: 15_000 })
  })
})
