import { test, expect } from '../fixtures'

const CSS_POD_BASE = process.env.CSS_ISSUER
  ? `${process.env.CSS_ISSUER}/testuser/`
  : 'http://localhost:4001/testuser/'

test.describe('F – Solid Pod Sync', () => {
  // Helper to run the wizard while logged in
  async function runWizardLoggedIn(page: import('@playwright/test').Page) {
    await page.goto('/#/wizard')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    await page.waitForURL(/#\/create-packing-list/, { timeout: 5_000 })
  }

  test('F1: questions sync to Pod after wizard completes', async ({ authedPage: page }) => {
    await runWizardLoggedIn(page)
    // Wait a moment for sync (auto-save + pod upload)
    await page.waitForTimeout(3_000)
    // Verify the questions file exists in the pod
    const fileUrl = `${CSS_POD_BASE}pack-me-up/packing-list-questions.json`
    const exists = await page.evaluate(async (url: string) => {
      try {
        const res = await fetch(url, { credentials: 'include' })
        return res.ok
      } catch { return false }
    }, fileUrl)
    expect(exists).toBe(true)
  })

  test('F2: packing list syncs to Pod after creation', async ({ authedPage: page, browser }) => {
    await runWizardLoggedIn(page)
    await page.getByLabel('Packing List Name').fill('Sync Test List')
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//, { timeout: 5_000 })
    // Wait for sync
    await page.waitForTimeout(4_000)
    // Open a second context with same auth state and check the list appears
    const context2 = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const page2 = await context2.newPage()
    await page2.goto('/#/view-lists')
    await expect(page2.getByText('Sync Test List')).toBeVisible({ timeout: 15_000 })
    await context2.close()
  })

  test('F3: deleting a packing list removes it from Pod', async ({ authedPage: page, browser }) => {
    // Create a list first
    await runWizardLoggedIn(page)
    await page.getByLabel('Packing List Name').fill('Delete Sync Test')
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//)
    await page.waitForTimeout(3_000)
    // Delete via view-lists
    await page.goto('/#/view-lists')
    await page.getByRole('button', { name: /Delete/i }).first().click()
    await page.getByRole('button', { name: /^Delete$/ }).click()
    await page.waitForTimeout(3_000)
    // Second context: list should not appear
    const context2 = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const page2 = await context2.newPage()
    await page2.goto('/#/view-lists')
    // Give it time to load from Pod
    await page2.waitForTimeout(5_000)
    await expect(page2.getByText('Delete Sync Test')).not.toBeVisible()
    await context2.close()
  })

  test('F4: item check state syncs to Pod', async ({ authedPage: page, browser }) => {
    await runWizardLoggedIn(page)
    await page.getByLabel('Packing List Name').fill('Check Sync Test')
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//)
    // Check first item
    const firstCheckbox = page.locator('input[type="checkbox"]').first()
    await firstCheckbox.check()
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 8_000 })
    // Wait for pod sync (poll interval is 5s)
    await page.waitForTimeout(8_000)
    // Second context: item should be checked
    const context2 = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const page2 = await context2.newPage()
    await page2.goto('/#/view-lists')
    await page2.getByText('Check Sync Test').click()
    await page2.waitForURL(/#\/view-lists\//)
    await page2.waitForTimeout(3_000)
    // The item should be checked (and hidden unless "Show Packed" is clicked)
    await page2.getByRole('button', { name: /Show Packed/i }).click()
    await expect(page2.locator('input[type="checkbox"]:checked').first()).toBeVisible({ timeout: 5_000 })
    await context2.close()
  })
})
