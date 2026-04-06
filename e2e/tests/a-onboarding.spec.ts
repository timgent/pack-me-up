import { test, expect } from '../fixtures'

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

  test('A2: wizard with one person redirects to create-packing-list after dismissing pod prompt', async ({ freshPage: page }) => {
    await page.goto('/#/wizard')
    // name field is pre-filled with "Me"
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    // Success modal (use role heading to distinguish from toast)
    await waitForWizardSuccess(page)
    await page.getByRole('button', { name: /Create My First Packing List/i }).click()
    // Pod prompt appears for non-logged-in users
    await expect(page.getByText("Great! Your Questions Are Ready")).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Maybe Later' }).click()
    // Should be on create-packing-list page
    await expect(page).toHaveURL(/#\/create-packing-list/, { timeout: 5_000 })
    // Landing page now shows "View Packing Lists"
    await page.goto('/')
    await expect(page.getByRole('link', { name: /View Packing Lists/i })).toBeVisible()
  })

  test('A3: wizard with two people saves both to question set', async ({ freshPage: page }) => {
    await page.goto('/#/wizard')
    // Name inputs are text inputs (label not programmatically linked to input)
    const nameInputs = page.locator('input[type="text"]')
    await nameInputs.first().fill('Alice')
    // Add second person
    await page.getByRole('button', { name: /Add Another Person/i }).click()
    await nameInputs.nth(1).fill('Bob')
    // Generate
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await waitForWizardSuccess(page)
    // Dismiss pod prompt path
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    await page.getByRole('button', { name: 'Maybe Later' }).click()
    // On manage-questions page, expand People section and verify both names
    await expect(page).toHaveURL(/#\/manage-questions/, { timeout: 5_000 })
    // Expand People section (collapsed by default)
    await page.getByRole('button', { name: /People/i }).first().click()
    const personInputs = page.locator('input[placeholder="Enter person name"]')
    await expect(personInputs.first()).toHaveValue('Alice')
    await expect(personInputs.nth(1)).toHaveValue('Bob')
  })

  test('A4: wizard shows warning when questions already exist and confirmation on submit', async ({ freshPage: page }) => {
    // First run: create questions
    await page.goto('/#/wizard')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await waitForWizardSuccess(page)
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    await page.getByRole('button', { name: 'Maybe Later' }).click()
    // Wait for client-side navigation to manage-questions and let the page settle
    await page.waitForURL(/#\/manage-questions/, { timeout: 8_000 })
    await page.waitForLoadState('networkidle')
    // Second run: wizard should warn (data was saved in first run)
    await page.goto('/#/wizard')
    await expect(page.getByText(/already have packing list questions/i)).toBeVisible({ timeout: 10_000 })
    // Submit again → confirmation dialog
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByText('Existing Data Found')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Yes, Override' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })
})
