import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { CSS_ISSUER, FUSER_EMAIL, FUSER_PASSWORD } from '../../playwright.config'

// All F tests share the same pod user and write to overlapping resources.
// Serial mode gives each test exclusive pod access.
test.describe.configure({ mode: 'serial' })

test.describe('F – Solid Pod Sync', () => {
  let page: import('@playwright/test').Page
  let ctx: import('@playwright/test').BrowserContext

  // Shared list names so later tests can use earlier lists as sync-complete controls.
  let f2ListName: string

  // Run wizard once for the entire suite — saves ~20s × 6 tests in CI.
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext()
    page = await ctx.newPage()
    await page.goto('/')
    await loginToCss(page, CSS_ISSUER, FUSER_EMAIL, FUSER_PASSWORD)
    await page.goto('/#/wizard')
    await fillPersonRequiredFields(page)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    try { await page.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    try { await page.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await page.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  // Full login (not storageState) — CSS v7 prompt=none is unreliable for second contexts.
  async function freshLogin(browser: import('@playwright/test').Browser) {
    const freshCtx = await browser.newContext()
    const pg = await freshCtx.newPage()
    await pg.goto('/')
    await loginToCss(pg, CSS_ISSUER, FUSER_EMAIL, FUSER_PASSWORD)
    return { ctx: freshCtx, pg }
  }

  // Navigate to create-packing-list and wait for the form to be ready.
  // Using a targeted element wait avoids the slow networkidle pattern on a busy CSS server.
  async function createList(name: string) {
    await page.goto('/#/create-packing-list')
    await page.getByPlaceholder('Enter a name for your packing list').waitFor({ timeout: 15_000 })
    await page.getByPlaceholder('Enter a name for your packing list').fill(name)
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//, { timeout: 10_000 })
  }

  // Sync to Pod by checking an item (triggers saveWithSyncPrevention → saveToPod).
  // The green indicator disappearing confirms the pod PUT completed — no extra waitForTimeout needed.
  async function syncListToPod() {
    await page.locator('input[type="checkbox"]').first().click()
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
  }

  test('F1: questions sync to Pod after manage-questions edit', async ({ browser }) => {
    await page.goto('/#/manage-questions')
    await page.getByRole('button', { name: /People/i }).click()
    await expect(page.getByRole('button', { name: 'Add Person' })).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Add Person' }).click()
    await page.locator('input[placeholder="Enter person name"]').last().fill('Sync Test Person')
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })

    const { ctx: context2, pg: page2 } = await freshLogin(browser)
    await page2.goto('/#/manage-questions')
    // Expand People section if collapsed (default state after fresh navigation)
    const addPersonBtn = page2.getByRole('button', { name: 'Add Person' })
    if (!await addPersonBtn.isVisible()) {
      await page2.getByRole('button', { name: /People/i }).first().click()
    }
    // usePodSync polls every 5s; wait up to 30s for the form to reflect the Pod update
    await expect(page2.locator('input[placeholder="Enter person name"]').last()).toHaveValue('Sync Test Person', { timeout: 30_000 })
    await context2.close()
  })

  test('F2: packing list visible from second context after Pod sync', async ({ browser }) => {
    f2ListName = `Sync Test List ${Date.now()}`
    await createList(f2ListName)
    await syncListToPod()

    const { ctx: context2, pg: page2 } = await freshLogin(browser)
    await page2.goto('/#/view-lists')
    // Waiting for the specific list name IS the sync-complete signal — no loading-indicator proxy needed.
    // Unique name means no .first() required; the 75s window covers syncAllDataFromPod duration.
    await expect(page2.getByText(f2ListName)).toBeVisible({ timeout: 75_000 })
    await context2.close()
  })

  test('F3: deleting a packing list removes it from Pod', async ({ browser }) => {
    const f3ListName = `Delete Sync Test ${Date.now()}`
    await createList(f3ListName)
    await syncListToPod()

    await page.goto('/#/view-lists')
    await page.locator('.rounded-2xl').filter({ hasText: f3ListName }).getByRole('button', { name: /Delete/i }).click()
    await page.getByRole('button', { name: /^Delete$/ }).click()
    // The list card heading disappearing confirms both local removal and pod delete completed.
    // Using getByRole('heading') avoids matching the dialog text which also contains the list name.
    await expect(page.getByRole('heading').filter({ hasText: f3ListName })).not.toBeVisible({ timeout: 5_000 })

    const { ctx: context2, pg: page2 } = await freshLogin(browser)
    await page2.goto('/#/view-lists')
    // Wait for f2ListName to appear — proves syncAllDataFromPod completed before we check absence
    await expect(page2.getByText(f2ListName)).toBeVisible({ timeout: 75_000 })
    await expect(page2.getByText(f3ListName)).not.toBeVisible()
    await context2.close()
  })

  test('F5: rapid checkbox ticks persist without 409 conflict (stale-rev regression)', async () => {
    await createList(`Rapid Check Test ${Date.now()}`)
    await page.getByRole('button', { name: 'Show Packed' }).click()

    const checkboxes = page.locator('input[type="checkbox"]')
    await expect(checkboxes.first()).toBeVisible()

    // Capture stable name attributes for post-reload assertions
    const box0Name = await checkboxes.nth(0).getAttribute('name')
    const box1Name = await checkboxes.nth(1).getAttribute('name')

    // Add artificial latency to pod PUT requests.
    // This opens the stale-_rev window: local DB save completes in <50 ms (advances _rev),
    // pod PUT completes in ~1500 ms (component state _rev still stale),
    // 800 ms debounce fires between them → second save sees stale _rev.
    await page.route('**/pack-me-up/packing-lists/**', async (route) => {
      if (route.request().method() === 'PUT') {
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
      await route.continue()
    })

    try {
      await checkboxes.nth(0).click()
      // Wait for first debounce + local DB save (~850ms) but not pod PUT (~2300ms)
      await page.waitForTimeout(1000)
      await checkboxes.nth(1).click()

      await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
      await expect(page.locator('span.text-red-600')).not.toBeVisible()

      await page.reload()
      await page.getByRole('button', { name: 'Show Packed' }).click()
      await expect(page.locator(`input[name="${box0Name}"]`)).toBeChecked({ timeout: 5_000 })
      await expect(page.locator(`input[name="${box1Name}"]`)).toBeChecked({ timeout: 5_000 })
    } finally {
      await page.unrouteAll()
    }
  })

  test('F6: custom item added via suggestion card persists in question set after pod sync', async () => {
    await createList(`Suggestion Save Trip ${Date.now()}`)
    // Confirm list content is loaded before interacting (waitForURL fires on URL match, not content render)
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible({ timeout: 15_000 })

    const customItemName = 'super special sunscreen'
    const addItemInput = page.getByPlaceholder('Add new item...').first()
    await addItemInput.fill(customItemName)
    // Use Enter to submit — avoids ambiguity with the "+ Add Guest" button which also matches 'Add'
    await addItemInput.press('Enter')
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })

    await page.goto('/#/create-packing-list')
    // No networkidle — the expect below waits for the content directly
    await expect(page.getByText(/On past trips you added items/)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Review suggestions/i }).click()
    await expect(page.getByText(customItemName)).toBeVisible({ timeout: 3_000 })
    await page.getByRole('button', { name: 'Add' }).first().click()
    await expect(page.getByText(/On past trips you added items/)).not.toBeVisible({ timeout: 10_000 })

    // Wait for a pod sync GET to complete after navigating to manage-questions.
    // This proves the sync loop fired and did not overwrite the locally-saved custom item.
    const syncCycleRead = page.waitForResponse(
      r => r.url().includes('/pack-me-up/') && r.request().method() === 'GET',
      { timeout: 15_000 }
    )
    await page.goto('/#/manage-questions')
    await syncCycleRead
    // Wait for the section button to be ready before clicking
    await expect(page.getByRole('button', { name: /Always Needed Items/i }).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    await expect(page.getByRole('button', { name: 'Add Item', exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText(customItemName)).toBeVisible({ timeout: 3_000 })
  })

  test('F4: item check state visible from second context after Pod sync', async ({ browser }) => {
    const f4ListName = `Check Sync Test ${Date.now()}`
    await createList(f4ListName)
    await syncListToPod()

    const { ctx: context2, pg: page2 } = await freshLogin(browser)
    await page2.goto('/#/view-lists')
    await expect(page2.getByText(f4ListName)).toBeVisible({ timeout: 75_000 })
    await page2.getByText(f4ListName).click()
    await page2.waitForURL(/#\/view-lists\//, { timeout: 8_000 })
    // Wait for list view to load — Show Packed button appears when items are ready (no networkidle)
    await expect(page2.getByRole('button', { name: /Show Packed/i })).toBeVisible({ timeout: 15_000 })
    await page2.getByRole('button', { name: /Show Packed/i }).click()
    await expect(page2.locator('input[type="checkbox"]:checked').first()).toBeVisible({ timeout: 10_000 })
    await context2.close()
  })
})
