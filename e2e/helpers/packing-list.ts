import { expect, type Locator, type Page } from '@playwright/test'

/**
 * An item's checkbox on the view-list page.
 *
 * Every personal item is a coloured chip, and the `input` inside it is
 * screen-reader-only — so the chip is what gets clicked, which is the same
 * thing a finger hits. A shared item carries a visible box inside the same
 * wrapper, so one locator serves both.
 *
 * Reaching for `input[type="checkbox"]` instead finds an element Playwright
 * cannot click, and waits the full timeout before saying so.
 */
export function itemChips(page: Page): Locator {
    return page.locator('[data-testid^="grid-cell-"]')
}

export function firstItemChip(page: Page): Locator {
    return itemChips(page).first()
}

/** The input behind a chip. Checked state needs no visibility, so this is safe. */
export function chipInput(chip: Locator): Locator {
    return chip.locator('input[type="checkbox"]')
}

/**
 * A chip found again after a reload.
 *
 * The grid's inputs are driven by the form rather than registered against it,
 * so they carry no `name` to hold on to — the item's id in the chip's test id
 * is what survives.
 */
export function chipByTestId(page: Page, testId: string): Locator {
    return page.locator(`[data-testid="${testId}"]`)
}

/** Any chip whose item is packed. */
export function packedChips(page: Page): Locator {
    return page.locator('[data-testid^="grid-cell-"]:has(input:checked)')
}

/**
 * The chips belonging to one person, by the title their label carries.
 *
 * Assert on these rather than on the `input` inside them: the input is
 * screen-reader-only, so `toBeVisible` is false of it even where the control
 * is plainly on screen.
 */
export function chipsForPerson(page: Page, name: string): Locator {
    return page.locator(`[data-testid^="grid-cell-"][title$="for ${name}"]`)
}

/**
 * Open every card on a freshly created list.
 *
 * A long list arrives folded on its first open. That used to need several
 * people to trigger, because the cards were people; now the cards are
 * categories, so a list with one person and a handful of categories folds
 * too — and a folded card has no chips in it at all.
 */
export async function expandAllSections(page: Page): Promise<void> {
    // Waits for a control that is there whether the list arrived folded or not
    await expect(page.getByRole('button', { name: /Show Packed/i })).toBeVisible({ timeout: 15_000 })
    const expandAll = page.getByRole('button', { name: /^Expand all$/ }).first()
    if (await expandAll.count() > 0) await expandAll.click()
}

/**
 * A list's occasional actions — Share, Update from questions — live behind the
 * kebab in the page header, so reaching either starts by opening it.
 *
 * Returns the open menu, so callers can scope a `menuitem` query to it and not
 * to whatever else on the page happens to carry the same word.
 */
export async function openListActions(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'List actions' }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    return menu
}

/** Open the header's actions menu and pick one of its entries. */
export async function chooseListAction(page: Page, action: RegExp | string): Promise<void> {
    const menu = await openListActions(page)
    await menu.getByRole('menuitem', { name: action }).click()
}
