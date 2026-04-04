import { test, expect } from '../fixtures'

test.describe('G – Cross-context Pod Sync', () => {
  async function runWizardAndCreateList(page: import('@playwright/test').Page, listName: string) {
    await page.goto('/#/wizard')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    await page.waitForURL(/#\/create-packing-list/)
    await page.getByLabel('Packing List Name').fill(listName)
    await page.getByRole('button', { name: 'Create Packing List' }).click()
    await page.waitForURL(/#\/view-lists\//)
  }

  test('G1: list created in context A appears in context B after polling', async ({ authedPage: page, browser }) => {
    await runWizardAndCreateList(page, 'Cross-Context List A')
    // Wait for pod sync
    await page.waitForTimeout(4_000)

    // Context B: same auth state
    const ctxB = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const pageB = await ctxB.newPage()
    await pageB.goto('/#/view-lists')
    // Pod polling happens on page load (useEffect triggers load from Pod)
    await expect(pageB.getByText('Cross-Context List A')).toBeVisible({ timeout: 15_000 })
    await ctxB.close()
  })

  test('G2: list renamed in context A reflects in context B after polling', async ({ authedPage: page, browser }) => {
    await runWizardAndCreateList(page, 'Rename Cross Sync')
    await page.waitForTimeout(3_000)
    // Rename in context A
    await page.goto('/#/view-lists')
    await page.getByRole('button', { name: /Rename/i }).first().click()
    const renameInput = page.locator('[role="dialog"] input[type="text"]')
    await renameInput.clear()
    await renameInput.fill('Renamed Cross Sync')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await page.waitForTimeout(4_000)

    // Context B: should see renamed list
    const ctxB = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const pageB = await ctxB.newPage()
    await pageB.goto('/#/view-lists')
    await expect(pageB.getByText('Renamed Cross Sync')).toBeVisible({ timeout: 15_000 })
    await ctxB.close()
  })
})
