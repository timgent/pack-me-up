import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { CSS_ISSUER, FUSER_EMAIL, FUSER_PASSWORD } from '../../playwright.config'
import { chipByTestId, chipInput, firstItemChip, itemChips, packedChips } from '../helpers/packing-list'

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

  // A list long enough to arrive as a wall of cards opens folded the first time
  // it is seen, so there is no item to reach for until it is opened.
  async function openAllSections(target: import('@playwright/test').Page = page) {
    // waitForURL fires on the URL change, before the view has rendered — wait for
    // a control that is there whether the list arrived folded or not, otherwise
    // this looks for the Expand all button before there is one.
    await expect(target.getByRole('button', { name: /Show Packed/i })).toBeVisible({ timeout: 15_000 })
    const expandAll = target.getByRole('button', { name: /^Expand all$/ }).first()
    if (await expandAll.count() > 0) await expandAll.click()
  }

  // Sync to Pod by checking an item (triggers saveWithSyncPrevention → saveToPod).
  // The green indicator disappearing confirms the pod PUT completed — no extra waitForTimeout needed.
  async function syncListToPod() {
    await openAllSections()
    await firstItemChip(page).click()
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
  }

  test('F1: questions sync to Pod after manage-questions edit', async ({ browser }) => {
    await page.goto('/#/manage-questions')
    // Open People modal via pencil icon
    await page.locator('button[title="Edit people"]').click()
    await expect(page.getByRole('heading', { name: 'Edit People' })).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: '+ Add Person' }).click()
    await page.locator('input[placeholder^="Person "]').last().fill('Sync Test Person')
    // Wait for the pod PUT to complete — set up the promise before clicking Save
    const putDone = page.waitForResponse(
      resp => resp.url().includes('packing-list-questions') && resp.request().method() === 'PUT',
      { timeout: 15_000 }
    )
    await page.getByRole('button', { name: 'Save' }).click()
    await putDone

    const { ctx: context2, pg: page2 } = await freshLogin(browser)
    await page2.goto('/#/manage-questions')
    // PersonLegend shows person names — wait up to 30s for the pod poll to reflect the update
    await expect(page2.getByText('Sync Test Person')).toBeVisible({ timeout: 30_000 })
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
    await openAllSections()
    await page.getByRole('button', { name: 'Show Packed' }).click()

    const chips = itemChips(page)
    await expect(chips.first()).toBeVisible()

    // The grid's inputs are driven by the form rather than registered against
    // it, so they carry no `name` to hold on to — the item's id in the chip's
    // test id is what survives a reload.
    const box0Id = (await chips.nth(0).getAttribute('data-testid'))!
    const box1Id = (await chips.nth(1).getAttribute('data-testid'))!

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
      await chips.nth(0).click()
      // Wait for first debounce + local DB save (~850ms) but not pod PUT (~2300ms)
      await page.waitForTimeout(1000)
      await chips.nth(1).click()

      await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
      await expect(page.locator('span.text-red-600')).not.toBeVisible()

      await page.reload()
      // The list reopens as it was left, so packed items are already showing —
      // clicking "Show Packed" again would be clicking "Hide Packed".
      await expect(page.getByRole('button', { name: 'Hide Packed' })).toBeVisible({ timeout: 10_000 })
      await expect(chipInput(chipByTestId(page, box0Id))).toBeChecked({ timeout: 5_000 })
      await expect(chipInput(chipByTestId(page, box1Id))).toBeChecked({ timeout: 5_000 })
    } finally {
      await page.unrouteAll()
    }
  })

  test('F6: custom item added via suggestion card persists in question set after pod sync', async () => {
    await createList(`Suggestion Save Trip ${Date.now()}`)
    await openAllSections()
    // Confirm list content is loaded before interacting (waitForURL fires on URL match, not content render)
    await expect(firstItemChip(page)).toBeVisible({ timeout: 15_000 })

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
    // Register listener before clicking Add so we don't miss the question-set PUT.
    // Waiting for this confirms the pod has the new data before any sync-loop GET can
    // race against it and overwrite the locally-saved custom item (the regression this tests).
    const questionSetWrite = page.waitForResponse(
      r => r.url().includes('/pack-me-up/packing-list-questions') && r.request().method() === 'PUT',
      { timeout: 30_000 }
    )
    await page.getByRole('button', { name: 'Add' }).first().click()
    await expect(page.getByText(/On past trips you added items/)).not.toBeVisible({ timeout: 10_000 })
    await questionSetWrite

    await page.goto('/#/manage-questions')
    // Wait for the page to load
    await expect(page.getByRole('heading', { name: /My Questions & Items/i })).toBeVisible({ timeout: 10_000 })
    // Expand the Always Needed Items section to see its items
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    await expect(page.getByText(customItemName)).toBeVisible({ timeout: 5_000 })
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
    // Fresh context, so this is a first open here too — the list arrives folded
    await openAllSections(page2)
    await page2.getByRole('button', { name: /Show Packed/i }).click()
    await expect(packedChips(page2).first()).toBeVisible({ timeout: 10_000 })
    await context2.close()
  })

  // F3 deletes with only one device that has ever seen the list. The bug this
  // covers needs a *second* device that still holds a local copy: its login sync
  // saw a list on the device but not on the pod, called it local-only and
  // uploaded it again, so the delete undid itself everywhere.
  test('F7: a list deleted on one device is not resurrected by another that still has it', async ({ browser }) => {
    // A second list that is never deleted: seeing it arrive is how a device that
    // reads the pod from scratch signals that its sync has finished, so the
    // absence checks below cannot pass just by being early.
    const keeperListName = `Delete Resurrect Control ${Date.now()}`
    await createList(keeperListName)
    await syncListToPod()

    const f7ListName = `Delete Resurrect Test ${Date.now()}`
    await createList(f7ListName)
    await syncListToPod()

    // Device B: log in and let the list land in its local database.
    const { ctx: contextB, pg: pageB } = await freshLogin(browser)
    await pageB.goto('/#/view-lists')
    await expect(pageB.getByText(f7ListName)).toBeVisible({ timeout: 75_000 })

    // Device A: delete the list.
    await page.goto('/#/view-lists')
    await page.locator('.rounded-2xl').filter({ hasText: f7ListName }).getByRole('button', { name: /Delete/i }).click()
    await page.getByRole('button', { name: /^Delete$/ }).click()
    await expect(page.getByRole('heading').filter({ hasText: f7ListName })).not.toBeVisible({ timeout: 5_000 })

    // Device B: reload so its login sync runs again against the pod. Before the
    // fix this is where the list came back — and went back to the pod with it.
    // The card starts out on screen, so the wait is for the sync to take it
    // away; there is no window in which this passes by being early.
    await pageB.goto('/#/view-lists')
    await pageB.reload()
    await expect(pageB.getByRole('heading').filter({ hasText: f7ListName })).not.toBeVisible({ timeout: 75_000 })

    // Device C: a device that has never seen the list reads the pod from
    // scratch, so what it shows is exactly what device B left on the pod. The
    // keeper list arriving proves that read finished.
    const { ctx: contextC, pg: pageC } = await freshLogin(browser)
    await pageC.goto('/#/view-lists')
    await expect(pageC.getByText(keeperListName)).toBeVisible({ timeout: 75_000 })
    await expect(pageC.getByRole('heading').filter({ hasText: f7ListName })).not.toBeVisible()

    await contextB.close()
    await contextC.close()
  })
})
