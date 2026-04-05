import { test, expect } from '../fixtures'

async function setupWizardAndGoToQuestions(page: import('@playwright/test').Page) {
  await page.goto('/#/wizard')
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

/** Expand the People section (collapsed by default). */
async function expandPeopleSection(page: import('@playwright/test').Page) {
  const peopleToggle = page.getByRole('button', { name: /People/i }).first()
  await peopleToggle.click()
  // Wait for the section to be expanded (Add Person button becomes visible)
  await expect(page.getByRole('button', { name: 'Add Person' })).toBeVisible({ timeout: 3_000 })
}

/** Expand the Always Needed Items section (collapsed by default). */
async function expandAlwaysNeededSection(page: import('@playwright/test').Page) {
  const alwaysToggle = page.getByRole('button', { name: /Always Needed Items/i }).first()
  await alwaysToggle.click()
  // Wait for the section to be expanded (Add Item button becomes visible)
  await expect(page.getByRole('button', { name: 'Add Item' })).toBeVisible({ timeout: 3_000 })
}

/** Wait for the green "Saved" auto-save indicator (not "All changes saved" which is the idle default). */
async function waitForSaved(page: import('@playwright/test').Page) {
  // The green "Saved" indicator has class text-green-600 and appears after an actual save.
  // Use .first() to avoid strict mode if multiple instances appear (mobile + desktop nav).
  await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
}

test.describe('B – Editing Questions', () => {
  test('B1: manage-questions page loads with sections', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Use role heading to avoid strict mode (nav links also contain "My Questions & Items")
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible()
    // People section header is visible (collapsed) — it's a toggle button
    await expect(page.getByRole('button', { name: /People/i }).first()).toBeVisible()
    // Always Needed Items section is visible (collapsed)
    await expect(page.getByRole('button', { name: /Always Needed Items/i }).first()).toBeVisible()
  })

  test('B2: add a person to the question set', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Expand People section (collapsed by default)
    await expandPeopleSection(page)
    // Count existing name inputs
    const nameInputs = page.locator('input[placeholder="Enter person name"]')
    const initialCount = await nameInputs.count()
    // Click Add Person
    await page.getByRole('button', { name: 'Add Person' }).click()
    // New input should appear
    await expect(nameInputs).toHaveCount(initialCount + 1)
    // Fill in the new person's name
    await nameInputs.nth(initialCount).fill('Charlie')
    // Wait for the green auto-save indicator to appear
    await waitForSaved(page)
    // Reload to confirm persistence
    await page.reload()
    await expandPeopleSection(page)
    await expect(page.locator('input[placeholder="Enter person name"]').last()).toHaveValue('Charlie')
  })

  test('B3: remove a person from the question set', async ({ freshPage: page }) => {
    // Wizard creates one person "Me" — we need at least 2 to remove one
    await page.goto('/#/wizard')
    const nameInputs = page.locator('input[type="text"]')
    await nameInputs.first().fill('PersonA')
    await page.getByRole('button', { name: /Add Another Person/i }).click()
    await nameInputs.nth(1).fill('PersonB')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    try { await page.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await page.waitForURL(/#\/manage-questions/, { timeout: 8_000 })
    // Expand People section
    await expandPeopleSection(page)
    const personInputs = page.locator('input[placeholder="Enter person name"]')
    // Verify both people are there
    await expect(personInputs).toHaveCount(2)
    await expect(personInputs.nth(1)).toHaveValue('PersonB')
    // Click the remove button for Person 2
    await page.getByRole('button', { name: /Remove person 2/i }).click()
    // Wait for the green auto-save indicator
    await waitForSaved(page)
    await page.reload()
    await expandPeopleSection(page)
    await expect(personInputs).toHaveCount(1)
    await expect(personInputs.first()).toHaveValue('PersonA')
  })

  test('B4: add an always-needed item', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Expand "Always Needed Items" section (collapsed by default)
    await expandAlwaysNeededSection(page)
    // Click "Add Item" to add a new empty item row
    await page.getByRole('button', { name: 'Add Item' }).click()
    // The new item uses react-select. Find the last react-select container.
    const newItemSelect = page.locator('.react-select-container').last()
    await expect(newItemSelect).toBeVisible({ timeout: 3_000 })
    // Click to focus, type the item name, then press Enter to create the option
    await newItemSelect.click()
    await page.keyboard.type('Passport')
    await page.keyboard.press('Enter')
    // Wait for the green auto-save indicator
    await waitForSaved(page)
  })

  test('B5: JSON editor mode toggle is not available (editor is always visual)', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // The JSON editor toggle does not exist in the current UI (editorMode has no setter)
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible()
    // No JSON toggle button should be present
    await expect(page.getByRole('button', { name: /^json$|edit.*json/i })).not.toBeVisible()
  })
})
