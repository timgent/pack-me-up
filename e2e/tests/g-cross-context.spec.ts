import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD } from '../../playwright.config'

// G tests share the same pod user: both run the wizard (writes to the question-set resource)
// and create lists. Parallel execution causes one wizard save to overwrite another mid-test.
test.describe.configure({ mode: 'serial' })

test.describe('G – Cross-context Pod Sync', () => {
  async function freshLogin(browser: import('@playwright/test').Browser) {
    const ctx = await browser.newContext()
    const pg = await ctx.newPage()
    await pg.goto('/')
    await loginToCss(pg, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
    return { ctx, pg }
  }

  async function runWizard(page: import('@playwright/test').Page) {
    await page.goto('/#/wizard')
    await fillPersonRequiredFields(page)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    try { await page.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    try { await page.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await page.waitForURL(/#\/create-packing-list/, { timeout: 5_000 })
  }

  async function createList(page: import('@playwright/test').Page, name: string) {
    // Wait only for the form input (local DB read completes quickly) rather than
    // networkidle — pod sync requests can take a very long time on a busy CSS server
    // after the preceding F-suite tests, causing the full suite to exceed 90 s.
    await page.getByPlaceholder('Enter a name for your packing list').waitFor({ timeout: 30_000 })
    await page.getByPlaceholder('Enter a name for your packing list').fill(name)
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//, { timeout: 8_000 })
  }

  // Sync list to Pod by checking an item (triggers saveWithSyncPrevention → saveToPod)
  async function syncToPod(page: import('@playwright/test').Page) {
    await page.locator('input[type="checkbox"]').first().click()
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })
    await page.waitForTimeout(1_000)
  }

  test('G1: list created in context A appears in context B after Pod sync', async ({ authedPage: page, browser }) => {
    await runWizard(page)
    await createList(page, 'Cross-Context List A')
    // Sync to Pod by checking an item
    await syncToPod(page)

    // Context B: fresh login so session restoration is reliable (storageState is flaky on CSS v7)
    const { ctx: ctxB, pg: pageB } = await freshLogin(browser)
    await pageB.goto('/#/view-lists')
    await pageB.waitForSelector('text=Loading packing lists...', { state: 'hidden', timeout: 60_000 })
    // Use first() and a long timeout: the loading indicator may disappear before
    // syncAllDataFromPod finishes, and serial-block retries can create duplicate list names.
    await expect(pageB.getByText('Cross-Context List A').first()).toBeVisible({ timeout: 60_000 })
    await ctxB.close()
  })

  test('G2: list renamed in context A reflects in context B after Pod sync', async ({ authedPage: page, browser }) => {
    await runWizard(page)
    await createList(page, 'Rename Cross Sync')
    // Sync to Pod first so rename can update the Pod file
    await syncToPod(page)
    // Rename in context A (packing-lists.tsx confirmRenamePackingList calls syncListToPod)
    await page.goto('/#/view-lists')
    // Wait for loadFromPod to complete before renaming to avoid a race condition
    // where loadFromPod finishes after the rename and overwrites the new name
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /Rename/i }).first().click()
    const renameInput = page.locator('[role="dialog"] input[type="text"]')
    await renameInput.clear()
    await renameInput.fill('Renamed Cross Sync')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    // Verify the rename is visible on this page before checking context B
    await expect(page.getByText('Renamed Cross Sync')).toBeVisible({ timeout: 5_000 })
    // Reload page A to confirm pod has the rename (loadFromPod overwrites local from pod)
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Renamed Cross Sync')).toBeVisible({ timeout: 10_000 })

    // Context B: fresh login so session restoration is reliable (storageState is flaky on CSS v7)
    const { ctx: ctxB, pg: pageB } = await freshLogin(browser)
    await pageB.goto('/#/view-lists')
    // Wait for the login sync to finish — the loading text disappears when syncAllDataFromPod completes
    await pageB.waitForSelector('text=Loading packing lists...', { state: 'hidden', timeout: 60_000 })
    await expect(pageB.getByText('Renamed Cross Sync').first()).toBeVisible({ timeout: 60_000 })
    await ctxB.close()
  })
})
