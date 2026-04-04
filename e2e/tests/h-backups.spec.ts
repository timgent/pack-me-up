import { test, expect } from '../fixtures'

test.describe('H – Backups', () => {
  async function setupWithList(page: import('@playwright/test').Page) {
    // Run wizard and create a list while logged in
    await page.goto('/#/wizard')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    await page.waitForURL(/#\/create-packing-list/)
    await page.getByLabel('Packing List Name').fill('Backup Test List')
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//)
    // Give pod sync time
    await page.waitForTimeout(3_000)
  }

  test('H1: create a backup appears in the backups list', async ({ authedPage: page }) => {
    await setupWithList(page)
    await page.goto('/#/backups')
    await expect(page.getByRole('button', { name: 'Create Backup' })).toBeVisible()
    await page.getByRole('button', { name: 'Create Backup' }).click()
    // Toast success
    await expect(page.getByText(/backup created/i)).toBeVisible({ timeout: 10_000 })
    // Backup entry appears
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible()
    await expect(page.locator('text=/packing list/')).toBeVisible()
  })

  test('H2: restore from backup replaces current data', async ({ authedPage: page }) => {
    await setupWithList(page)
    await page.goto('/#/backups')
    await page.getByRole('button', { name: 'Create Backup' }).click()
    await expect(page.getByText(/backup created/i)).toBeVisible({ timeout: 10_000 })
    // Handle window.confirm for restore
    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Restore' }).first().click()
    await expect(page.getByText(/restored/i)).toBeVisible({ timeout: 10_000 })
  })

  test('H3: delete a backup removes it from the list', async ({ authedPage: page }) => {
    await page.goto('/#/backups')
    // Ensure at least one backup exists (create one if needed)
    const hasBackups = await page.getByRole('button', { name: 'Restore' }).isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasBackups) {
      await page.getByRole('button', { name: 'Create Backup' }).click()
      await expect(page.getByText(/backup created/i)).toBeVisible({ timeout: 10_000 })
    }
    const initialCount = await page.getByRole('button', { name: 'Restore' }).count()
    await page.getByRole('button', { name: 'Delete' }).first().click()
    await expect(page.getByText(/deleted/i)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(initialCount - 1, { timeout: 5_000 })
  })
})
