import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'

async function runWizard(page: import('@playwright/test').Page) {
  await page.goto('/#/wizard')
  await fillPersonRequiredFields(page)
  await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
  await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Create My First Packing List/i }).click()
  await page.waitForURL(/#\/create-packing-list/, { timeout: 5_000 })
}

async function createList(page: import('@playwright/test').Page, name: string) {
  // Wait for the question set to load (questions appear on the page)
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('Enter a name for your packing list').fill(name)
  await page.getByRole('button', { name: 'Create Packing List' }).click()
  // Navigates to /view-lists/:id
  await page.waitForURL(/#\/view-lists\//, { timeout: 8_000 })
}

test.describe('C – Packing Lists', () => {
  test('C1: create a packing list navigates to the new list view', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Beach Holiday')
    await expect(page.getByText('Beach Holiday')).toBeVisible()
    // The list on screen is the confirmation; no toast repeats it
    await expect(page.getByText('Packing list created successfully!')).not.toBeVisible()
  })

  test('C7: reordered question-set items flow through to the view list page', async ({ freshPage: page }) => {
    await runWizard(page)

    // Reorder the always-needed items: send the second one to the top
    await page.goto('/#/manage-questions')
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    const rows = page.getByTestId('item-row')
    await expect(rows.first()).toBeVisible({ timeout: 5_000 })
    const names = (await rows.allInnerTexts()).map(t => t.split('\n')[0].trim())
    const [first, second] = names
    await page.getByRole('button', { name: 'Organise items' }).click()
    // The move menu is portaled to document.body
    await page.locator('[data-reorder-row]').nth(1).getByTitle('Move item').click()
    await page.getByRole('menuitem', { name: 'Move to top of section' }).click()
    await page.getByRole('button', { name: 'Finish organising' }).click()
    // The move saved as it happened; give the IndexedDB write time to commit.
    await page.waitForTimeout(800)

    // Create a list and check the view page shows the swapped order
    await page.goto('/#/create-packing-list')
    await createList(page, 'Ordered Trip')
    const body = page.locator('body')
    await expect(body).toContainText(first)
    await expect(body).toContainText(second)
    const content = await body.innerText()
    expect(content.indexOf(second)).toBeGreaterThanOrEqual(0)
    expect(content.indexOf(second)).toBeLessThan(content.indexOf(first))
  })

  test('C2: check item as packed persists on reload', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Test Trip')
    // Click the first checkbox (use click() not check() - item hides after packing, making check() stale)
    await page.locator('input[type="checkbox"]').first().click()
    // Wait for auto-save indicator
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    // Reload and show packed items to verify the item is still checked
    await page.reload()
    await page.getByRole('button', { name: 'Show Packed' }).click()
    await expect(page.locator('input[type="checkbox"]').first()).toBeChecked()
  })

  test('C3: uncheck a packed item', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Test Trip 2')
    // Click the first checkbox to pack the item
    await page.locator('input[type="checkbox"]').first().click()
    // Wait for auto-save to complete and indicator to disappear
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })
    // Show packed items, then uncheck
    await page.getByRole('button', { name: 'Show Packed' }).click()
    await page.locator('input[type="checkbox"]').first().click()
    // Wait for the unpack auto-save to complete
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })
    await page.reload()
    await expect(page.locator('input[type="checkbox"]').first()).not.toBeChecked()
  })

  test('C4: rename a packing list', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Old Name')
    await page.goto('/#/view-lists')
    await page.getByRole('button', { name: /Rename/i }).first().click()
    // Rename modal input
    const renameInput = page.locator('[role="dialog"] input[type="text"]')
    await renameInput.clear()
    await renameInput.fill('New Name')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('New Name')).toBeVisible()
    await expect(page.getByText('Old Name')).not.toBeVisible()
  })

  test('C5: duplicate a packing list', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Original List')
    await page.goto('/#/view-lists')
    await page.getByRole('button', { name: /Duplicate/i }).first().click()
    await expect(page.getByText(/Copy of Original List/i)).toBeVisible({ timeout: 5_000 })
  })

  test('C6: delete a packing list with confirmation', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'To Delete')
    await page.goto('/#/view-lists')
    await expect(page.getByText('To Delete')).toBeVisible()
    await page.getByRole('button', { name: /Delete/i }).first().click()
    // Confirmation dialog
    await expect(page.getByText(/Are you sure.*delete/i)).toBeVisible()
    await page.getByRole('button', { name: /^Delete$/ }).click()
    // Use heading selector to avoid matching the confirmation dialog text
    await expect(page.getByRole('heading', { name: /To Delete/i })).not.toBeVisible({ timeout: 5_000 })
  })

  // Add a new always-needed item to the question set via manage-questions.
  async function addAlwaysNeededItem(page: import('@playwright/test').Page, itemName: string) {
    await page.goto('/#/manage-questions')
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    await expect(page.getByTestId('item-row').first()).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: '+ Add item' }).first().click()
    const field = page.getByLabel(/^New item in /)
    await expect(field).toBeVisible({ timeout: 3_000 })
    await field.fill(itemName)
    await field.press('Enter')
    await expect(page.getByText(itemName)).toBeVisible({ timeout: 5_000 })
    // Give the async IndexedDB write time to commit
    await page.waitForTimeout(800)
  }

  test('C8: update an existing list from question-set changes', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Evolving Trip')
    const listUrl = page.url()

    // The new item is not on the list yet
    await expect(page.getByText('GadgetTest')).not.toBeVisible()

    // Add a new always-needed item to the question set, then return to the list
    await addAlwaysNeededItem(page, 'GadgetTest')
    await page.goto(listUrl)
    await expect(page.getByRole('heading', { name: 'Evolving Trip' })).toBeVisible({ timeout: 8_000 })

    // Update from questions surfaces the new item in a preview
    await page.getByRole('button', { name: /Update from questions/i }).click()
    await expect(page.getByRole('button', { name: /Add 1 item/i })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByLabel(/Add GadgetTest/i)).toBeVisible()
    await page.getByRole('button', { name: /Add 1 item/i }).click()

    // The item now appears on the list
    await expect(page.getByText('GadgetTest')).toBeVisible({ timeout: 5_000 })

    // Delete it, then update again — it must not be re-suggested
    await page.getByText('GadgetTest', { exact: true })
      .locator('xpath=ancestor::label[1]/..')
      .getByTitle('Delete item')
      .click()
    await page.getByRole('button', { name: /^Remove$/ }).click()
    await expect(page.getByText('GadgetTest')).not.toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: /Update from questions/i }).click()
    // No preview — the list already matches (the deleted item is not resurrected)
    await expect(page.getByText('This list already matches your questions')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: /Add \d+ item/i })).not.toBeVisible()
  })

  test('C9: a person’s chosen colour follows them onto a packing list', async ({ freshPage: page }) => {
    await runWizard(page)

    // Give the one person in the set a colour of their own
    await page.goto('/#/manage-questions')
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible({ timeout: 8_000 })
    await page.locator('button[title="Edit people"]').click()
    await expect(page.getByRole('heading', { name: 'Edit People' })).toBeVisible({ timeout: 3_000 })
    await page.getByRole('button', { name: 'Change colour for Me' }).click()
    await page.getByRole('group', { name: 'Colour for Me' }).getByRole('button', { name: 'Fuchsia' }).click()
    // The avatar shows the choice before the modal is even saved
    await expect(page.getByRole('button', { name: 'Change colour for Me' })).toHaveClass(/bg-fuchsia-500/)
    await page.getByRole('button', { name: 'Save' }).click()
    // Give the async IndexedDB write time to commit
    await page.waitForTimeout(800)

    // A list made afterwards shows that colour on their card
    await page.goto('/#/create-packing-list')
    await createList(page, 'Colourful Trip')
    const card = page.locator('[data-testid="list-section"]').filter({ hasText: "Me's Items" })
    await expect(card.getByTestId('person-avatar')).toHaveClass(/bg-fuchsia-500/)
    await expect(card).toHaveClass(/border-fuchsia-300/)
  })
  test('C15: category view writes each item once, with a checkbox per person', async ({ freshPage: page }) => {
    // Two people, because a grid with one column is just a list
    await page.goto('/#/wizard')
    await page.fill('[name="people.0.name"]', 'Alice')
    await fillPersonRequiredFields(page, 0)
    await page.getByRole('button', { name: /Add Another Person/i }).click()
    await page.fill('[name="people.1.name"]', 'Bob')
    await fillPersonRequiredFields(page, 1)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    await page.waitForURL(/#\/create-packing-list/, { timeout: 5_000 })
    await createList(page, 'Grid Trip')

    await page.getByRole('button', { name: 'Category View' }).click()

    // A column each, in every card
    const firstCard = page.getByTestId('list-section').first()
    await expect(firstCard.getByRole('columnheader', { name: /Alice/ })).toBeVisible()
    await expect(firstCard.getByRole('columnheader', { name: /Bob/ })).toBeVisible()

    // A name both of them need is written once and ticked twice
    const shared = firstCard.getByRole('checkbox', { name: /for Alice$/ }).first()
    const label = (await shared.getAttribute('aria-label'))!.replace(/ for Alice$/, '')
    await expect(firstCard.getByRole('button', { name: `Edit ${label}` })).toHaveCount(1)

    // Ticking one person's cell leaves the other's alone, and it survives a reload
    await shared.click()
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await page.reload()
    await page.getByRole('button', { name: 'Show Packed' }).click()
    await expect(page.getByRole('checkbox', { name: `${label} for Alice` })).toBeChecked()
    const bobs = page.getByRole('checkbox', { name: `${label} for Bob` })
    if (await bobs.count() > 0) await expect(bobs.first()).not.toBeChecked()
  })

  test('C16: the row panel takes an item off one person and gives it back', async ({ freshPage: page }) => {
    await page.goto('/#/wizard')
    await page.fill('[name="people.0.name"]', 'Alice')
    await fillPersonRequiredFields(page, 0)
    await page.getByRole('button', { name: /Add Another Person/i }).click()
    await page.fill('[name="people.1.name"]', 'Bob')
    await fillPersonRequiredFields(page, 1)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    await page.waitForURL(/#\/create-packing-list/, { timeout: 5_000 })
    await createList(page, 'Panel Trip')
    await page.getByRole('button', { name: 'Category View' }).click()

    // A row both of them are on, so it can lose one and get them back
    const card = page.getByTestId('list-section').first()
    const bobsCell = card.getByRole('checkbox', { name: /for Bob$/ }).first()
    await expect(bobsCell).toBeVisible({ timeout: 8_000 })
    const label = (await bobsCell.getAttribute('aria-label'))!.replace(/ for Bob$/, '')

    await card.getByRole('button', { name: `Edit ${label}` }).click()
    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()

    // Off: Bob's cell goes, Alice's stays
    await panel.getByRole('checkbox', { name: `Bob needs ${label}` }).uncheck()
    await expect(page.getByRole('checkbox', { name: `${label} for Bob` })).toHaveCount(0, { timeout: 8_000 })
    await expect(page.getByRole('checkbox', { name: `${label} for Alice` }).first()).toBeVisible()

    // And back on, where it stays put across a reload
    await panel.getByRole('checkbox', { name: `Bob needs ${label}` }).check()
    await panel.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('checkbox', { name: `${label} for Bob` }).first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await page.reload()
    await expect(page.getByRole('checkbox', { name: `${label} for Bob` }).first()).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('C – Contextual sign-in prompts (logged out)', () => {
  test('C10: the lists index nudges a logged-out user to sync, and stays dismissed for the session', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Sync Nudge Trip')

    await page.goto('/#/view-lists')
    const prompt = page.getByTestId('sync-across-devices-prompt')
    await expect(prompt).toBeVisible({ timeout: 8_000 })
    await expect(prompt).toContainText(/sync across devices/i)

    await prompt.getByRole('button', { name: 'Dismiss sync prompt' }).click()
    await expect(prompt).toHaveCount(0)

    // A reload is the same session, so the nudge stays gone
    await page.reload()
    await expect(page.getByText('Sync Nudge Trip')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('sync-across-devices-prompt')).toHaveCount(0)
  })

  test('C11: the nudge waits until there is a list worth syncing', async ({ freshPage: page }) => {
    await page.goto('/#/view-lists')
    await expect(page.getByText(/No packing lists found/i)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('sync-across-devices-prompt')).toHaveCount(0)
  })

  test('C12: sharing while logged out asks to sign in, framed around sharing', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Share Prompt Trip')

    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.getByRole('heading', { name: /Sign in to share this list/i })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/Send a friend a link/i)).toBeVisible()

    // Backing out leaves the list exactly as it was
    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(page.getByRole('heading', { name: /Sign in to share this list/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
  })

  test('C13: both contextual prompts work on a phone-sized screen', async ({ freshPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await runWizard(page)
    await createList(page, 'Mobile Prompt Trip')

    // Share prompt: the modal and both of its buttons fit the viewport
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    const signInButton = page.getByRole('button', { name: /Sign in to share/i })
    await expect(signInButton).toBeVisible({ timeout: 5_000 })
    const signInBox = await signInButton.boundingBox()
    expect(signInBox!.x).toBeGreaterThanOrEqual(0)
    expect(signInBox!.x + signInBox!.width).toBeLessThanOrEqual(390)
    await page.getByRole('button', { name: 'Not now' }).click()

    // Sync nudge: fits the width, and the dismiss control is reachable
    await page.goto('/#/view-lists')
    const prompt = page.getByTestId('sync-across-devices-prompt')
    await expect(prompt).toBeVisible({ timeout: 8_000 })
    const promptBox = await prompt.boundingBox()
    expect(promptBox!.x + promptBox!.width).toBeLessThanOrEqual(390)
    await prompt.getByRole('button', { name: 'Dismiss sync prompt' }).click()
    await expect(prompt).toHaveCount(0)
  })

  test('C14: a last minute item moves to its own section and survives a reload', async ({ freshPage: page }) => {
    await runWizard(page)
    // A name with no "last minute" in it, so the assertions below can't be
    // satisfied by the list's own title.
    await createList(page, 'Doorstep Trip')

    const lastMinuteCard = page.getByTestId('list-section').filter({ hasText: 'Last Minute' })
    const mark = page.getByRole('button', { name: /Mark .* as a last minute item/ }).first()
    await expect(mark).toBeVisible({ timeout: 8_000 })
    // Nothing is last minute yet, so there is no card for it
    await expect(lastMinuteCard).toHaveCount(0)

    const itemName = (await mark.getAttribute('aria-label'))!
      .replace(/^Mark /, '').replace(/ as a last minute item$/, '')
    await mark.click()

    await expect(lastMinuteCard.getByText(itemName, { exact: true })).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Pack these just before you go.')).toBeVisible()

    // The mark is saved, not just shown
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await page.reload()
    await expect(lastMinuteCard.getByText(itemName, { exact: true })).toBeVisible({ timeout: 8_000 })

    // And it goes back where it came from when unmarked
    await page.getByRole('button', { name: `Remove ${itemName} from the last minute items` }).click()
    await expect(lastMinuteCard).toHaveCount(0)
    await expect(page.getByText(itemName, { exact: true })).toBeVisible()
  })
})
