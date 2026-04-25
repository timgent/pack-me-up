/**
 * K – JSON Schema Compatibility
 *
 * Guards against regressions in the JSON data read path during the planned
 * migration to RDF storage. The schema-compat pod is pre-seeded in globalSetup
 * with committed v1 JSON fixtures (e2e/fixtures/). If any field rename or
 * structural change breaks the read path, one of these tests will fail.
 */
import { test, expect } from '../fixtures'

test.describe('K – JSON Schema Compatibility', () => {
  test('K1: question set page loads people and questions from v1 JSON', async ({ schemaCompatPage: page }) => {
    await page.goto('/#/manage-questions')
    await page.waitForLoadState('networkidle')

    // Expand People section (collapsed by default)
    await page.getByRole('button', { name: /People/i }).first().click()
    await expect(page.getByRole('button', { name: 'Add Person' })).toBeVisible({ timeout: 5_000 })

    // "Alice" from the fixture should be in the name input (pattern from f-sync tests)
    const personInputs = page.locator('input[placeholder="Enter person name"]')
    await expect(personInputs.first()).toHaveValue('Alice', { timeout: 20_000 })

    // The question from the fixture should be in the question text input
    const questionInputs = page.locator('input[placeholder="Enter your question"]')
    await expect(questionInputs.first()).toHaveValue('Will you be staying overnight?', { timeout: 10_000 })
  })

  test('K2: individual packing list loads items from v1 JSON', async ({ schemaCompatPage: page }) => {
    await page.goto('/#/view-lists')

    // Wait for pod sync to complete before checking list presence
    await page.waitForSelector('text=Loading packing lists...', { state: 'hidden', timeout: 60_000 })

    // The pre-seeded list should be visible
    await expect(page.getByText('Schema Compat Test Trip')).toBeVisible({ timeout: 10_000 })

    // Navigate into the list
    await page.getByText('Schema Compat Test Trip').click()
    await page.waitForURL(/#\/view-lists\//, { timeout: 8_000 })

    // Items from the fixture should be visible
    await expect(page.getByText('Pyjamas')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Passport')).toBeVisible({ timeout: 5_000 })
  })

  test('K3: new packing list can be created when question set is loaded from v1 JSON', async ({ schemaCompatPage: page }) => {
    // Wait for sync to complete via view-lists (same pattern as K2) before navigating to create.
    // Use the nav link for subsequent navigation (hash change, no full page reload/OIDC re-auth).
    await page.goto('/#/view-lists')
    await page.waitForSelector('text=Loading packing lists...', { state: 'hidden', timeout: 60_000 })

    await page.getByRole('link', { name: 'Create List' }).click()
    await page.waitForURL(/#\/create-packing-list/, { timeout: 5_000 })

    // The question from the fixture should appear as a form question
    await expect(page.getByText('Will you be staying overnight?')).toBeVisible({ timeout: 10_000 })

    // Fill in a name and create the list
    await page.getByPlaceholder('Enter a name for your packing list').fill('K3 New List')
    await page.getByRole('button', { name: 'Create Packing List' }).click()

    // Should navigate to the new list's view page
    await page.waitForURL(/#\/view-lists\//, { timeout: 8_000 })
    await expect(page.getByText('K3 New List')).toBeVisible()
  })
})
