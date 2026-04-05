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
    // Always do a fresh login. inrupt's silent-auth (prompt=none) redirect gets stuck on CSS v7,
    // so we can't rely on storageState-based session restoration.
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/')
    await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
    await context.storageState({ path: AUTH_STATE_FILE })
    await page.close()
    await use(context)
    await context.close()
  },

  authedPage: async ({ authedContext }, use) => {
    const page = await authedContext.newPage()
    // The context already has a valid session from authedContext's fresh login.
    // The app will try to restore the session (prompt=none), but since the same
    // CSS process is running and consent was just given, this should succeed quickly.
    // Wait up to 30 seconds for "Logout" to appear.
    await page.goto('/')
    await page.getByRole('button', { name: 'Logout' }).first().waitFor({ state: 'visible', timeout: 30_000 })
    await use(page)
  },
})

export { expect } from '@playwright/test'
