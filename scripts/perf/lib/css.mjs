// Shared helpers for the standalone perf harnesses in scripts/perf.
//
// Everything here talks to a local Community Solid Server (the `solid-dev`
// skill's start.sh, or any CSS with an email/password account) over its plain
// HTTP account API, so these files stay dependency-free .mjs and can seed a pod
// without importing the app's TypeScript.

/** Log in to an existing CSS account and return the CSS-Account-Token. */
export async function loginToCssAccount(cssOrigin, email, password) {
  const res = await fetch(`${cssOrigin}/.account/login/password/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`CSS login failed: ${res.status} ${await res.text()}`)
  return (await res.json()).authorization
}

/** Create OAuth client credentials for a CSS account. */
export async function createClientCredentials(cssOrigin, accountToken, webId) {
  const controlsRes = await fetch(`${cssOrigin}/.account/`, {
    headers: { Authorization: `CSS-Account-Token ${accountToken}` },
  })
  if (!controlsRes.ok) throw new Error(`CSS controls fetch failed: ${controlsRes.status}`)
  const credentialsUrl = (await controlsRes.json()).controls?.account?.clientCredentials
  if (!credentialsUrl) throw new Error('No controls.account.clientCredentials in CSS controls response')

  const credRes = await fetch(credentialsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `CSS-Account-Token ${accountToken}` },
    body: JSON.stringify({ name: 'perf-harness', webId }),
  })
  if (!credRes.ok) throw new Error(`CSS client credentials failed: ${credRes.status} ${await credRes.text()}`)
  const { id, secret } = await credRes.json()
  return { id, secret }
}

/** Exchange client credentials for a Bearer token via the client_credentials grant. */
export async function getBearerToken(cssOrigin, clientId, clientSecret, webId) {
  const oidcRes = await fetch(`${cssOrigin}/.well-known/openid-configuration`)
  if (!oidcRes.ok) throw new Error(`OIDC config fetch failed: ${oidcRes.status}`)
  const { token_endpoint: tokenEndpoint } = await oidcRes.json()

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', webid: webId, scope: 'webid' }).toString(),
  })
  if (!tokenRes.ok) throw new Error(`CSS token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`)
  return (await tokenRes.json()).access_token
}

/** One call from account credentials to a Bearer token for that account's pod. */
export async function authenticateForPod(cssOrigin, { email, password, webId }) {
  const accountToken = await loginToCssAccount(cssOrigin, email, password)
  const { id, secret } = await createClientCredentials(cssOrigin, accountToken, webId)
  return getBearerToken(cssOrigin, id, secret, webId)
}

/**
 * Drive the app's real Solid login UI (same flow as e2e/helpers/login.ts).
 */
export async function loginToCss(page, { appOrigin, cssOrigin, email, password }) {
  await page.getByRole('button', { name: 'Sync & Share' }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByText('Other providers').click()
  await page.getByRole('button', { name: 'Use Custom Provider' }).click()
  await page.getByLabel('Custom Provider URL').fill(cssOrigin)
  await page.getByRole('button', { name: 'Connect' }).click()

  await page.waitForURL(
    url => url.hostname === 'localhost' && url.port === new URL(cssOrigin).port && url.pathname.includes('/login/password'),
    { timeout: 20_000 }
  )
  const loginBtn = page.locator('button[type="submit"][name="submit"]')
  await loginBtn.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => {
    const btn = document.querySelector('button[type="submit"][name="submit"]')
    return btn && !btn.disabled
  }, { timeout: 10_000 })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await loginBtn.click()

  await page.waitForURL(url => url.pathname.includes('/oidc/prompt') || url.pathname.includes('consent'), { timeout: 20_000 })
  const authorizeBtn = page.locator('#authorize')
  await authorizeBtn.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => {
    const btn = document.querySelector('#authorize')
    return btn && !btn.disabled
  }, { timeout: 10_000 })
  await authorizeBtn.click()

  await page.waitForURL(new RegExp(new URL(appOrigin).host), { timeout: 20_000 })
  // The signed-in sentinel: Logout moved inside the account menu (#302).
  await page.getByRole('button', { name: /account menu/i }).first().waitFor({ timeout: 20_000 })
}
