import { chromium } from '@playwright/test'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createCssAccount } from './helpers/css-api'
import { loginToCss } from './helpers/login'
import { loginToExistingCssAccount, createCssClientCredentials, getCssBearerToken, seedPodWithJsonFixtures } from './helpers/pod-seed'
import {
  CSS_PORT, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD, TEST_POD_NAME,
  AUTH_STATE_FILE, CSS_PID_FILE, APP_URL,
  SCHEMA_COMPAT_EMAIL, SCHEMA_COMPAT_PASSWORD, SCHEMA_COMPAT_POD_NAME,
} from '../playwright.config'
import v1QuestionSet from './fixtures/v1-question-set.json' with { type: 'json' }
import v1PackingList from './fixtures/v1-packing-list.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localChromium = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath = existsSync(localChromium) ? localChromium : undefined
// Use locally-installed CSS binary (installed as devDependency) — avoids npx download in CI
const CSS_BIN = path.resolve(__dirname, '../node_modules/.bin/community-solid-server')

async function waitForUrl(url: string, maxWaitMs = 90_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.status < 500) return
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`${url} did not become available within ${maxWaitMs}ms`)
}

export default async function globalSetup() {
  // 1. Start CSS (use local devDependency binary to avoid npx download in CI)
  const cssProc = spawn(
    CSS_BIN,
    ['-p', String(CSS_PORT)],
    { stdio: 'pipe', detached: false }
  )
  writeFileSync(CSS_PID_FILE, String(cssProc.pid))
  process.env.CSS_ISSUER = CSS_ISSUER

  console.log(`[setup] Starting CSS on port ${CSS_PORT} (pid ${cssProc.pid})...`)
  await waitForUrl(`http://localhost:${CSS_PORT}/.account/`)
  console.log('[setup] CSS ready')

  // 2. Create test accounts
  await createCssAccount(CSS_PORT, TEST_EMAIL, TEST_PASSWORD, TEST_POD_NAME)
  console.log(`[setup] Test account created: ${TEST_EMAIL}`)

  await createCssAccount(CSS_PORT, SCHEMA_COMPAT_EMAIL, SCHEMA_COMPAT_PASSWORD, SCHEMA_COMPAT_POD_NAME)
  console.log(`[setup] Schema-compat account created: ${SCHEMA_COMPAT_EMAIL}`)

  // 2a. Seed schema-compat pod with v1 JSON fixtures (server-side, no browser needed)
  const accountToken = await loginToExistingCssAccount(CSS_PORT, SCHEMA_COMPAT_EMAIL, SCHEMA_COMPAT_PASSWORD)
  const webId = `http://localhost:${CSS_PORT}/${SCHEMA_COMPAT_POD_NAME}/profile/card#me`
  const { id: clientId, secret: clientSecret } = await createCssClientCredentials(CSS_PORT, accountToken, webId)
  const podUrl = `http://localhost:${CSS_PORT}/${SCHEMA_COMPAT_POD_NAME}/`
  const bearerToken = await getCssBearerToken(CSS_PORT, clientId, clientSecret, webId)
  await seedPodWithJsonFixtures(podUrl, bearerToken, {
    questionSet: v1QuestionSet,
    packingLists: [v1PackingList],
  })
  console.log('[setup] Schema-compat pod seeded with v1 JSON fixtures')

  // 3. Wait for app
  console.log('[setup] Waiting for app...')
  await waitForUrl(APP_URL)
  console.log('[setup] App ready')

  // 4. Browser login → save storage state
  mkdirSync(path.dirname(AUTH_STATE_FILE), { recursive: true })
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await page.goto(APP_URL)
    await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
    await context.storageState({ path: AUTH_STATE_FILE })
    console.log('[setup] Auth state saved')
  } finally {
    await browser.close()
  }
}
