import type { PackingListQuestionSet } from '../../src/edit-questions/types'
import type { PackingList } from '../../src/create-packing-list/types'

/**
 * Log in to an existing CSS account and return the CSS-Account-Token.
 */
export async function loginToExistingCssAccount(
  port: number,
  email: string,
  password: string,
): Promise<string> {
  const base = `http://localhost:${port}`
  const res = await fetch(`${base}/.account/login/password/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(`CSS login failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json() as Record<string, unknown>
  return data.authorization as string
}

/**
 * Create OAuth client credentials for a CSS account.
 * Returns { id, secret } suitable for the client_credentials grant.
 *
 * CSS v7 controls structure: controls.account.clientCredentials is the POST URL.
 */
export async function createCssClientCredentials(
  port: number,
  accountToken: string,
  webId: string,
): Promise<{ id: string; secret: string }> {
  const base = `http://localhost:${port}`

  const controlsRes = await fetch(`${base}/.account/`, {
    headers: { Authorization: `CSS-Account-Token ${accountToken}` },
  })
  if (!controlsRes.ok) {
    throw new Error(`CSS controls fetch failed: ${controlsRes.status} ${await controlsRes.text()}`)
  }
  const controlsData = await controlsRes.json() as { controls: { account: { clientCredentials: string } } }
  const credentialsUrl = controlsData.controls?.account?.clientCredentials
  if (!credentialsUrl) {
    throw new Error('Could not find controls.account.clientCredentials URL in CSS controls response')
  }

  const credRes = await fetch(credentialsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `CSS-Account-Token ${accountToken}`,
    },
    body: JSON.stringify({ name: 'pod-seed-client', webId }),
  })
  if (!credRes.ok) {
    throw new Error(`CSS client credentials creation failed: ${credRes.status} ${await credRes.text()}`)
  }
  const credData = await credRes.json() as Record<string, unknown>
  return { id: credData.id as string, secret: credData.secret as string }
}

/**
 * Exchange CSS client credentials for a Bearer access token via the
 * OAuth client_credentials grant.
 */
export async function getCssBearerToken(
  port: number,
  clientId: string,
  clientSecret: string,
  webId: string,
): Promise<string> {
  const base = `http://localhost:${port}`

  const oidcRes = await fetch(`${base}/.well-known/openid-configuration`)
  if (!oidcRes.ok) {
    throw new Error(`OIDC config fetch failed: ${oidcRes.status}`)
  }
  const oidcData = await oidcRes.json() as Record<string, unknown>
  const tokenEndpoint = oidcData.token_endpoint as string

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      webid: webId,
      scope: 'webid',
    }).toString(),
  })
  if (!tokenRes.ok) {
    throw new Error(`CSS token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`)
  }
  const tokenData = await tokenRes.json() as Record<string, unknown>
  return tokenData.access_token as string
}

/**
 * Write v1 JSON fixtures directly to a CSS pod via authenticated HTTP PUT.
 * CSS creates intermediate LDP containers automatically on PUT.
 */
export async function seedPodWithJsonFixtures(
  podUrl: string,
  bearerToken: string,
  fixtures: { questionSet: PackingListQuestionSet; packingLists: PackingList[] },
): Promise<void> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearerToken}`,
  }

  // Question set
  const qsUrl = `${podUrl}pack-me-up/packing-list-questions.json`
  const qsRes = await fetch(qsUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(fixtures.questionSet, null, 2),
  })
  if (!qsRes.ok) {
    throw new Error(`Failed to seed question set: ${qsRes.status} ${await qsRes.text()}`)
  }

  // Packing lists
  for (const list of fixtures.packingLists) {
    const listUrl = `${podUrl}pack-me-up/packing-lists/${list.id}.json`
    const listRes = await fetch(listUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(list, null, 2),
    })
    if (!listRes.ok) {
      throw new Error(`Failed to seed packing list ${list.id}: ${listRes.status} ${await listRes.text()}`)
    }
  }
}
