import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'

async function setupWizardAndGoToQuestions(page: import('@playwright/test').Page) {
  await page.goto('/#/wizard')
  await fillPersonRequiredFields(page)
  await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
  // Use role heading to distinguish modal title from toast notification
  await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
  await page.waitForURL(/#\/manage-questions/, { timeout: 8_000 })
}

/** Open the People editing modal via the pencil icon in the legend. */
async function openPeopleModal(page: import('@playwright/test').Page) {
  await page.locator('button[title="Edit people"]').click()
  await expect(page.getByRole('heading', { name: 'Edit People' })).toBeVisible({ timeout: 3_000 })
}

/**
 * Expand the Always Needed Items list. There is no modal behind it any more —
 * the list on the page is the editor, and every change saves as it is made.
 */
async function openAlwaysNeeded(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
  await expect(page.getByTestId('item-row').first()).toBeVisible({ timeout: 5_000 })
}

/** The item names as the read-only list shows them, top to bottom. */
async function itemNames(page: import('@playwright/test').Page): Promise<string[]> {
  const rows = await page.getByTestId('item-row').allInnerTexts()
  return rows.map(t => t.split('\n')[0].trim())
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
    // Its items are edited in place, so there is no pencil into a modal.
    await expect(page.locator('button[title="Edit always needed items"]')).toHaveCount(0)
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
    await openAlwaysNeeded(page)

    // One field at the foot of the list, rather than a modal, a blank row and a
    // Save button.
    await page.getByRole('button', { name: '+ Add item' }).first().click()
    const field = page.getByLabel(/^New item in /)
    await expect(field).toBeVisible({ timeout: 3_000 })
    await field.fill('WaterBottleTest')
    await field.press('Enter')
    await expect(page.getByText('WaterBottleTest')).toBeVisible({ timeout: 5_000 })

    // Saved as it was typed — a reload is the only confirmation needed.
    await page.waitForTimeout(800)
    await page.reload()
    await openAlwaysNeeded(page)
    await expect(page.getByText('WaterBottleTest')).toBeVisible({ timeout: 5_000 })
  })

  test('B6: reorder always-needed items via the move menu', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    await openAlwaysNeeded(page)

    const [first, second] = await itemNames(page)
    expect(first).not.toEqual(second)

    // Organising opens onto its own screen: a drag needs a scroll container it
    // owns, which nested in the page meant a scroll area inside a scroll area.
    await page.getByRole('button', { name: 'Organise items' }).click()
    await expect(page.getByRole('dialog', { name: /^Organise / })).toBeVisible({ timeout: 3_000 })

    // Send the second item to the top of the section, swapping the two.
    // The menu is portaled to document.body.
    await page.locator('[data-reorder-row]').nth(1).getByTitle('Move item').click()
    await page.getByRole('menuitem', { name: 'Move to top of section' }).click()
    await page.getByRole('button', { name: 'Finish organising' }).click()
    expect(await itemNames(page)).toEqual([second, first, ...(await itemNames(page)).slice(2)])

    // The move saved as it happened, so a reload is the whole verification.
    await page.waitForTimeout(800)
    await page.reload()
    await openAlwaysNeeded(page)
    const afterReload = await itemNames(page)
    expect(afterReload[0]).toEqual(second)
    expect(afterReload[1]).toEqual(first)
  })

  test('B7: reorder always-needed items by dragging the handle', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    await openAlwaysNeeded(page)

    const [first, second] = await itemNames(page)
    expect(first).not.toEqual(second)

    await page.getByRole('button', { name: 'Organise items' }).click()
    const rows = page.locator('[data-reorder-row]')
    await expect(rows.first()).toBeVisible()

    // Drag the first row's handle down into the second row, just past its top
    // edge (before its midpoint) so the item lands in exactly slot 1. Aiming
    // deeper would cross the next row's midpoint and overshoot. Low-level mouse
    // moves dispatch pointer events, driving the same code path as touch.
    // Prefix match: the handle's tooltip also mentions moving between sections
    const handle = page.locator('button[title^="Drag to reorder"]').first()
    const hb = (await handle.boundingBox())!
    const sb = (await rows.nth(1).boundingBox())!
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2, sb.y + 4, { steps: 10 })
    await page.mouse.up()

    // The drag reordered the two items (still in organise mode, rows show plain text)
    await expect(rows.first()).toContainText(second)
    await expect(rows.nth(1)).toContainText(first)

    // Leave organise mode. dnd-kit suppresses the single click that immediately
    // follows a drop, so retry until organise mode actually exits (a real user
    // never taps this fast; the suppression is invisible in practice).
    await expect(async () => {
      await page.getByRole('button', { name: 'Finish organising' }).click()
      await expect(page.getByRole('button', { name: 'Organise items' })).toBeVisible({ timeout: 1_000 })
    }).toPass()

    // Persist and reload — the dragged order must survive the round-trip
    await page.waitForTimeout(800)
    await page.reload()
    await openAlwaysNeeded(page)
    const afterReload = await itemNames(page)
    expect(afterReload[0]).toEqual(second)
    expect(afterReload[1]).toEqual(first)
  })

  test('B8: reorder always-needed items from the keyboard', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    await openAlwaysNeeded(page)

    const [first, second] = await itemNames(page)
    expect(first).not.toEqual(second)

    await page.getByRole('button', { name: 'Organise items' }).click()
    const rows = page.locator('[data-reorder-row]')
    await expect(rows.first()).toBeVisible()

    // Space picks the item up, the arrow keys move it, space drops it — no
    // pointer and no per-direction buttons involved. Each step waits for the
    // drag to catch up: a real user cannot press the next key within the same
    // frame, and dnd-kit ignores keys it receives before it has measured.
    const announcements = page.locator('[role="status"][aria-live="assertive"]')
    await page.locator('button[title^="Drag to reorder"]').first().focus()
    await page.keyboard.press('Space')
    await expect(announcements).toContainText(`Picked up ${first}`)
    await page.keyboard.press('ArrowDown')
    await expect(announcements).toContainText('position 2')
    await page.keyboard.press('Space')
    await expect(announcements).toContainText('Dropped')

    await expect(rows.first()).toContainText(second)
    await expect(rows.nth(1)).toContainText(first)

    // Persist and reload — the keyboard move must survive the round-trip
    await page.getByRole('button', { name: 'Finish organising' }).click()
    await page.waitForTimeout(800)
    await page.reload()
    await openAlwaysNeeded(page)
    const afterReload = await itemNames(page)
    expect(afterReload[0]).toEqual(second)
    expect(afterReload[1]).toEqual(first)
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

  test('B9: rename an item in place, without opening the option modal', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Expand the read-only list. Tapping a row used to do nothing — the only way
    // in was the section's pencil, which reopened every item in a modal.
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()

    const firstRow = page.getByTestId('item-row').first()
    await expect(firstRow).toBeVisible({ timeout: 5_000 })
    const originalName = (await firstRow.innerText()).split('\n')[0].trim()
    expect(originalName).not.toEqual('InlineRenameTest')
    await firstRow.click()

    const editor = page.getByTestId('item-inline-editor')
    await expect(editor).toBeVisible({ timeout: 3_000 })

    // Same react-select dance as B4: the name field is a cheap placeholder until
    // it is clicked, then the full control mounts.
    await editor.getByTestId('item-name-field').locator('.cursor-text').click()
    const control = page.locator('.react-select__control').last()
    await expect(control).toBeVisible({ timeout: 3_000 })
    await control.click()
    await page.keyboard.type('InlineRenameTest')
    const created = page.locator('.react-select__option').filter({ hasText: /InlineRenameTest/i }).first()
    await expect(created).toBeVisible({ timeout: 5_000 })
    await created.click()

    await page.getByRole('button', { name: 'Done' }).click()
    await expect(editor).not.toBeVisible({ timeout: 3_000 })

    // The edit saves as it is made, so it must survive a reload with no
    // further confirmation step.
    await page.waitForTimeout(800)
    await page.reload()
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    await expect(page.getByText('InlineRenameTest')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(originalName, { exact: true })).not.toBeVisible()
  })

  test('B10: add an item straight into a named section', async ({ freshPage: page }) => {
    // Contrast with B4, which is the old way in: open the modal, append a blank
    // row, fight react-select, save the whole option — and the row still landed
    // in whichever section came last.
    await setupWizardAndGoToQuestions(page)
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()

    const dayBag = page.getByTestId('item-section').filter({ hasText: 'Day Bag' }).first()
    await expect(dayBag).toBeVisible({ timeout: 5_000 })
    await dayBag.getByTestId('add-to-section').click()

    const field = page.getByLabel('New item in Day Bag')
    await expect(field).toBeVisible({ timeout: 3_000 })
    await field.fill('SectionAddTest')
    await field.press('Enter')

    // It lands under the heading it was typed into, not at the end of the list.
    await expect(dayBag.getByText('SectionAddTest')).toBeVisible({ timeout: 5_000 })
    // And the composer stays, cleared, because items go in in runs.
    await expect(field).toHaveValue('')

    // Adding saves as it goes — no confirmation step to reach for.
    await page.waitForTimeout(800)
    await page.reload()
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    const afterReload = page.getByTestId('item-section').filter({ hasText: 'Day Bag' }).first()
    await expect(afterReload.getByText('SectionAddTest')).toBeVisible({ timeout: 5_000 })
  })

  test('B11: a suggested name brings its section with it', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()

    // The composer at the foot of the list is the one that asks where the item
    // goes, so it is the one a suggestion can answer for.
    await page.getByRole('button', { name: '+ Add item' }).first().click()
    const field = page.getByLabel(/^New item in /)
    await expect(field).toBeVisible({ timeout: 3_000 })

    // "Sunscreen" lives under Day Bag in a question elsewhere in the set;
    // taking the suggestion is what files it there without a second trip.
    await field.fill('sunscr')
    const suggestion = page.getByRole('option', { name: /Sunscreen/ }).first()
    await expect(suggestion).toBeVisible({ timeout: 3_000 })
    await suggestion.click()
    // Scoped to the composer: the page also carries a "Reorder sections"
    // button, and getByLabel matches on substring.
    await expect(page.getByTestId('add-question-item').getByLabel('Section')).toHaveValue('Day Bag')

    await field.press('Enter')
    const dayBag = page.getByTestId('item-section').filter({ hasText: 'Day Bag' }).first()
    await expect(dayBag.getByText('Sunscreen')).toBeVisible({ timeout: 5_000 })
  })

  test('B13: delete an item from the row you are editing', async ({ freshPage: page }) => {
    // Deleting used to mean opening the option's modal and finding the row
    // again; the editor you are already in can do it.
    await setupWizardAndGoToQuestions(page)
    await openAlwaysNeeded(page)

    const before = await itemNames(page)
    const doomed = before[0]
    await page.getByTestId('item-row').first().click()
    const editor = page.getByTestId('item-inline-editor')
    await expect(editor).toBeVisible({ timeout: 3_000 })
    await editor.getByRole('button', { name: `Delete ${doomed}` }).click()
    await expect(editor).not.toBeVisible({ timeout: 3_000 })

    // Tombstoned rather than dropped, so it stays gone across a reload.
    await page.waitForTimeout(800)
    await page.reload()
    await openAlwaysNeeded(page)
    const after = await itemNames(page)
    expect(after).not.toContain(doomed)
    expect(after).toHaveLength(before.length - 1)
  })

  test('B14: create a section, then fill it', async ({ freshPage: page }) => {
    // The section exists as soon as it is named — before anything is in it, and
    // across a reload. It used to live only in the reorder view's own state.
    await setupWizardAndGoToQuestions(page)
    await openAlwaysNeeded(page)

    await page.getByRole('button', { name: '+ Add section' }).first().click()
    const nameField = page.getByLabel('New section name')
    await expect(nameField).toBeVisible({ timeout: 3_000 })
    await nameField.fill('Paperwork')
    await nameField.press('Enter')

    const paperwork = page.getByTestId('item-section').filter({ hasText: 'Paperwork' }).first()
    await expect(paperwork).toBeVisible({ timeout: 5_000 })
    await expect(paperwork.getByText(/Nothing here yet/)).toBeVisible()

    // Empty, and still there after a reload — the point of storing the name.
    await page.waitForTimeout(800)
    await page.reload()
    await openAlwaysNeeded(page)
    const afterReload = page.getByTestId('item-section').filter({ hasText: 'Paperwork' }).first()
    await expect(afterReload).toBeVisible({ timeout: 5_000 })

    // Its own ＋ files the first item straight into it.
    await afterReload.getByTestId('add-to-section').click()
    const field = page.getByLabel('New item in Paperwork')
    await field.fill('BoardingPassTest')
    await field.press('Enter')
    await expect(afterReload.getByText('BoardingPassTest')).toBeVisible({ timeout: 5_000 })
  })

  test('B16: delete a section from its heading, keeping its items', async ({ freshPage: page }) => {
    // Getting rid of a section used to mean opening Organise items and finding
    // its Remove — and a section holding one item could not be removed at all,
    // since the reorder view only opens once a list has two.
    await setupWizardAndGoToQuestions(page)
    await openAlwaysNeeded(page)

    await page.getByRole('button', { name: '+ Add section' }).first().click()
    const nameField = page.getByLabel('New section name')
    await expect(nameField).toBeVisible({ timeout: 3_000 })
    await nameField.fill('Paperwork')
    await nameField.press('Enter')

    const paperwork = page.getByTestId('item-section').filter({ hasText: 'Paperwork' }).first()
    await expect(paperwork).toBeVisible({ timeout: 5_000 })
    await paperwork.getByTestId('add-to-section').click()
    const field = page.getByLabel('New item in Paperwork')
    await field.fill('BoardingPassTest')
    await field.press('Enter')
    await expect(paperwork.getByText('BoardingPassTest')).toBeVisible({ timeout: 5_000 })

    // Its one item is what makes this worth checking: it must survive.
    await paperwork.getByTestId('delete-section').click()
    await expect(page.getByRole('heading', { name: /Delete .Paperwork/ })).toBeVisible({ timeout: 3_000 })
    await page.getByRole('button', { name: 'Delete section', exact: true }).click()

    await expect(page.getByTestId('item-section').filter({ hasText: 'Paperwork' })).toHaveCount(0)
    await expect(page.getByText('BoardingPassTest')).toBeVisible()

    // And it stayed deleted — the name is dropped, not kept as an empty section.
    await page.waitForTimeout(800)
    await page.reload()
    await openAlwaysNeeded(page)
    await expect(page.getByText('BoardingPassTest')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('item-section').filter({ hasText: 'Paperwork' })).toHaveCount(0)
  })

  test('B15: editing an option asks for its name and nothing else', async ({ freshPage: page }) => {
    // The modal used to carry a whole second item editor.
    await setupWizardAndGoToQuestions(page)
    await page.getByTitle('Edit option').first().click()
    await expect(page.getByRole('heading', { name: 'Edit Option' })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByLabel('Answer text')).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Add Item' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Organise items' })).toHaveCount(0)
  })

  test('B12: an answer with no items can take its first one', async ({ freshPage: page }) => {
    // Before, an empty answer had no expander and no input at all: its only way
    // in was the option modal.
    await setupWizardAndGoToQuestions(page)
    // Pinned by position, not by its "No items" hint: adding the item removes
    // that hint, and a locator built on it would stop matching the thing it is
    // meant to be checking.
    const options = page.getByTestId('option-section')
    await expect(options.first()).toBeVisible({ timeout: 5_000 })
    let emptyIndex = -1
    for (let i = 0; i < await options.count(); i++) {
      if (await options.nth(i).getByText('No items').count()) { emptyIndex = i; break }
    }
    expect(emptyIndex).toBeGreaterThanOrEqual(0)
    const emptyOption = options.nth(emptyIndex)
    await emptyOption.getByTestId('option-expand-chevron').click()

    await emptyOption.getByRole('button', { name: '+ Add item' }).click()
    const field = emptyOption.locator('input[role="combobox"]')
    await field.fill('FirstItemTest')
    await field.press('Enter')
    await expect(emptyOption.getByText('FirstItemTest')).toBeVisible({ timeout: 5_000 })
    await expect(emptyOption.getByText('No items')).not.toBeVisible()
  })
})
