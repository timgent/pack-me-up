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
export const SCHEMA_COMPAT_EMAIL = 'schema-compat@example.com'
export const SCHEMA_COMPAT_PASSWORD = 'test1234'
export const SCHEMA_COMPAT_POD_NAME = 'schemacompat'
export const COLLAB_EMAIL = 'collab@example.com'
export const COLLAB_PASSWORD = 'test1234'
export const COLLAB_POD_NAME = 'collabuser'
// Per-suite dedicated pod users — prevents concurrent suites from corrupting shared pod state.
export const FUSER_EMAIL = 'fuser@example.com'
export const FUSER_PASSWORD = 'test1234'
export const FUSER_POD_NAME = 'fuser'
export const GUSER_EMAIL = 'guser@example.com'
export const GUSER_PASSWORD = 'test1234'
export const GUSER_POD_NAME = 'guser'
export const HUSER_EMAIL = 'huser@example.com'
export const HUSER_PASSWORD = 'test1234'
export const HUSER_POD_NAME = 'huser'
export const LUSER_EMAIL = 'luser@example.com'
export const LUSER_PASSWORD = 'test1234'
export const LUSER_POD_NAME = 'luser'
// J's one data-writing test needs a pod nobody else touches: E, J and Z share
// `testuser`, and a suite that writes there breaks the ones that assume it empty.
export const JUSER_EMAIL = 'juser@example.com'
export const JUSER_PASSWORD = 'test1234'
export const JUSER_POD_NAME = 'juser'
export const MUSER_EMAIL = 'muser@example.com'
export const MUSER_PASSWORD = 'test1234'
export const MUSER_POD_NAME = 'muser'
export const CSS_PID_FILE = path.join(__dirname, '.e2e-css-pid')
export const APP_URL = 'http://localhost:4173'

// Use local pre-installed Chromium if present (dev environment);
// in CI Playwright downloads its own browser when this is undefined.
const localChromium = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath = existsSync(localChromium) ? localChromium : undefined

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 120_000,
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
