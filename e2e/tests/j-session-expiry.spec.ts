import { test, expect } from '../fixtures'
import { loginToCss } from '../helpers/login'

const CSS_ISSUER = process.env.CSS_ISSUER ?? 'http://localhost:4001'
const TEST_EMAIL = 'test@example.com'
const TEST_PASSWORD = 'test1234'

test.describe('J – Session Expiry', () => {
  test('J1: session expired banner shows when pod returns 401', async ({ authedPage: page }) => {
    // Invalidate the Solid session by clearing OIDC tokens from storage
    // The app stores solid-client-authn session info in sessionStorage
    await page.evaluate(() => {
      // Clear all OIDC-related storage so next Pod request returns 401
      const keysToRemove: string[] = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key) keysToRemove.push(key)
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k))
      // Also clear relevant localStorage entries
      const lsKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes('solid') || key.includes('oidc') || key.includes('inrupt'))) {
          lsKeys.push(key)
        }
      }
      lsKeys.forEach(k => localStorage.removeItem(k))
    })
    // Trigger a Pod operation by navigating to a page that loads from Pod
    await page.goto('/#/view-lists')
    // The session-expired banner or re-login prompt should appear
    // The SessionExpiredBanner component shows when session expires
    await expect(
      page.getByText(/session expired|login again|re-login/i)
    ).toBeVisible({ timeout: 15_000 })
  })
})
