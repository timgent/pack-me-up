import { test, expect } from '../fixtures'

test.describe('F – Solid Pod Sync', () => {
  async function runWizardLoggedIn(page: import('@playwright/test').Page) {
    await page.goto('/#/wizard')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    try { await page.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await page.waitForURL(/#\/create-packing-list/, { timeout: 5_000 })
  }

  async function createList(page: import('@playwright/test').Page, name: string) {
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('Enter a name for your packing list').fill(name)
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//, { timeout: 8_000 })
  }

  // Sync a list to Pod by checking an item (triggers saveWithSyncPrevention → saveToPod)
  async function syncListToPod(page: import('@playwright/test').Page) {
    await page.locator('input[type="checkbox"]').first().click()
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })
    // Give Pod upload time to complete
    await page.waitForTimeout(2_000)
  }

  test('F1: questions sync to Pod after manage-questions edit', async ({ authedPage: page, browser }) => {
    await runWizardLoggedIn(page)
    // Navigate to manage-questions and make a change to trigger auto-save to Pod
    await page.goto('/#/manage-questions')
    await page.waitForLoadState('networkidle')
    // Expand People section and add a person to trigger auto-save
    await page.getByRole('button', { name: /People/i }).click()
    await expect(page.getByRole('button', { name: 'Add Person' })).toBeVisible({ timeout: 3_000 })
    await page.getByRole('button', { name: 'Add Person' }).click()
    await page.locator('input[placeholder="Enter person name"]').last().fill('Sync Test Person')
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })
    // Second context: manage-questions should load questions from Pod (via usePodSync polling)
    const context2 = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const page2 = await context2.newPage()
    await page2.goto('/#/manage-questions')
    await page2.waitForLoadState('networkidle')
    // usePodSync polls every 5s; wait for it to fetch questions from Pod and update the form
    await page2.waitForTimeout(8_000)
    // Expand the People section (may be collapsed) and check that the person name input is there
    await page2.getByRole('button', { name: /People/i }).first().click()
    // Person names are in input fields; "Sync Test Person" was appended, so it's the last person input
    await expect(page2.locator('input[placeholder="Enter person name"]').last()).toHaveValue('Sync Test Person', { timeout: 5_000 })
    await context2.close()
  })

  test('F2: packing list visible from second context after Pod sync', async ({ authedPage: page, browser }) => {
    await runWizardLoggedIn(page)
    await createList(page, 'Sync Test List')
    // Check item to trigger Pod sync (saveWithSyncPrevention → saveToPod)
    await syncListToPod(page)
    // Second context: view-lists loads from Pod (loadFromPod) and shows the list
    const context2 = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const page2 = await context2.newPage()
    await page2.goto('/#/view-lists')
    await page2.waitForLoadState('networkidle')
    await page2.waitForTimeout(3_000)
    await expect(page2.getByText('Sync Test List')).toBeVisible({ timeout: 8_000 })
    await context2.close()
  })

  test('F3: deleting a packing list removes it from Pod', async ({ authedPage: page, browser }) => {
    await runWizardLoggedIn(page)
    await createList(page, 'Delete Sync Test')
    // Sync to Pod first (required before delete can remove it from Pod)
    await syncListToPod(page)
    // Delete via view-lists
    await page.goto('/#/view-lists')
    await page.getByRole('button', { name: /Delete/i }).first().click()
    await page.getByRole('button', { name: /^Delete$/ }).click()
    await page.waitForTimeout(3_000)
    // Second context: list should not appear (Pod has no file, loadFromPod returns nothing)
    const context2 = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const page2 = await context2.newPage()
    await page2.goto('/#/view-lists')
    await page2.waitForLoadState('networkidle')
    await page2.waitForTimeout(3_000)
    await expect(page2.getByText('Delete Sync Test')).not.toBeVisible()
    await context2.close()
  })

  test('F4: item check state visible from second context after Pod sync', async ({ authedPage: page, browser }) => {
    await runWizardLoggedIn(page)
    await createList(page, 'Check Sync Test')
    // Check first item to sync to Pod
    await syncListToPod(page)
    // Give Pod sync time to propagate (poll interval is 5s)
    await page.waitForTimeout(5_000)
    // Second context: load view-lists (triggers loadFromPod which populates local DB from Pod)
    const context2 = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const page2 = await context2.newPage()
    await page2.goto('/#/view-lists')
    await page2.waitForLoadState('networkidle')
    await page2.waitForTimeout(3_000)
    // Navigate to the specific list
    await page2.getByText('Check Sync Test').click()
    await page2.waitForURL(/#\/view-lists\//, { timeout: 5_000 })
    await page2.waitForLoadState('networkidle')
    // Show packed items and verify the item is checked
    await page2.getByRole('button', { name: /Show Packed/i }).click()
    await expect(page2.locator('input[type="checkbox"]:checked').first()).toBeVisible({ timeout: 5_000 })
    await context2.close()
  })
})
