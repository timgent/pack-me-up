import { test, expect } from '../fixtures'

test.describe('D – Navigation & UI', () => {
  test('D1: nav links navigate to the correct pages', async ({ freshPage: page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /My Questions & Items/i }).click()
    await expect(page).toHaveURL(/#\/manage-questions/)

    await page.getByRole('link', { name: /Create List/i }).click()
    await expect(page).toHaveURL(/#\/create-packing-list/)

    await page.getByRole('link', { name: /View Lists/i }).click()
    await expect(page).toHaveURL(/#\/view-lists/)
  })

  test('D2: Backups nav link is hidden when not logged in', async ({ freshPage: page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Backups' })).not.toBeVisible()
  })

  test('D3: mobile hamburger opens and closes the nav', async ({ freshPage: page }) => {
    // Use mobile viewport
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    // Desktop nav links should be hidden
    await expect(page.locator('.md\\:block .space-x-2')).not.toBeVisible()
    // Click hamburger
    await page.getByRole('button', { name: 'Open main menu' }).click()
    // Mobile nav link visible (desktop nav is display:none at this viewport, so only 1 link found)
    await expect(page.getByRole('link', { name: /My Questions & Items/i }).first()).toBeVisible()
    // Click hamburger again to close
    await page.getByRole('button', { name: 'Open main menu' }).click()
    await expect(page.getByRole('link', { name: /My Questions & Items/i }).first()).not.toBeVisible()
  })
})
