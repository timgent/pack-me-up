import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { chipInput, chipsForPerson, chooseListAction, expandAllSections, firstItemChip, openListActions } from '../helpers/packing-list'
import { personEmojiAt } from '../../src/edit-questions/person-emoji'

async function runWizard(page: import('@playwright/test').Page) {
  await page.goto('/#/wizard')
  await fillPersonRequiredFields(page)
  await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
  await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Create My First Packing List/i }).click()
  await page.waitForURL(/#\/create-packing-list/, { timeout: 5_000 })
}

/** Open a list card's kebab menu and pick one of its actions. */
async function chooseCardAction(page: import('@playwright/test').Page, listName: string, action: RegExp | string) {
  await page.getByRole('button', { name: `More actions for ${listName}` }).click()
  await page.getByRole('menuitem', { name: action }).click()
}

async function createList(page: import('@playwright/test').Page, name: string) {
  // Wait for the question set to load (questions appear on the page)
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Packing List Name').fill(name)
  await page.getByRole('button', { name: 'Create Packing List' }).click()
  // Navigates to /view-lists/:id
  await page.waitForURL(/#\/view-lists\//, { timeout: 8_000 })
  // A list long enough to arrive as a wall of cards opens folded
  await expandAllSections(page)
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
    // Click the chip, not the input inside it: the input is screen-reader-only
    await firstItemChip(page).click()
    // Wait for auto-save indicator
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    // Reload and show packed items to verify the item is still checked
    await page.reload()
    await page.getByRole('button', { name: 'Show Packed' }).click()
    await expect(chipInput(firstItemChip(page))).toBeChecked()
  })

  test('C3: uncheck a packed item', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Test Trip 2')
    // Click the chip to pack the item
    await firstItemChip(page).click()
    // Wait for auto-save to complete and indicator to disappear
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })
    // Show packed items, then uncheck
    await page.getByRole('button', { name: 'Show Packed' }).click()
    await firstItemChip(page).click()
    // Wait for the unpack auto-save to complete
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 5_000 })
    await page.reload()
    await expect(chipInput(firstItemChip(page))).not.toBeChecked()
  })

  test('C4: rename a packing list', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Old Name')
    await page.goto('/#/view-lists')
    await chooseCardAction(page, 'Old Name', /Rename/i)
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
    await chooseCardAction(page, 'Original List', /Duplicate/i)
    await expect(page.getByText('Original List (again!)')).toBeVisible({ timeout: 5_000 })
  })

  test('C6: delete a packing list with confirmation', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'To Delete')
    await page.goto('/#/view-lists')
    await expect(page.getByText('To Delete')).toBeVisible()
    await chooseCardAction(page, 'To Delete', /^Delete$/)
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
    await chooseListAction(page, /Update from questions/i)
    await expect(page.getByRole('button', { name: /Add 1 item/i })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByLabel(/Add GadgetTest/i)).toBeVisible()
    await page.getByRole('button', { name: /Add 1 item/i }).click()

    // The item now appears on the list
    await expect(page.getByText('GadgetTest')).toBeVisible({ timeout: 5_000 })

    // Delete it, then update again — it must not be re-suggested. Removing an
    // item is the row panel's job, reached through the row's own name.
    await page.getByRole('button', { name: 'Edit GadgetTest' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^Remove item$/ }).click()
    await page.getByRole('button', { name: /^Remove$/ }).click()
    await expect(page.getByText('GadgetTest')).not.toBeVisible({ timeout: 5_000 })

    await chooseListAction(page, /Update from questions/i)
    // No preview — the list already matches (the deleted item is not resurrected)
    await expect(page.getByText('This list already matches your questions')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: /Add \d+ item/i })).not.toBeVisible()
  })

  // Open the always-needed row for `itemName` in its inline editor.
  async function editAlwaysNeededItem(page: import('@playwright/test').Page, itemName: string) {
    await page.goto('/#/manage-questions')
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /Always Needed Items/i }).first().click()
    await page.getByTestId('item-row').filter({ hasText: itemName }).first().click()
    const editor = page.getByTestId('item-inline-editor')
    await expect(editor).toBeVisible({ timeout: 3_000 })
    return editor
  }

  /** Put `itemName` on `listUrl` via the update preview, so a later test step can change it. */
  async function seedListWithQuestionItem(
    page: import('@playwright/test').Page,
    listUrl: string,
    itemName: string,
  ) {
    await addAlwaysNeededItem(page, itemName)
    await page.goto(listUrl)
    await chooseListAction(page, /Update from questions/i)
    await page.getByRole('button', { name: /Add 1 item/i }).click()
    await expandAllSections(page)
    await expect(page.getByText(itemName)).toBeVisible({ timeout: 5_000 })
  }

  // The three change kinds beyond "add" — each takes its own path through the
  // matcher, and none of them existed before #304.
  test('C10: a renamed question item is offered as a change, not a second item', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Renaming Trip')
    const listUrl = page.url()
    await seedListWithQuestionItem(page, listUrl, 'RenameMeTest')

    // Rename it in the question set
    const editor = await editAlwaysNeededItem(page, 'RenameMeTest')
    await editor.getByTestId('item-name-field').locator('.cursor-text').click()
    const control = page.locator('.react-select__control').last()
    await control.click()
    // The name field opens seeded with the current name, so it has to be
    // cleared before the new one is typed or the two run together.
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('RenamedTest')
    await page.locator('.react-select__option').filter({ hasText: /RenamedTest/i }).first().click()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForTimeout(800)

    await page.goto(listUrl)
    await expandAllSections(page)
    await chooseListAction(page, /Update from questions/i)

    // Grouped as a change, with the old name shown, rather than as a new item
    await expect(page.getByText('Changed items')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/Renamed from .RenameMeTest./)).toBeVisible()
    await page.getByRole('button', { name: /Apply 1 change/i }).click()

    await expect(page.getByText('RenamedTest')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('RenameMeTest')).not.toBeVisible()

    // And the list now matches, so the rename was applied rather than duplicated
    await chooseListAction(page, /Update from questions/i)
    await expect(page.getByText('This list already matches your questions')).toBeVisible({ timeout: 5_000 })
  })

  test('C11: an item deleted from the questions is offered for removal, unticked', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Shrinking Trip')
    const listUrl = page.url()
    await seedListWithQuestionItem(page, listUrl, 'DeleteMeTest')

    const editor = await editAlwaysNeededItem(page, 'DeleteMeTest')
    await editor.getByRole('button', { name: 'Delete DeleteMeTest' }).click()
    await expect(editor).not.toBeVisible({ timeout: 3_000 })
    await page.waitForTimeout(800)

    await page.goto(listUrl)
    await expandAllSections(page)
    await chooseListAction(page, /Update from questions/i)

    await expect(page.getByText('No longer in your questions')).toBeVisible({ timeout: 5_000 })
    // Removals arrive unticked: nothing comes off the list without being asked for
    const removal = page.getByLabel('Remove DeleteMeTest')
    await expect(removal).not.toBeChecked()
    await expect(page.getByRole('button', { name: 'Update list' })).toBeDisabled()

    await removal.check()
    await page.getByRole('button', { name: /Apply 1 change/i }).click()
    await expect(page.getByText('DeleteMeTest')).not.toBeVisible({ timeout: 5_000 })
  })

  test('C12: an item that becomes shared replaces the personal copy', async ({ freshPage: page }) => {
    await runWizard(page)
    await createList(page, 'Sharing Trip')
    const listUrl = page.url()
    await seedListWithQuestionItem(page, listUrl, 'ShareMeTest')

    const editor = await editAlwaysNeededItem(page, 'ShareMeTest')
    await editor.getByRole('button', { name: 'Toggle shared for ShareMeTest' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForTimeout(800)

    await page.goto(listUrl)
    await expandAllSections(page)
    await chooseListAction(page, /Update from questions/i)

    await expect(page.getByText('Changed items')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/Now shared for everyone/)).toBeVisible()
    await page.getByRole('button', { name: /Apply 1 change/i }).click()

    // Still one item, not two: the personal copy went as the shared one arrived
    await expandAllSections(page)
    await expect(page.getByText('ShareMeTest')).toHaveCount(1, { timeout: 5_000 })
    await chooseListAction(page, /Update from questions/i)
    await expect(page.getByText('This list already matches your questions')).toBeVisible({ timeout: 5_000 })
  })

  test('C9: a person’s chosen colour follows them onto a packing list', async ({ freshPage: page }) => {
    await runWizard(page)

    // Give the one person in the set a colour of their own
    await page.goto('/#/manage-questions')
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible({ timeout: 8_000 })
    await page.locator('button[title="Edit people"]').click()
    await expect(page.getByRole('heading', { name: 'Edit People' })).toBeVisible({ timeout: 3_000 })
    await page.getByRole('button', { name: 'Change appearance for Me' }).click()
    await page.getByRole('group', { name: 'Colour for Me' }).getByRole('button', { name: 'Fuchsia' }).click()
    // The avatar shows the choice before the modal is even saved
    await expect(page.getByRole('button', { name: 'Change appearance for Me' })
        .getByTestId('person-avatar')).toHaveClass(/bg-fuchsia-500/)
    await page.getByRole('button', { name: 'Save' }).click()
    // Give the async IndexedDB write time to commit
    await page.waitForTimeout(800)

    // A list made afterwards wears that colour on their cells. There is one
    // person on this list, so there is no filter strip to wear it in — the
    // grid's chips are where the colour has to show.
    await page.goto('/#/create-packing-list')
    await createList(page, 'Colourful Trip')
    // One of theirs, not the first chip on the page: shared items lead a card
    // and their chip belongs to nobody, so it wears nobody's colour.
    const cell = chipsForPerson(page, 'Me').first()
    await expect(cell).toBeVisible({ timeout: 8_000 })
    // Unpacked, so the disc is outlined in their colour rather than filled
    await expect(cell).toHaveClass(/border-fuchsia-300/)
  })
  test('C18: a person’s emoji is theirs from the start, and follows them onto a list', async ({ freshPage: page }) => {
    await runWizard(page)

    await page.goto('/#/manage-questions')
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible({ timeout: 8_000 })
    await page.locator('button[title="Edit people"]').click()
    await expect(page.getByRole('heading', { name: 'Edit People' })).toBeVisible({ timeout: 3_000 })

    // Nobody has chosen anything, and they already have a mark of their own
    const avatar = page.getByRole('button', { name: 'Change appearance for Me' }).getByTestId('person-avatar')
    await expect(avatar).toHaveText(personEmojiAt(0))

    // Pick a different one, and it shows before the modal is even saved
    await page.getByRole('button', { name: 'Change appearance for Me' }).click()
    await page.getByRole('group', { name: 'Emoji for Me' }).getByRole('button', { name: 'Rocket' }).click()
    await expect(avatar).toHaveText('🚀')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForTimeout(800)

    // A list made afterwards wears it on their cells
    await page.goto('/#/create-packing-list')
    await createList(page, 'Rocket Trip')
    const cell = chipsForPerson(page, 'Me').first()
    await expect(cell).toBeVisible({ timeout: 8_000 })
    await expect(cell).toHaveText('🚀')
  })

  test('C19: clearing an emoji puts the person back in their initial', async ({ freshPage: page }) => {
    await runWizard(page)

    await page.goto('/#/manage-questions')
    await page.locator('button[title="Edit people"]').click()
    await expect(page.getByRole('heading', { name: 'Edit People' })).toBeVisible({ timeout: 3_000 })
    await page.getByRole('button', { name: 'Change appearance for Me' }).click()
    await page.getByRole('button', { name: 'No emoji, use their initial' }).click()

    const avatar = page.getByRole('button', { name: 'Change appearance for Me' }).getByTestId('person-avatar')
    await expect(avatar).toHaveText('M')

    // And it survives the round trip through storage, rather than reverting to
    // the default the moment the page is read back
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForTimeout(800)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'My Questions & Items' })).toBeVisible({ timeout: 8_000 })
    await page.locator('button[title="Edit people"]').click()
    await expect(page.getByRole('button', { name: 'Change appearance for Me' })
      .getByTestId('person-avatar')).toHaveText('M', { timeout: 5_000 })
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

    // One strip for the page, naming whose initial is whose — and the control
    // for narrowing the cards to one of them
    const key = page.getByTestId('people-key')
    await expect(key.getByText('Alice')).toBeVisible()
    await expect(key.getByText('Bob')).toBeVisible()
    const firstCard = page.getByTestId('list-section').first()

    // A name both of them need is written once and ticked twice
    const shared = firstCard.getByRole('checkbox', { name: /for Alice$/ }).first()
    const label = (await shared.getAttribute('aria-label'))!.replace(/ for Alice$/, '')
    await expect(firstCard.getByRole('button', { name: `Edit ${label}` })).toHaveCount(1)

    // Ticking one person's chip leaves the other's alone, and it survives a
    // reload. The checkbox itself is behind the chip, so the chip is what gets
    // clicked — same as a finger would.
    await firstCard.getByTitle(`${label} for Alice`).click()
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await page.reload()
    await page.getByRole('button', { name: 'Show Packed' }).click()
    await expect(page.getByRole('checkbox', { name: `${label} for Alice` })).toBeChecked()
    const bobs = page.getByRole('checkbox', { name: `${label} for Bob` })
    if (await bobs.count() > 0) await expect(bobs.first()).not.toBeChecked()
  })

  test('C15b: the people strip narrows the whole list to one person', async ({ freshPage: page }) => {
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
    await createList(page, 'Filter Trip')

    const alice = page.getByTestId('people-key').getByRole('button', { name: /^Alice/ })
    await expect(alice).toBeVisible({ timeout: 8_000 })
    await expect(chipsForPerson(page, 'Bob').first()).toBeVisible()

    // Packing Alice's bag: Bob leaves the page entirely, chips and all
    await alice.click()
    await expect(alice).toHaveAttribute('aria-pressed', 'true')
    await expect(chipsForPerson(page, 'Bob')).toHaveCount(0)
    await expect(chipsForPerson(page, 'Alice').first()).toBeVisible()

    // Her own progress rides on her chip while she is the one being packed for
    await expect(alice).toContainText('/')

    // And Clear puts the list back — a filter is something you are doing, not
    // how this list is kept, so it is never restored on the next visit either
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(chipsForPerson(page, 'Bob').first()).toBeVisible()

    await alice.click()
    await page.reload()
    await expect(chipsForPerson(page, 'Bob').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('people-key').getByRole('button', { name: /^Alice/ }))
      .toHaveAttribute('aria-pressed', 'false')
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

    // A row both of them are on, so it can lose one and get them back
    const card = page.getByTestId('list-section').first()
    const bobsCell = card.locator('[data-testid^="grid-cell-"][title$="for Bob"]').first()
    await expect(bobsCell).toBeVisible({ timeout: 8_000 })
    const label = (await bobsCell.getAttribute('title'))!.replace(/ for Bob$/, '')

    await card.getByRole('button', { name: `Edit ${label}` }).click()
    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()

    // Off: Bob's cell goes, Alice's stays
    await panel.getByRole('checkbox', { name: `Bob needs ${label}` }).uncheck()
    await expect(page.getByRole('checkbox', { name: `${label} for Bob` })).toHaveCount(0, { timeout: 8_000 })
    await expect(page.getByTitle(`${label} for Alice`).first()).toBeVisible()

    // And back on, where it stays put across a reload
    await panel.getByRole('checkbox', { name: `Bob needs ${label}` }).check()
    await panel.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTitle(`${label} for Bob`).first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await page.reload()
    await expect(page.getByTitle(`${label} for Bob`).first()).toBeVisible({ timeout: 8_000 })
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

    await chooseListAction(page, 'Share')
    await expect(page.getByRole('heading', { name: /Sign in to share this list/i })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/Send a friend a link/i)).toBeVisible()

    // Backing out leaves the list exactly as it was
    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(page.getByRole('heading', { name: /Sign in to share this list/i })).toHaveCount(0)
    await expect((await openListActions(page)).getByRole('menuitem', { name: 'Share' })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('C13: both contextual prompts work on a phone-sized screen', async ({ freshPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await runWizard(page)
    await createList(page, 'Mobile Prompt Trip')

    // Share prompt: the modal and both of its buttons fit the viewport
    await chooseListAction(page, 'Share')
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

  test('C17: the sharing page pitches the full setup to a logged-out user, on desktop and on a phone', async ({ freshPage: page }) => {
    // The nav link is the entry point — hiding it logged out is what made
    // whole-setup sharing invisible in the first place
    await page.goto('/#/home')
    await page.getByRole('link', { name: 'Sharing' }).first().click()
    await page.waitForURL(/#\/sharing/, { timeout: 8_000 })

    await expect(page.getByRole('heading', { name: 'Share your full setup' })).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(/let someone else use your questions and lists/i)).toBeVisible()
    await expect(page.getByText(/sharing just one list\?/i)).toBeVisible()
    await expect(page.getByText(/please log in/i)).toHaveCount(0)

    // Sign-in is offered framed around the payoff, and backing out remembers nothing
    await page.getByRole('button', { name: 'Sign in to share your setup' }).click()
    await expect(page.getByRole('heading', { name: /sign in to share your full setup/i })).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(page.getByRole('heading', { name: /sign in to share your full setup/i })).toHaveCount(0)
    expect(await page.evaluate(() => sessionStorage.getItem('pending-sign-in-action'))).toBeNull()

    // Reachable through the hamburger on a phone, and the page fits
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/home')
    await page.getByRole('button', { name: 'Open main menu' }).click()
    await page.getByRole('link', { name: 'Sharing' }).click()
    await expect(page.getByRole('heading', { name: 'Share your full setup' })).toBeVisible({ timeout: 8_000 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('C14: a last minute item moves to its own section and survives a reload', async ({ freshPage: page }) => {
    await runWizard(page)
    // A name with no "last minute" in it, so the assertions below can't be
    // satisfied by the list's own title.
    await createList(page, 'Doorstep Trip')

    const lastMinuteCard = page.getByTestId('list-section').filter({ hasText: 'Last Minute' })
    // Marking lives in the row's panel, reached through the row's own name
    const firstRow = page.getByRole('button', { name: /^Edit / }).first()
    await expect(firstRow).toBeVisible({ timeout: 8_000 })
    const itemName = (await firstRow.getAttribute('aria-label'))!.replace(/^Edit /, '')
    const rowFor = (name: string) => page.getByRole('button', { name: `Edit ${name}` })

    // Nothing is last minute yet, so there is no card for it
    await expect(lastMinuteCard).toHaveCount(0)

    await firstRow.click()
    const panel = page.getByRole('dialog')
    await panel.getByRole('button', { name: /as a last minute item$/ }).click()
    // The item has moved to another card and the panel has gone with its row
    await expect(panel).toBeHidden({ timeout: 8_000 })

    await expect(lastMinuteCard.getByRole('button', { name: `Edit ${itemName}` })).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Pack these just before you go.')).toBeVisible()

    // The mark is saved, not just shown
    await expect(page.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
    await page.reload()
    await expect(lastMinuteCard.getByRole('button', { name: `Edit ${itemName}` })).toBeVisible({ timeout: 8_000 })

    // And it goes back where it came from when unmarked
    await lastMinuteCard.getByRole('button', { name: `Edit ${itemName}` }).click()
    await page.getByRole('dialog').getByRole('button', { name: /with everything else$/ }).click()
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 8_000 })
    await expect(lastMinuteCard).toHaveCount(0)
    await expect(rowFor(itemName)).toBeVisible()
  })
})
