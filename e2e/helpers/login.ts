import type { Page } from '@playwright/test'

/**
 * Automates the full Solid Pod OAuth login flow through the app's UI.
 *
 * Steps:
 *  1. Click "Login with Solid Pod" in the navigation
 *  2. Open provider selector modal → "Other providers" → "Use Custom Provider"
 *  3. Enter the CSS issuer URL → "Connect"
 *  4. Wait for redirect to CSS, fill login form
 *  5. Approve consent if shown
 *  6. Wait for redirect back to app and session to be established
 */
export async function loginToCss(
  page: Page,
  cssIssuer: string,
  email: string,
  password: string,
): Promise<void> {
  // Open provider selector
  await page.getByRole('button', { name: 'Login with Solid Pod' }).click()
  await page.getByRole('dialog').waitFor()

  // Show other providers
  await page.getByText('Other providers').click()

  // Show custom provider input
  await page.getByRole('button', { name: 'Use Custom Provider' }).click()

  // Fill in CSS URL
  await page.getByLabel('Custom Provider URL').fill(cssIssuer)
  await page.getByRole('button', { name: 'Connect' }).click()

  // Wait for navigation to CSS
  await page.waitForURL(url => url.hostname === 'localhost' && url.port === new URL(cssIssuer).port, { timeout: 15_000 })

  // Fill CSS login form
  await page.locator('input[name="email"], input[type="email"], #email').fill(email)
  await page.locator('input[name="password"], input[type="password"], #password').fill(password)
  await page.locator('button[type="submit"], input[type="submit"]').first().click()

  // Handle optional consent page
  try {
    await page.waitForURL(url => url.pathname.includes('consent') || url.pathname.includes('authorize'), { timeout: 4_000 })
    const allowBtn = page.locator('[name="accept"], button:has-text("Allow"), button:has-text("Approve")').first()
    await allowBtn.click()
  } catch {
    // No consent page — continue
  }

  // Wait for redirect back to the app's OAuth callback
  await page.waitForURL(/pod-auth-callback\.html/, { timeout: 20_000 })

  // Wait for app to process auth and show the logged-in state
  await page.waitForURL(/localhost:4173/, { timeout: 10_000 })
  await page.locator('button:has-text("Logout"), [title*="Logout"]').first().waitFor({ timeout: 20_000 })
}
