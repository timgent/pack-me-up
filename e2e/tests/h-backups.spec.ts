import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { CSS_ISSUER, HUSER_EMAIL, HUSER_PASSWORD } from '../../playwright.config'
import { expandAllSections, firstItemChip } from '../helpers/packing-list'

// H tests share the same user's backups pod resource; running them in parallel causes
// concurrent creates/deletes to make counts non-deterministic.
test.describe.configure({ mode: 'serial' })

test.describe('H – Backups', () => {
  let page: import('@playwright/test').Page
  let ctx: import('@playwright/test').BrowserContext

  // Run wizard and create a list once for the entire suite — avoids 3 separate wizard runs
  // (one per authedPage) and 2 duplicate pod writes.
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext()
    page = await ctx.newPage()
    await page.goto('/')
    await loginToCss(page, CSS_ISSUER, HUSER_EMAIL, HUSER_PASSWORD)
    await page.goto('/#/wizard')
    await fillPersonRequiredFields(page)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    try { await page.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    await page.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })
    await page.getByPlaceholder('Enter a name for your packing list').waitFor({ timeout: 15_000 })
    await page.getByPlaceholder('Enter a name for your packing list').fill('Backup Test List')
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//, { timeout: 10_000 })
    await expandAllSections(page)
    // Sync to pod via green-indicator cycle (same pattern as F/G/L/M).
    await firstItemChip(page).click()
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('H1: create a backup appears in the backups list', async () => {
    await page.goto('/#/backups')
    await expect(page.getByRole('button', { name: 'Create Backup' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Create Backup' }).click()
    // Toast success
    await expect(page.getByText(/backup created/i)).toBeVisible({ timeout: 10_000 })
    // Backup entry appears
    await expect(page.getByRole('button', { name: 'Restore' }).first()).toBeVisible()
    await expect(page.locator('text=/packing list/').first()).toBeVisible()
  })

  test('H2: restore from backup replaces current data', async () => {
    await page.goto('/#/backups')
    await expect(page.getByRole('button', { name: 'Create Backup' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Create Backup' }).click()
    await expect(page.getByText(/backup created/i)).toBeVisible({ timeout: 10_000 })
    // Handle window.confirm for restore
    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Restore' }).first().click()
    await expect(page.getByText(/backup restored/i)).toBeVisible({ timeout: 10_000 })
  })

  test('H3: delete a backup removes it from the list', async () => {
    await page.goto('/#/backups')
    // Wait for the backups UI to be ready
    await expect(page.getByRole('button', { name: 'Create Backup' })).toBeVisible({ timeout: 15_000 })
    // Create a fresh backup to guarantee at least one exists
    await page.getByRole('button', { name: 'Create Backup' }).click()
    await expect(page.getByText(/backup created/i)).toBeVisible({ timeout: 10_000 })
    // Wait for the newly created backup to appear in the list
    await expect(page.getByRole('button', { name: 'Restore' }).first()).toBeVisible({ timeout: 5_000 })
    const initialCount = await page.getByRole('button', { name: 'Restore' }).count()
    await page.getByRole('button', { name: 'Delete' }).first().click()
    await expect(page.getByText(/deleted/i)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(initialCount - 1, { timeout: 5_000 })
  })
})
