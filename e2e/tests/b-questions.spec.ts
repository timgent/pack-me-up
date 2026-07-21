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
    // Wait for the react-select control to mount (ActiveSelect renders after activation).
    const reactSelectControl = page.locator('.react-select__control').last()
    await expect(reactSelectControl).toBeVisible({ timeout: 3_000 })
    // Click the control — this is the canonical react-select interaction that reliably
    // opens the dropdown (fires onControlMouseDown → onMenuOpen → setMenuIsOpen(true)).
    await reactSelectControl.click()
    await page.keyboard.type('WaterBottleTest')
    // Click the first dropdown option — should be 'Create "WaterBottleTest"' since this name
    // is not in any wizard-generated suggestion. Menu is portaled to document.body.
    const newItemOption = page.locator('.react-select__option').filter({ hasText: /WaterBottleTest/i }).first()
    await expect(newItemOption).toBeVisible({ timeout: 5_000 })
    await newItemOption.click()
    // Save changes
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: 'Always Needed Items' })).not.toBeVisible({ timeout: 3_000 })
    // Expand the Always Needed Items section to verify the item appears
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    await expect(page.getByText('WaterBottleTest')).toBeVisible({ timeout: 5_000 })
  })

  test('B6: reorder always-needed items via reorder mode', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    await openAlwaysNeededModal(page)

    // Item names render in inactive CustomCreatableSelect mode (.cursor-text)
    const itemTexts = page.locator('.cursor-text')
    // First line only — the row also renders a "×" clear glyph on its own line
    const first = (await itemTexts.first().innerText()).split('\n')[0].trim()
    const second = (await itemTexts.nth(1).innerText()).split('\n')[0].trim()
    expect(first).not.toEqual(second)

    // Enter reorder mode — rows collapse to name + large move buttons
    await page.getByRole('button', { name: 'Reorder items' }).click()
    await expect(page.locator('.cursor-text')).toHaveCount(0)

    // Move the first item down one position, leave reorder mode, save
    await page.locator('button[title="Move item down"]').first().click()
    await page.getByRole('button', { name: 'Finish reordering' }).click()
    await expect(itemTexts.first()).toContainText(second)
    await expect(itemTexts.nth(1)).toContainText(first)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: 'Always Needed Items' })).not.toBeVisible({ timeout: 3_000 })

    // Reopen the modal — the swapped order must have persisted
    await openAlwaysNeededModal(page)
    await expect(itemTexts.first()).toContainText(second)
    await expect(itemTexts.nth(1)).toContainText(first)
  })

  test('B7: reorder always-needed items by dragging the handle', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    await openAlwaysNeededModal(page)

    const itemTexts = page.locator('.cursor-text')
    const first = (await itemTexts.first().innerText()).split('\n')[0].trim()
    const second = (await itemTexts.nth(1).innerText()).split('\n')[0].trim()
    expect(first).not.toEqual(second)

    await page.getByRole('button', { name: 'Reorder items' }).click()
    const rows = page.locator('[data-reorder-row]')
    await expect(rows.first()).toBeVisible()

    // Drag the first row's handle down into the second row, just past its top
    // edge (before its midpoint) so the item lands in exactly slot 1. Aiming
    // deeper would cross the next row's midpoint and overshoot. Low-level mouse
    // moves dispatch pointer events, driving the same code path as touch.
    const handle = page.locator('button[title="Drag to reorder"]').first()
    const hb = (await handle.boundingBox())!
    const sb = (await rows.nth(1).boundingBox())!
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2, sb.y + 4, { steps: 10 })
    await page.mouse.up()

    // The drag reordered the two items (still in reorder mode, rows show plain text)
    await expect(rows.first()).toContainText(second)
    await expect(rows.nth(1)).toContainText(first)

    // Leave reorder mode. dnd-kit suppresses the single click that immediately
    // follows a drop, so retry until reorder mode actually exits (a real user
    // never taps this fast; the suppression is invisible in practice).
    await expect(async () => {
      await page.getByRole('button', { name: 'Finish reordering' }).click()
      await expect(page.getByRole('button', { name: 'Reorder items' })).toBeVisible({ timeout: 1_000 })
    }).toPass()
    await expect(itemTexts.first()).toContainText(second)
    await expect(itemTexts.nth(1)).toContainText(first)

    // Persist and reopen — the dragged order must survive a save round-trip
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: 'Always Needed Items' })).not.toBeVisible({ timeout: 3_000 })
    await openAlwaysNeededModal(page)
    await expect(itemTexts.first()).toContainText(second)
    await expect(itemTexts.nth(1)).toContainText(first)
  })

  test('B5: JSON editor mode toggle is not available (editor is always visual)', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // The JSON editor toggle does not exist in the current UI
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible()
    // No JSON toggle button should be present
    await expect(page.getByRole('button', { name: /^json$|edit.*json/i })).not.toBeVisible()
  })

  test('B6: a freshly set-up user is not shown the template-updates prompt', async ({ freshPage: page }) => {
    // The wizard stamps the current template version, so a brand-new set is
    // already up to date and must not nag the user with "new suggestions".
    await setupWizardAndGoToQuestions(page)
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible()
    await expect(page.getByText(/new suggestion/i)).not.toBeVisible()
    // Reloading (re-reading the persisted set) must not surface it either.
    await page.waitForTimeout(500)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible()
    await expect(page.getByText(/new suggestion/i)).not.toBeVisible()
  })
})
