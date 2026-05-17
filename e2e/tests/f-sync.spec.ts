import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD } from '../../playwright.config'

// All F tests share the same pod user and write to overlapping resources (question-set,
// packing-lists). Running them in parallel causes wizard saves from one test to overwrite
// question-set changes made by another, producing flaky results. Serial mode gives each
// test exclusive access to the pod state.
test.describe.configure({ mode: 'serial' })

test.describe('F – Solid Pod Sync', () => {
  // Creates a fresh authenticated context (full login) instead of using storageState.
  // storageState-based session restoration is unreliable on CSS v7 (prompt=none gets stuck),
  // so we always do a full login for second contexts that need to read from the pod.
  async function freshLogin(browser: import('@playwright/test').Browser) {
    const ctx = await browser.newContext()
    const pg = await ctx.newPage()
    await pg.goto('/')
    await loginToCss(pg, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
    return { ctx, pg }
  }

  async function runWizardLoggedIn(page: import('@playwright/test').Page) {
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
    const { ctx: context2, pg: page2 } = await freshLogin(browser)
    await page2.goto('/#/manage-questions')
    await page2.waitForLoadState('networkidle')
    // Expand People section if collapsed (inputs are conditionally rendered)
    const personInputs = page2.locator('input[placeholder="Enter person name"]')
    if (await personInputs.count() === 0) {
      await page2.getByRole('button', { name: /People/i }).first().click()
    }
    // usePodSync polls every 5s; wait up to 20s for the form to reflect the Pod update
    await expect(personInputs.last()).toHaveValue('Sync Test Person', { timeout: 20_000 })
    await context2.close()
  })

  test('F2: packing list visible from second context after Pod sync', async ({ authedPage: page, browser }) => {
    await runWizardLoggedIn(page)
    await createList(page, 'Sync Test List')
    // Check item to trigger Pod sync (saveWithSyncPrevention → saveToPod)
    await syncListToPod(page)
    // Second context: view-lists loads from Pod (loadFromPod) and shows the list
    const { ctx: context2, pg: page2 } = await freshLogin(browser)
    await page2.goto('/#/view-lists')
    await page2.waitForSelector('text=Loading packing lists...', { state: 'hidden', timeout: 60_000 })
    // Use first() and a long timeout: the loading indicator may disappear before
    // syncAllDataFromPod finishes, and retries can create duplicate list names.
    await expect(page2.getByText('Sync Test List').first()).toBeVisible({ timeout: 60_000 })
    await context2.close()
  })

  test('F3: deleting a packing list removes it from Pod', async ({ authedPage: page, browser }) => {
    await runWizardLoggedIn(page)
    await createList(page, 'Delete Sync Test')
    // Sync to Pod first (required before delete can remove it from Pod)
    await syncListToPod(page)
    // Delete via view-lists — target the specific list by name, not .first()
    await page.goto('/#/view-lists')
    await page.locator('.rounded-2xl').filter({ hasText: /Delete Sync Test/ }).getByRole('button', { name: /Delete/i }).click()
    await page.getByRole('button', { name: /^Delete$/ }).click()
    await page.waitForTimeout(3_000)
    // Second context: list should not appear (Pod has no file, loadFromPod returns nothing)
    const { ctx: context2, pg: page2 } = await freshLogin(browser)
    await page2.goto('/#/view-lists')
    await page2.waitForSelector('text=Loading packing lists...', { state: 'hidden', timeout: 60_000 })
    await expect(page2.getByText('Delete Sync Test')).not.toBeVisible()
    await context2.close()
  })

  test('F5: rapid checkbox ticks persist without 409 conflict (stale-rev regression)', async ({ authedPage: page }) => {
    await runWizardLoggedIn(page)
    await createList(page, 'Rapid Check Test')

    // Keep packed items visible so their checkboxes stay in the DOM while we tick them.
    await page.getByRole('button', { name: 'Show Packed' }).click()

    const checkboxes = page.locator('input[type="checkbox"]')
    await expect(checkboxes.first()).toBeVisible()

    // Capture stable name attributes (items.{id}) for post-reload assertions.
    const box0Name = await checkboxes.nth(0).getAttribute('name')
    const box1Name = await checkboxes.nth(1).getAttribute('name')

    // Add artificial latency to pod PUT requests for the packing-lists container.
    // This opens the stale-_rev window that caused the original bug:
    //   - local DB save completes in <50 ms  → PouchDB advances _rev
    //   - pod PUT completes in ~1 500 ms     → component state _rev still stale
    //   - 800 ms debounce fires between them → second save sees stale _rev
    await page.route('**/pack-me-up/packing-lists/**', async (route) => {
      if (route.request().method() === 'PUT') {
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
      await route.continue()
    })

    // First checkbox: debounce (800 ms) fires → local DB save → pod PUT begins (delayed 1 500 ms).
    await checkboxes.nth(0).click()

    // Wait long enough for the first debounce to fire and local DB save to complete (~850 ms),
    // but NOT long enough for the pod PUT to return (fires at 800 + 1 500 = 2 300 ms).
    // During this window the component-state _rev is one generation behind PouchDB.
    await page.waitForTimeout(1000)

    // Second checkbox while first pod PUT is still in-flight — the exact sequence that
    // previously caused "Document update conflict" 409 errors on the local DB save.
    await checkboxes.nth(1).click()

    // Both saves must complete without surfacing an error status.
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-red-600')).not.toBeVisible()

    // Reload and verify BOTH items persisted.  A silent 409 on the second save returns
    // null from saveWithSyncPrevention, leaving that item unchecked after a reload.
    await page.reload()
    await page.getByRole('button', { name: 'Show Packed' }).click()
    await expect(page.locator(`input[name="${box0Name}"]`)).toBeChecked({ timeout: 5_000 })
    await expect(page.locator(`input[name="${box1Name}"]`)).toBeChecked({ timeout: 5_000 })
  })

  test('F6: custom item added via suggestion card persists in question set after pod sync', async ({ authedPage: page }) => {
    await runWizardLoggedIn(page)
    await createList(page, 'Suggestion Save Trip')

    // Add a custom item (questionId = '' marks it as a suggestion candidate)
    const customItemName = 'super special sunscreen'
    await page.getByPlaceholder('Add new item...').first().fill(customItemName)
    await page.getByRole('button', { name: 'Add' }).first().click()
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })

    // Trigger the suggestion card by navigating to create-packing-list
    await page.goto('/#/create-packing-list')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/On past trips you added items/)).toBeVisible({ timeout: 8_000 })

    // Expand and accept the suggestion (default destination: Always Needed Items)
    await page.getByRole('button', { name: /Review suggestions/i }).click()
    await expect(page.getByText(customItemName)).toBeVisible({ timeout: 3_000 })
    await page.getByRole('button', { name: 'Add' }).first().click()
    // Wait for suggestion card to disappear (item marked reviewed, pod save complete)
    await expect(page.getByText(/On past trips you added items/)).not.toBeVisible({ timeout: 10_000 })

    // Navigate to manage-questions and verify the item survives pod sync
    await page.goto('/#/manage-questions')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    await expect(page.getByRole('button', { name: 'Add Item' })).toBeVisible({ timeout: 3_000 })

    // Wait a full pod-poll cycle (5 s) + buffer so the sync fires.
    // Without the fix the pod would overwrite the local change and the item disappears.
    await page.waitForTimeout(7_000)

    await expect(page.getByText(customItemName)).toBeVisible({ timeout: 3_000 })
  })

  test('F4: item check state visible from second context after Pod sync', async ({ authedPage: page, browser }) => {
    await runWizardLoggedIn(page)
    await createList(page, 'Check Sync Test')
    // Check first item to sync to Pod
    await syncListToPod(page)
    // Give Pod sync time to propagate (poll interval is 5s)
    await page.waitForTimeout(5_000)
    // Second context: load view-lists (triggers loadFromPod which populates local DB from Pod)
    const { ctx: context2, pg: page2 } = await freshLogin(browser)
    await page2.goto('/#/view-lists')
    await page2.waitForSelector('text=Loading packing lists...', { state: 'hidden', timeout: 60_000 })
    // Wait for the list explicitly — the loading indicator may disappear before
    // syncAllDataFromPod finishes, and retries can leave duplicate list names.
    await expect(page2.getByText('Check Sync Test').first()).toBeVisible({ timeout: 60_000 })
    // Navigate to the specific list
    await page2.getByText('Check Sync Test').first().click()
    await page2.waitForURL(/#\/view-lists\//, { timeout: 5_000 })
    await page2.waitForLoadState('networkidle')
    // Show packed items and verify the item is checked
    await page2.getByRole('button', { name: /Show Packed/i }).click()
    await expect(page2.locator('input[type="checkbox"]:checked').first()).toBeVisible({ timeout: 5_000 })
    await context2.close()
  })
})
