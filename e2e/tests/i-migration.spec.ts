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

  // Shared helper: run the wizard to generate questions (saves to local DB)
  async function generateLocalData(page: import('@playwright/test').Page) {
    await page.goto('/#/wizard')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 10_000 })
    // The Success Modal's backdrop blocks the nav; dismiss it by clicking an action button
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    // For unauthenticated users, a SolidPodPrompt may appear — dismiss it
    try { await page.getByRole('button', { name: /Maybe Later/i }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await page.waitForURL(/#\/manage-questions/, { timeout: 5_000 })
    await page.waitForLoadState('networkidle')
  }

  test('I1: first login with local data shows migration prompt', async ({ browser }) => {
    const localCtx = await browser.newContext()
    const localPage = await localCtx.newPage()
    await generateLocalData(localPage)
    // Log in for the first time with this fresh account (empty Pod)
    await loginToCss(localPage, CSS_ISSUER, migrationEmail, migrationPassword, { waitForLoggedIn: false })
    // DatabaseContext detects: pod empty + local has data → migration prompt
    await expect(
      localPage.getByRole('heading', { name: /You have local data/i })
    ).toBeVisible({ timeout: 15_000 })
    await localCtx.close()
  })

  test('I2: accepting migration makes local data available under pod namespace', async ({ browser }) => {
    const localCtx = await browser.newContext()
    const localPage = await localCtx.newPage()
    await generateLocalData(localPage)
    await loginToCss(localPage, CSS_ISSUER, migrationEmail, migrationPassword, { waitForLoggedIn: false })
    // Accept migration: confirm button text is "Use my local data"
    const dialog = localPage.getByRole('dialog')
    const confirmBtn = dialog.getByRole('button').filter({ hasText: /use my local data|use.*local|local/i }).first()
    await confirmBtn.click({ timeout: 10_000 })
    // Wait for copyAllDataFrom to finish and dialog to close
    await expect(localPage.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
    // Navigate to manage-questions — should see heading (data was copied from local)
    await localPage.goto('/#/manage-questions')
    await localPage.waitForLoadState('networkidle')
    await expect(localPage.getByRole('heading', { name: /My Questions/i })).toBeVisible({ timeout: 5_000 })
    await localCtx.close()
  })

  test('I3: cancelling migration starts fresh in pod namespace', async ({ browser }) => {
    const localCtx = await browser.newContext()
    const localPage = await localCtx.newPage()
    await generateLocalData(localPage)
    await loginToCss(localPage, CSS_ISSUER, migrationEmail, migrationPassword, { waitForLoggedIn: false })
    // Cancel migration: cancel button text is "Start fresh"
    const dialog = localPage.getByRole('dialog')
    const cancelBtn = dialog.getByRole('button').filter({ hasText: /no|cancel|skip|start fresh/i }).first()
    await cancelBtn.click({ timeout: 10_000 })
    // Landing page should show "Get Started" (empty pod namespace)
    await localPage.goto('/')
    await expect(localPage.getByRole('link', { name: /Get Started/i })).toBeVisible({ timeout: 5_000 })
    await localCtx.close()
  })
})
