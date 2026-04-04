import { chromium } from '@playwright/test'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { createCssAccount } from './helpers/css-api'
import { loginToCss } from './helpers/login'
import {
  CSS_PORT, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD, TEST_POD_NAME,
  AUTH_STATE_FILE, CSS_PID_FILE, CHROMIUM_PATH, APP_URL
} from '../playwright.config'

async function waitForUrl(url: string, maxWaitMs = 30_000): Promise<void> {
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
  // 1. Start CSS
  const cssProc = spawn(
    'npx',
    ['--yes', '@solid/community-server', '-p', String(CSS_PORT)],
    { stdio: 'pipe', shell: true, detached: false }
  )
  writeFileSync(CSS_PID_FILE, String(cssProc.pid))
  process.env.CSS_ISSUER = CSS_ISSUER

  console.log(`[setup] Starting CSS on port ${CSS_PORT} (pid ${cssProc.pid})...`)
  await waitForUrl(`http://localhost:${CSS_PORT}/.account/`)
  console.log('[setup] CSS ready')

  // 2. Create test account
  await createCssAccount(CSS_PORT, TEST_EMAIL, TEST_PASSWORD, TEST_POD_NAME)
  console.log(`[setup] Test account created: ${TEST_EMAIL}`)

  // 3. Wait for app
  console.log('[setup] Waiting for app...')
  await waitForUrl(APP_URL)
  console.log('[setup] App ready')

  // 4. Browser login → save storage state
  mkdirSync(path.dirname(AUTH_STATE_FILE), { recursive: true })
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
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
