import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const CSS_PORT = 4001
export const CSS_ISSUER = `http://localhost:${CSS_PORT}`
export const TEST_EMAIL = 'test@example.com'
export const TEST_PASSWORD = 'test1234'
export const TEST_POD_NAME = 'testuser'
export const AUTH_STATE_FILE = path.join(__dirname, 'e2e/.auth/user.json')
export const CSS_PID_FILE = path.join(__dirname, '.e2e-css-pid')
export const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
export const APP_URL = 'http://localhost:4173'

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: CHROMIUM_PATH,
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
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
