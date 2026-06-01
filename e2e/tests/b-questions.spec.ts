import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'

async function setupWizardAndGoToQuestions(page: import('@playwright/test').Page) {
  await page.goto('/#/wizard')
  await fillPersonRequiredFields(page)
  await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
  // Use role heading to distinguish modal title from toast notification
  await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
  // handle pod prompt
  try {
    await page.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 })
  } catch { /* already dismissed or logged in */ }
  await page.waitForURL(/#\/manage-questions/, { timeout: 8_000 })
}

/** Open the People editing modal via the pencil icon in the legend. */
async function openPeopleModal(page: import('@playwright/test').Page) {
  await page.locator('button[title="Edit people"]').click()
  await expect(page.getByRole('heading', { name: 'Edit People' })).toBeVisible({ timeout: 3_000 })
}

/** Open the Always Needed Items editing modal via the pencil icon in the section header. */
async function openAlwaysNeededModal(page: import('@playwright/test').Page) {
  await page.locator('button[title="Edit always needed items"]').click()
  await expect(page.getByRole('heading', { name: 'Always Needed Items' })).toBeVisible({ timeout: 3_000 })
}

test.describe('B – Editing Questions', () => {
  test('B1: manage-questions page loads with sections', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Use role heading to avoid strict mode (nav links also contain "My Questions & Items")
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible()
    // People edit button is visible in the legend
    await expect(page.locator('button[title="Edit people"]')).toBeVisible()
    // Always Needed Items section is visible
    await expect(page.getByText(/Always Needed Items/i).first()).toBeVisible()
    // Always Needed Items pencil button is visible
    await expect(page.locator('button[title="Edit always needed items"]')).toBeVisible()
  })

  test('B2: add a person to the question set', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Open People modal
    await openPeopleModal(page)
    // Count existing person name inputs
    const personInputs = page.locator('input[placeholder^="Person "]')
    const initialCount = await personInputs.count()
    // Click Add Person
    await page.getByRole('button', { name: '+ Add Person' }).click()
    await expect(personInputs).toHaveCount(initialCount + 1)
    // Fill in the new person's name
    await personInputs.last().fill('Charlie')
    // Save
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Edit People' })).not.toBeVisible({ timeout: 3_000 })
    // The save triggers an async IndexedDB write. Give it time to commit before reload
    // (navigating while the transaction is open aborts it).
    await page.waitForTimeout(800)
    // Reload to confirm persistence
    await page.reload()
    await openPeopleModal(page)
    await expect(personInputs.last()).toHaveValue('Charlie', { timeout: 5_000 })
  })

  test('B3: remove a person from the question set', async ({ freshPage: page }) => {
    // Wizard creates one person "Me" — we need at least 2 to remove one
    await page.goto('/#/wizard')
    const nameInputs = page.locator('input[type="text"]')
    await nameInputs.first().fill('PersonA')
    await fillPersonRequiredFields(page, 0)
    await page.getByRole('button', { name: /Add Another Person/i }).click()
    await nameInputs.nth(1).fill('PersonB')
    await fillPersonRequiredFields(page, 1)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    try { await page.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await page.waitForURL(/#\/manage-questions/, { timeout: 8_000 })
    // Open People modal
    await openPeopleModal(page)
    const personInputs = page.locator('input[placeholder^="Person "]')
    // Verify both people are there
    await expect(personInputs).toHaveCount(2)
    await expect(personInputs.nth(0)).toHaveValue('PersonA')
    await expect(personInputs.nth(1)).toHaveValue('PersonB')
    // Remove person 2 (PersonB) via its × button
    const removeButtons = page.locator('button[title="Remove person"]')
    await removeButtons.nth(1).click()
    await expect(personInputs).toHaveCount(1)
    // Save
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Edit People' })).not.toBeVisible({ timeout: 3_000 })
    // Give the async IndexedDB write time to commit before reload
    await page.waitForTimeout(800)
    // Reload and verify only PersonA remains
    await page.reload()
    await openPeopleModal(page)
    await expect(personInputs).toHaveCount(1)
    await expect(personInputs.first()).toHaveValue('PersonA')
  })

  test('B4: add an always-needed item', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Open Always Needed Items modal
    await openAlwaysNeededModal(page)
    // Click "+ Add Item" to append a new empty item row
    await page.getByRole('button', { name: '+ Add Item' }).click()
    // The new item uses CustomCreatableSelect in inactive mode (.cursor-text).
    // Clicking it transitions to the full react-select (ActiveSelect with autoFocus).
    await page.locator('.cursor-text').last().click()
    // Wait for the actual input inside the react-select control, then focus it explicitly.
    const reactSelectInput = page.locator('.react-select__control').last().locator('input')
    await expect(reactSelectInput).toBeVisible({ timeout: 3_000 })
    await reactSelectInput.click()
    await page.keyboard.type('Passport')
    // Click the first dropdown option containing 'Passport'. Handles both the case where
    // 'Passport' is already a known suggestion (no Create option shown) and where it is new.
    // Menu is portaled to document.body so page.locator searches the whole page.
    const passportOption = page.locator('.react-select__option').filter({ hasText: /Passport/i }).first()
    await expect(passportOption).toBeVisible({ timeout: 5_000 })
    await passportOption.click()
    // Save changes
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: 'Always Needed Items' })).not.toBeVisible({ timeout: 3_000 })
    // Expand the Always Needed Items section to verify the item appears
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    await expect(page.getByText('Passport')).toBeVisible({ timeout: 5_000 })
  })

  test('B5: JSON editor mode toggle is not available (editor is always visual)', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // The JSON editor toggle does not exist in the current UI
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible()
    // No JSON toggle button should be present
    await expect(page.getByRole('button', { name: /^json$|edit.*json/i })).not.toBeVisible()
  })
})
