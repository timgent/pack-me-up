import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'

// Helper: wait for the wizard success modal (modal heading, not the toast)
async function waitForWizardSuccess(page: import('@playwright/test').Page) {
  await expect(
    page.getByRole('heading', { name: /Questions Generated Successfully/i })
  ).toBeVisible({ timeout: 10_000 })
}

test.describe('A – Onboarding & Wizard', () => {
  test('A1: fresh start shows Get Started button', async ({ freshPage: page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Get Started with the Wizard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /View Packing Lists/i })).not.toBeVisible()
  })

  test('A2: wizard with one person goes straight to create-packing-list, with no sign-in ask', async ({ freshPage: page }) => {
    await page.goto('/#/wizard')
    // name field is pre-filled with "Me"
    await fillPersonRequiredFields(page)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    // Success modal (use role heading to distinguish from toast)
    await waitForWizardSuccess(page)
    // The reveal names the actual person, and the summary states what was built
    await expect(page.getByText(/Thinking about Me/i)).toBeVisible()
    await expect(page.getByText(/\d+ questions and \d+ items across 1 person/i)).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    // Straight to the list builder — onboarding never asks a logged-out user to sign in
    await expect(page).toHaveURL(/#\/create-packing-list/, { timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Maybe Later' })).toHaveCount(0)
    // Landing page now shows "View Packing Lists"
    await page.goto('/')
    await expect(page.getByRole('link', { name: /View Packing Lists/i })).toBeVisible()
  })

  test('A3: wizard with two people saves both to question set', async ({ freshPage: page }) => {
    await page.goto('/#/wizard')
    // Name inputs are text inputs (label not programmatically linked to input)
    const nameInputs = page.locator('input[type="text"]')
    await nameInputs.first().fill('Alice')
    await fillPersonRequiredFields(page, 0)
    // Add second person
    await page.getByRole('button', { name: /Add Another Person/i }).click()
    await nameInputs.nth(1).fill('Bob')
    await fillPersonRequiredFields(page, 1)
    // Generate
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await waitForWizardSuccess(page)
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    // On manage-questions page, expand People section and verify both names
    await expect(page).toHaveURL(/#\/manage-questions/, { timeout: 5_000 })
    // Open People modal via pencil icon in the legend
    await page.locator('button[title="Edit people"]').click()
    await expect(page.getByRole('heading', { name: 'Edit People' })).toBeVisible({ timeout: 3_000 })
    const personInputs = page.locator('input[placeholder^="Person "]')
    await expect(personInputs.first()).toHaveValue('Alice')
    await expect(personInputs.nth(1)).toHaveValue('Bob')
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('A4: wizard shows warning when questions already exist and confirmation on submit', async ({ freshPage: page }) => {
    // First run: create questions
    await page.goto('/#/wizard')
    await fillPersonRequiredFields(page)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await waitForWizardSuccess(page)
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    // Wait for client-side navigation to manage-questions and let the page settle
    await page.waitForURL(/#\/manage-questions/, { timeout: 8_000 })
    await page.waitForLoadState('networkidle')
    // Second run: wizard should warn (data was saved in first run)
    await page.goto('/#/wizard')
    await expect(page.getByText(/already have packing list questions/i)).toBeVisible({ timeout: 10_000 })
    await fillPersonRequiredFields(page)
    // Submit again → confirmation dialog
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByText('Existing Data Found')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Yes, Override' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  test('A5: re-running the wizard pre-populates the group from the saved question set', async ({ freshPage: page }) => {
    // First run: a person and a pet, so both row types get re-populated
    await page.goto('/#/wizard')
    const nameInputs = page.locator('input[type="text"]')
    await nameInputs.first().fill('Alice')
    await page.selectOption('[name="people.0.ageRange"]', 'Adult')
    await page.selectOption('[name="people.0.gender"]', 'female')
    await page.getByRole('button', { name: /Add a Pet/i }).click()
    await nameInputs.nth(1).fill('Rex')
    await page.selectOption('[name="people.1.species"]', 'dog')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await waitForWizardSuccess(page)
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    await page.waitForURL(/#\/manage-questions/, { timeout: 8_000 })
    // Wait for the saved group to be readable, not merely for the network to go
    // quiet: the question set is written to IndexedDB, so "no requests in
    // flight" says nothing about whether the wizard's next read will find it.
    await expect(page.getByText('Alice', { exact: false }).first()).toBeVisible({ timeout: 10_000 })

    // Second run: the wizard starts from the family set up the first time
    await page.goto('/#/wizard')
    await expect(page.getByText(/filled in the people from your current setup/i)).toBeVisible({ timeout: 10_000 })
    await expect(nameInputs.first()).toHaveValue('Alice')
    await expect(nameInputs.nth(1)).toHaveValue('Rex')
    await expect(page.locator('[name="people.0.ageRange"]')).toHaveValue('Adult')
    await expect(page.locator('[name="people.0.gender"]')).toHaveValue('female')
    await expect(page.locator('[name="people.1.species"]')).toHaveValue('dog')
    await expect(page.getByText('2 in your group')).toBeVisible()
  })

  test('A6: the wizard ends in one success screen, and dismissing it is not a dead end', async ({ freshPage: page }) => {
    await page.goto('/#/wizard')
    await fillPersonRequiredFields(page)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await waitForWizardSuccess(page)

    // Exactly one modal — no Solid Pod upsell queued up behind it
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Maybe Later' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Set Up Solid Pod/i })).toHaveCount(0)

    // Dismissing lands on the questions just generated, not back on the wizard form
    await page.getByRole('button', { name: /^Close$/i }).click()
    await expect(page).toHaveURL(/#\/manage-questions/, { timeout: 5_000 })
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('A7: the success screen fits a phone screen with both actions tappable', async ({ freshPage: page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/#/wizard')
    await fillPersonRequiredFields(page)
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await waitForWizardSuccess(page)

    const createList = page.getByRole('button', { name: /Create My First Packing List/i })
    const refine = page.getByRole('button', { name: /Refine My Packing List Questions/i })
    await expect(createList).toBeVisible({ timeout: 10_000 })
    await expect(refine).toBeVisible()

    // Both buttons stack inside the viewport, with no clipping and a tappable height
    for (const button of [createList, refine]) {
      const box = await button.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(375)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }

    // The primary CTA sits above the secondary action, and still works from here
    const createBox = await createList.boundingBox()
    const refineBox = await refine.boundingBox()
    expect(createBox!.y).toBeLessThan(refineBox!.y)
    await createList.click()
    await expect(page).toHaveURL(/#\/create-packing-list/, { timeout: 5_000 })
  })
})
