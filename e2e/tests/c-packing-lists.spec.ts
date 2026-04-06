import { test, expect } from '../fixtures'

async function runWizard(page: import('@playwright/test').Page) {
  await page.goto('/#/wizard')
  await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
  await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Create My First Packing List/i }).click()
  try { await page.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 }) } catch { /* ok */ }
  await page.waitForURL(/#\/create-packing-list/, { timeout: 5_000 })
}

async function createList(page: import('@playwright/test').Page, name: string) {
  // Wait for the question set to load (questions appear on the page)
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('Enter a name for your packing list').fill(name)
  await page.getByRole('button', { name: 'Create Packing List' }).click()
  // Navigates to /view-lists/:id
  await page.waitForURL(/#\/view-lists\//, { timeout: 8_000 })
}

test.describe('C – Packing Lists', () => {
  test('C1: create a packing list navigates to the new list view', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Beach Holiday')
    await expect(page.getByText('Beach Holiday')).toBeVisible()
  })

  test('C2: check item as packed persists on reload', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Test Trip')
    // Click the first checkbox (use click() not check() - item hides after packing, making check() stale)
    await page.locator('input[type="checkbox"]').first().click()
    // Wait for auto-save indicator
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    // Reload and show packed items to verify the item is still checked
    await page.reload()
    await page.getByRole('button', { name: 'Show Packed' }).click()
    await expect(page.locator('input[type="checkbox"]').first()).toBeChecked()
  })

  test('C3: uncheck a packed item', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Test Trip 2')
    // Click the first checkbox to pack the item
    await page.locator('input[type="checkbox"]').first().click()
    // Wait for auto-save to complete and indicator to disappear
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })
    // Show packed items, then uncheck
    await page.getByRole('button', { name: 'Show Packed' }).click()
    await page.locator('input[type="checkbox"]').first().click()
    // Wait for the unpack auto-save to complete
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })
    await page.reload()
    await expect(page.locator('input[type="checkbox"]').first()).not.toBeChecked()
  })

  test('C4: rename a packing list', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Old Name')
    await page.goto('/#/view-lists')
    await page.getByRole('button', { name: /Rename/i }).first().click()
    // Rename modal input
    const renameInput = page.locator('[role="dialog"] input[type="text"]')
    await renameInput.clear()
    await renameInput.fill('New Name')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('New Name')).toBeVisible()
    await expect(page.getByText('Old Name')).not.toBeVisible()
  })

  test('C5: duplicate a packing list', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Original List')
    await page.goto('/#/view-lists')
    await page.getByRole('button', { name: /Duplicate/i }).first().click()
    await expect(page.getByText(/Copy of Original List/i)).toBeVisible({ timeout: 5_000 })
  })

  test('C6: delete a packing list with confirmation', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'To Delete')
    await page.goto('/#/view-lists')
    await expect(page.getByText('To Delete')).toBeVisible()
    await page.getByRole('button', { name: /Delete/i }).first().click()
    // Confirmation dialog
    await expect(page.getByText(/Are you sure.*delete/i)).toBeVisible()
    await page.getByRole('button', { name: /^Delete$/ }).click()
    // Use heading selector to avoid matching the confirmation dialog text
    await expect(page.getByRole('heading', { name: /To Delete/i })).not.toBeVisible({ timeout: 5_000 })
  })
})
