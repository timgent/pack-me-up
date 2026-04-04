import { test as base, BrowserContext, Page } from '@playwright/test'
import { AUTH_STATE_FILE, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD } from '../playwright.config'
import { loginToCss } from './helpers/login'

type MyFixtures = {
  /** A page with a fresh (empty) browser context — no auth, no local data */
  freshPage: Page
  /** A page already logged into the Solid Pod (uses saved storage state) */
  authedPage: Page
  /** A fresh context with a pre-loaded auth state */
  authedContext: BrowserContext
}

export const test = base.extend<MyFixtures>({
  freshPage: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  authedContext: async ({ browser }, use) => {
    let context: BrowserContext
    try {
      context = await browser.newContext({ storageState: AUTH_STATE_FILE })
    } catch {
      // Auth file doesn't exist — do a fresh login
      context = await browser.newContext()
      const page = await context.newPage()
      await page.goto('/')
      await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
      await context.storageState({ path: AUTH_STATE_FILE })
    }
    await use(context)
    await context.close()
  },

  authedPage: async ({ authedContext }, use) => {
    const page = await authedContext.newPage()
    await page.goto('/')
    // Verify we're still logged in
    const isLoggedIn = await page.locator('button:has-text("Logout")').isVisible({ timeout: 5_000 }).catch(() => false)
    if (!isLoggedIn) {
      // Session expired — re-login
      await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
      await authedContext.storageState({ path: AUTH_STATE_FILE })
    }
    await use(page)
  },
})

export { expect } from '@playwright/test'
