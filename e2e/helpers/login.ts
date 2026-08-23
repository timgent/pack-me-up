import type { Page } from '@playwright/test'

/**
 * Automates the full Solid Pod OAuth login flow through the app's UI.
 *
 * CSS v7 OIDC flow:
 *  1. App redirects to CSS /.oidc/auth?...
 *  2. CSS redirects through /.account/ → /.account/oidc/prompt/ → /.account/login/ → /.account/login/password/
 *  3. User fills login form (JS-driven — button is disabled until scripts load)
 *  4. After successful login, page navigates to /.account/oidc/prompt/ (consent page)
 *  5. The #authorize button starts disabled, JS enables it after loading WebIDs
 *  6. User clicks Authorize → CSS redirects to SPA root (/) → app processes OAuth callback
 */
export async function loginToCss(
  page: Page,
  cssIssuer: string,
  email: string,
  password: string,
  options?: { waitForLoggedIn?: boolean },
): Promise<void> {
  // Open provider selector
  await page.getByRole('button', { name: 'Sync & Share' }).click()
  await page.getByRole('dialog').waitFor()

  // Show other providers
  await page.getByText('Other providers').click()

  // Show custom provider input
  await page.getByRole('button', { name: 'Use Custom Provider' }).click()

  // Fill in CSS URL
  await page.getByLabel('Custom Provider URL').fill(cssIssuer)
  await page.getByRole('button', { name: 'Connect' }).click()

  // Wait for navigation to CSS password login page specifically.
  // (CSS redirects: /.oidc/auth → /.account/ → /.account/login/password/)
  await page.waitForURL(
    url => url.hostname === 'localhost' && url.port === new URL(cssIssuer).port && url.pathname.includes('/login/password'),
    { timeout: 20_000 }
  )

  // Wait for the login form button to be enabled (CSS uses JS to enable it)
  const loginBtn = page.locator('button[type="submit"][name="submit"]')
  await loginBtn.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => {
    const btn = document.querySelector('button[type="submit"][name="submit"]') as HTMLButtonElement | null
    return btn && !btn.disabled
  }, { timeout: 10_000 })

  // Fill CSS login form
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await loginBtn.click()

  // After login, CSS navigates to /.account/oidc/prompt/ (consent page)
  await page.waitForURL(
    url =>
      url.pathname.includes('/oidc/prompt') ||
      url.pathname.includes('consent'),
    { timeout: 20_000 }
  )

  // The #authorize button starts disabled; JS enables it after loading WebIDs
  const authorizeBtn = page.locator('#authorize')
  await authorizeBtn.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => {
    const btn = document.querySelector('#authorize') as HTMLButtonElement | null
    return btn && !btn.disabled
  }, { timeout: 10_000 })
  await authorizeBtn.click()

  // CSS redirects to the SPA root with OAuth params (?code=...&state=...&iss=...)
  // The app processes the callback and navigates to the return route.
  await page.waitForURL(/localhost:4173/, { timeout: 20_000 })
  // Wait for logged-in state (skip if the caller expects a migration prompt to block the nav)
  if (options?.waitForLoggedIn !== false) {
    await page.getByRole('button', { name: 'Logout' }).first().waitFor({ timeout: 20_000 })
  }
}
