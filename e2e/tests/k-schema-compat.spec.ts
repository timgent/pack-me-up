/**
 * K – JSON Schema Compatibility
 *
 * Guards against regressions in the JSON data read path during the planned
 * migration to RDF storage. The schema-compat pod is pre-seeded in globalSetup
 * with committed v1 JSON fixtures (e2e/fixtures/). If any field rename or
 * structural change breaks the read path, one of these tests will fail.
 */
import { test, expect } from '@playwright/test'
import { loginToCss } from '../helpers/login'
import { CSS_ISSUER, SCHEMA_COMPAT_EMAIL, SCHEMA_COMPAT_PASSWORD } from '../../playwright.config'

// All K tests share a single login so that:
//   1. CSS only handles one schema-compat OIDC session (avoids session accumulation
//      after the 30+ logins that precede K tests in the workers=1 CI run).
//   2. Login sync (syncAllDataFromPod) runs exactly once — all three tests operate
//      on the same local DB, which is fully populated before any test begins.
// Run serially: K1 migrates the shared schema-compat pod (JSON → RDF); K2/K3
// must start after K1 finishes so they find the .ttl files already in place.
test.describe.configure({ mode: 'serial' })

test.describe('K – JSON Schema Compatibility', () => {
  let page: import('@playwright/test').Page
  let ctx: import('@playwright/test').BrowserContext

  test.beforeAll(async ({ browser }) => {
    // The schema-compat pod is pre-seeded with BOTH JSON fixtures and pre-migrated RDF
    // (including the migration marker) in globalSetup. detectPodDataFormat finds the marker
    // and returns 'rdf', so syncAllDataFromPod just reads the .ttl files — no migration needed.
    // Login sync therefore completes in seconds even under 4-worker CSS load.
    test.setTimeout(120_000)
    ctx = await browser.newContext()
    page = await ctx.newPage()
    await page.goto('/')
    await loginToCss(page, CSS_ISSUER, SCHEMA_COMPAT_EMAIL, SCHEMA_COMPAT_PASSWORD)
    await page.goto('/#/view-lists')
    await expect(page.getByText('Schema Compat Test Trip')).toBeVisible({ timeout: 60_000 })
  })

  test.afterAll(async () => {
    await ctx.close()
  })

  test('K1: question set page loads people and questions from v1 JSON', async () => {
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

  test('K2: individual packing list loads items from v1 JSON', async () => {
    await page.goto('/#/view-lists')
    await page.waitForLoadState('networkidle')

    // The pre-seeded list should be visible (already synced in beforeAll)
    await expect(page.getByText('Schema Compat Test Trip')).toBeVisible({ timeout: 10_000 })

    // Navigate into the list
    await page.getByText('Schema Compat Test Trip').click()
    await page.waitForURL(/#\/view-lists\//, { timeout: 8_000 })

    // Items from the fixture should be visible
    await expect(page.getByText('Pyjamas')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Passport')).toBeVisible({ timeout: 5_000 })
  })

  test('K3: new packing list can be created when question set is loaded from v1 JSON', async () => {
    // Navigate to create-packing-list via nav link (hash change, no OIDC re-auth needed)
    await page.goto('/#/view-lists')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: 'Create List' }).first().click()
    await page.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })

    // The question from the fixture should appear (local DB already has it from beforeAll sync)
    await expect(page.getByText('Will you be staying overnight?')).toBeVisible({ timeout: 15_000 })

    // Wait for background pod sync (usePodSync syncOnMount) to settle before submitting
    await page.waitForLoadState('networkidle')

    // Fill in a name and create the list
    await page.getByPlaceholder('Enter a name for your packing list').fill('K3 New List')
    await page.getByRole('button', { name: 'Create Packing List' }).click()

    // Pod write + navigation
    await page.waitForURL(/#\/view-lists\//, { timeout: 20_000 })
    await expect(page.getByText('K3 New List')).toBeVisible({ timeout: 10_000 })
  })
})
