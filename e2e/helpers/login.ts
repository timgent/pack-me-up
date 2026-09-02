import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The signed-in sentinel. Logout used to be a button in the nav bar and was
 * what every helper waited for; it now lives inside the account menu (#302),
 * so the trigger is what stays visible once you are signed in.
 */
export function accountMenu(page: Page): Locator {
  return page.getByRole('button', { name: /account menu/i })
}

/**
 * The *live* signed-in sentinel: the account, with no offline notice beside it.
 *
 * The account menu on its own stopped meaning "the pod is reachable" in #342 — a
 * session that is stored but not yet live now shows the same account with an
 * "Offline" badge, which is the whole point of that change. So anything that
 * needs a working pod waits for this instead, or it races the restore.
 */
export async function waitForLiveSession(page: Page, timeout = 30_000): Promise<void> {
  await accountMenu(page).first().waitFor({ state: 'visible', timeout })
  await expect(page.getByTestId('offline-banner')).toHaveCount(0, { timeout })
}

/** Opens the account menu, so its Backups link and Logout button are reachable. */
export async function openAccountMenu(page: Page): Promise<void> {
  await accountMenu(page).first().click()
}

/** Signs out the way a user does now: open the account menu, then Logout. */
export async function logoutViaAccountMenu(page: Page): Promise<void> {
  await openAccountMenu(page)
  await page.getByRole('button', { name: 'Logout' }).click()
}

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

  // Search box doubles as Pod URL entry: type the CSS issuer, then pick the
  // "use this URL" option it offers.
  await page.getByLabel('Search providers or paste your Pod URL').fill(cssIssuer)
  await page.getByRole('button', { name: `Connect to ${cssIssuer.replace(/\/$/, '')}` }).click()

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
    await accountMenu(page).first().waitFor({ timeout: 20_000 })
  }
}
