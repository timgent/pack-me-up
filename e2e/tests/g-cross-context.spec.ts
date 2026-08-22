import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { CSS_ISSUER, GUSER_EMAIL, GUSER_PASSWORD } from '../../playwright.config'
import { expandAllSections, firstItemChip } from '../helpers/packing-list'

// G tests share the same pod user. Serial mode gives exclusive pod access.
test.describe.configure({ mode: 'serial' })

test.describe('G – Cross-context Pod Sync', () => {
  let page: import('@playwright/test').Page
  let ctx: import('@playwright/test').BrowserContext

  // Run wizard once for the entire suite — saves ~20s × 2 tests in CI.
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext()
    page = await ctx.newPage()
    await page.goto('/')
    await loginToCss(page, CSS_ISSUER, GUSER_EMAIL, GUSER_PASSWORD)
    await page.goto('/#/wizard')
    await fillPersonRequiredFields(page)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    try { await page.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    await page.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  async function freshLogin(browser: import('@playwright/test').Browser) {
    const freshCtx = await browser.newContext()
    const pg = await freshCtx.newPage()
    await pg.goto('/')
    await loginToCss(pg, CSS_ISSUER, GUSER_EMAIL, GUSER_PASSWORD)
    return { ctx: freshCtx, pg }
  }

  // Navigate to create-packing-list and wait for the form (not networkidle).
  async function createList(name: string) {
    await page.goto('/#/create-packing-list')
    await page.getByPlaceholder('Enter a name for your packing list').waitFor({ timeout: 15_000 })
    await page.getByPlaceholder('Enter a name for your packing list').fill(name)
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//, { timeout: 10_000 })
    // The cards are categories now, so even a one-person list is long enough
    // to arrive folded — and a folded card holds no chips to click.
    await expandAllSections(page)
  }

  // Sync to Pod by checking an item. Green indicator disappearing confirms pod PUT is done.
  async function syncToPod() {
    await firstItemChip(page).click()
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
  }

  test('G1: list created in context A appears in context B after Pod sync', async ({ browser }) => {
    const listName = `Cross-Context List A ${Date.now()}`
    await createList(listName)
    await syncToPod()

    const { ctx: ctxB, pg: pageB } = await freshLogin(browser)
    await pageB.goto('/#/view-lists')
    // Unique name — no .first() needed. Appearing here proves syncAllDataFromPod completed.
    await expect(pageB.getByText(listName)).toBeVisible({ timeout: 75_000 })
    await ctxB.close()
  })

  test('G2: list renamed in context A reflects in context B after Pod sync', async ({ browser }) => {
    const ts = Date.now()
    const originalName = `Rename Cross Sync ${ts}`
    const renamedName = `Renamed Cross Sync ${ts}`

    await createList(originalName)
    await syncToPod()

    await page.goto('/#/view-lists')
    // Wait for the list to appear — confirms local DB is populated and no pod write is in flight.
    // packing-lists.tsx has no background pod polling; the only sync is loginSyncVersion (done on login).
    await expect(page.getByText(originalName)).toBeVisible({ timeout: 15_000 })
    // Set up response listener before clicking Save so we don't miss the PUT.
    const renamePodWrite = page.waitForResponse(
      r => r.url().includes('/pack-me-up/packing-lists/') && r.request().method() === 'PUT',
      { timeout: 15_000 }
    )
    await page.locator('.rounded-2xl').filter({ hasText: originalName }).getByRole('button', { name: /Rename/i }).click()
    const renameInput = page.locator('[role="dialog"] input[type="text"]')
    await renameInput.clear()
    await renameInput.fill(renamedName)
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    // Verify the rename is visible on this page before checking context B
    await expect(page.getByText(renamedName)).toBeVisible({ timeout: 5_000 })
    // Wait for the pod PUT to complete before reloading (loadFromPod overwrites local from pod).
    await renamePodWrite
    // Reload page A to confirm pod has the rename
    await page.reload()
    await expect(page.getByText(renamedName)).toBeVisible({ timeout: 10_000 })

    const { ctx: ctxB, pg: pageB } = await freshLogin(browser)
    await pageB.goto('/#/view-lists')
    await expect(pageB.getByText(renamedName)).toBeVisible({ timeout: 75_000 })
    await ctxB.close()
  })
})
