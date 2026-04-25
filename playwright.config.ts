import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const CSS_PORT = 4001
export const CSS_ISSUER = `http://localhost:${CSS_PORT}`
export const TEST_EMAIL = 'test@example.com'
export const TEST_PASSWORD = 'test1234'
export const TEST_POD_NAME = 'testuser'
export const AUTH_STATE_FILE = path.join(__dirname, 'e2e/.auth/user.json')
export const SCHEMA_COMPAT_EMAIL = 'schema-compat@example.com'
export const SCHEMA_COMPAT_PASSWORD = 'test1234'
export const SCHEMA_COMPAT_POD_NAME = 'schemacompat'
export const CSS_PID_FILE = path.join(__dirname, '.e2e-css-pid')
export const APP_URL = 'http://localhost:4173'

// Use local pre-installed Chromium if present (dev environment);
// in CI Playwright downloads its own browser when this is undefined.
const localChromium = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath = existsSync(localChromium) ? localChromium : undefined

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  workers: 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 90_000,
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
