import { test, expect } from '../fixtures'

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
    // Success modal
    await expect(page.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
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
    // First person already present — set name
    await page.getByLabel('Name').first().fill('Alice')
    // Add second person
    await page.getByRole('button', { name: /Add Another Person/i }).click()
    const nameInputs = page.getByLabel('Name')
    await nameInputs.nth(1).fill('Bob')
    // Generate
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
    // Dismiss pod prompt path
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    await page.getByRole('button', { name: 'Maybe Later' }).click()
    // On manage-questions page, both names should appear
    await expect(page).toHaveURL(/#\/manage-questions/, { timeout: 5_000 })
    await expect(page.getByText('Alice')).toBeVisible()
    await expect(page.getByText('Bob')).toBeVisible()
  })

  test('A4: wizard shows warning when questions already exist and confirmation on submit', async ({ freshPage: page }) => {
    // First run: create questions
    await page.goto('/#/wizard')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    await page.getByRole('button', { name: 'Maybe Later' }).click()
    // Second run: wizard should warn
    await page.goto('/#/wizard')
    await expect(page.getByText(/already have packing list questions/i)).toBeVisible()
    // Submit again → confirmation dialog
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByText('Existing Data Found')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Yes, Override' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })
})
