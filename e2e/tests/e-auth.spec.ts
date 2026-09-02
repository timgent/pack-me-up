import { test, expect } from '../fixtures'
import { accountMenu, loginToCss, logoutViaAccountMenu, openAccountMenu, waitForLiveSession } from '../helpers/login'

const CSS_ISSUER = process.env.CSS_ISSUER ?? 'http://localhost:4001'
const TEST_EMAIL = 'test@example.com'
const TEST_PASSWORD = 'test1234'

test.describe('E – Solid Pod Authentication', () => {
  test('E1: full login flow completes and shows logged-in state', async ({ freshPage: page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sync & Share' })).toBeVisible()
    await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
    await expect(accountMenu(page)).toBeVisible()
  })

  // The nav bar names the account rather than printing its WebID; the WebID is
  // still reachable, one click into the account menu. See #302.
  test('E1b: the nav bar names the account, with the WebID inside the menu', async ({ authedPage: page }) => {
    const bar = page.getByTestId('nav-bar')
    await expect(bar.getByText(/profile\/card#me/)).toHaveCount(0)

    await openAccountMenu(page)

    await expect(bar.getByText(/testuser\/profile\/card#me/)).toBeVisible()
  })

  test('E1c: the account menu closes on Escape', async ({ authedPage: page }) => {
    await openAccountMenu(page)
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('button', { name: 'Logout' })).not.toBeVisible()
    await expect(accountMenu(page)).toBeFocused()
  })

  test('E2: logout returns to unauthenticated state', async ({ authedPage: page }) => {
    await expect(accountMenu(page)).toBeVisible()
    await logoutViaAccountMenu(page)
    await expect(page.getByRole('button', { name: 'Sync & Share' })).toBeVisible({ timeout: 8_000 })
    await expect(accountMenu(page)).not.toBeVisible()
  })

  test('E3: Backups link appears only when logged in', async ({ authedPage: page }) => {
    await openAccountMenu(page)
    await expect(page.getByRole('link', { name: 'Backups' })).toBeVisible()

    await page.getByRole('button', { name: 'Logout' }).click()

    await expect(page.getByRole('link', { name: 'Backups' })).not.toBeVisible({ timeout: 8_000 })
    await expect(accountMenu(page)).not.toBeVisible()
  })

  test('E4: session restored on page reload', async ({ authedPage: page }) => {
    await expect(accountMenu(page)).toBeVisible()
    await page.reload()
    // Restored, not merely remembered: an offline start shows the account too,
    // so this waits for the session to actually be live again (#342).
    await waitForLiveSession(page, 15_000)
  })
})
