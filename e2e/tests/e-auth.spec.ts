import { test, expect } from '../fixtures'
import { loginToCss } from '../helpers/login'

const CSS_ISSUER = process.env.CSS_ISSUER ?? 'http://localhost:4001'
const TEST_EMAIL = 'test@example.com'
const TEST_PASSWORD = 'test1234'

test.describe('E – Solid Pod Authentication', () => {
  test('E1: full login flow completes and shows logged-in state', async ({ freshPage: page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Login with Solid Pod' })).toBeVisible()
    await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
    // webId should be displayed (use .first() to avoid strict mode violations when multiple elements match)
    await expect(page.getByText(/testuser.*profile|profile.*testuser/i).or(
      page.locator('span:has-text("localhost:4001/testuser")')
    ).first()).toBeVisible()
  })

  test('E2: logout returns to unauthenticated state', async ({ authedPage: page }) => {
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page.getByRole('button', { name: 'Login with Solid Pod' })).toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('button', { name: 'Logout' })).not.toBeVisible()
  })

  test('E3: Backups nav link appears only when logged in', async ({ authedPage: page }) => {
    await expect(page.getByRole('link', { name: 'Backups' })).toBeVisible()
    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page.getByRole('link', { name: 'Backups' })).not.toBeVisible({ timeout: 8_000 })
  })

  test('E4: session restored on page reload', async ({ authedPage: page }) => {
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
    await page.reload()
    // Session should be restored from storage
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 15_000 })
  })
})
