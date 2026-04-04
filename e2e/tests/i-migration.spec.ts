import { test, expect } from '../fixtures'
import { createCssAccount } from '../helpers/css-api'
import { loginToCss } from '../helpers/login'

const CSS_ISSUER = process.env.CSS_ISSUER ?? 'http://localhost:4001'
const CSS_PORT = new URL(CSS_ISSUER).port ? parseInt(new URL(CSS_ISSUER).port) : 4001

test.describe('I – Data Migration', () => {
  // Each test creates a unique account to ensure a clean pod
  let migrationEmail: string
  let migrationPassword: string
  let migrationPodName: string

  test.beforeEach(async () => {
    const id = Date.now()
    migrationEmail = `migration-${id}@example.com`
    migrationPassword = 'migration1234'
    migrationPodName = `migration${id}`
    await createCssAccount(CSS_PORT, migrationEmail, migrationPassword, migrationPodName)
  })

  test('I1: first login with local data shows migration prompt', async ({ browser }) => {
    // Create local data (no login)
    const localCtx = await browser.newContext()
    const localPage = await localCtx.newPage()
    await localPage.goto('/#/wizard')
    await localPage.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(localPage.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
    // Dismiss pod prompt
    await localPage.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 5_000 }).catch(() => {})
    await localPage.waitForURL(/#\/create-packing-list|#\/manage-questions/, { timeout: 5_000 })
    // Now log in for first time with this fresh account
    await loginToCss(localPage, CSS_ISSUER, migrationEmail, migrationPassword)
    // Migration prompt should appear
    await expect(localPage.getByText(/copy.*local|migrate.*data|import.*data/i)
      .or(localPage.getByRole('dialog').getByText(/local data|existing data/i))
    ).toBeVisible({ timeout: 10_000 })
    await localCtx.close()
  })

  test('I2: accepting migration makes local data available under pod namespace', async ({ browser }) => {
    const localCtx = await browser.newContext()
    const localPage = await localCtx.newPage()
    await localPage.goto('/#/wizard')
    await localPage.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(localPage.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
    await localPage.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 5_000 }).catch(() => {})
    await localPage.waitForURL(/#\/create-packing-list|#\/manage-questions/, { timeout: 5_000 })
    await loginToCss(localPage, CSS_ISSUER, migrationEmail, migrationPassword)
    // Accept migration
    const dialog = localPage.getByRole('dialog')
    const confirmBtn = dialog.getByRole('button').filter({ hasText: /copy|yes|migrate|confirm/i }).first()
    await confirmBtn.click({ timeout: 10_000 })
    // Navigate to manage-questions — should see data
    await localPage.goto('/#/manage-questions')
    await expect(localPage.getByText(/questions|who.*packing/i)).toBeVisible({ timeout: 5_000 })
    await localCtx.close()
  })

  test('I3: cancelling migration starts fresh in pod namespace', async ({ browser }) => {
    const localCtx = await browser.newContext()
    const localPage = await localCtx.newPage()
    await localPage.goto('/#/wizard')
    await localPage.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(localPage.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
    await localPage.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 5_000 }).catch(() => {})
    await localPage.waitForURL(/#\/create-packing-list|#\/manage-questions/, { timeout: 5_000 })
    await loginToCss(localPage, CSS_ISSUER, migrationEmail, migrationPassword)
    // Cancel migration
    const dialog = localPage.getByRole('dialog')
    const cancelBtn = dialog.getByRole('button').filter({ hasText: /no|cancel|skip|start fresh/i }).first()
    await cancelBtn.click({ timeout: 10_000 })
    // Landing page should show "Get Started" (empty pod namespace)
    await localPage.goto('/')
    await expect(localPage.getByRole('link', { name: /Get Started/i })).toBeVisible({ timeout: 5_000 })
    await localCtx.close()
  })
})
