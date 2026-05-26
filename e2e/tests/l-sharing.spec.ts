import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { CSS_ISSUER, CSS_PORT, TEST_EMAIL, TEST_PASSWORD, COLLAB_EMAIL, COLLAB_PASSWORD, COLLAB_POD_NAME } from '../../playwright.config'

// L tests use two pod users. Serial mode gives exclusive pod access.
test.describe.configure({ mode: 'serial' })

test.describe('L – Sharing a packing list', () => {
    let pageA: import('@playwright/test').Page
    let ctxA: import('@playwright/test').BrowserContext
    let shareLink: string
    const listName = `Shared Trip ${Date.now()}`

    test.beforeAll(async ({ browser }) => {
        // User A: log in, run wizard, create a packing list
        ctxA = await browser.newContext()
        pageA = await ctxA.newPage()
        await pageA.goto('/')
        await loginToCss(pageA, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)

        await pageA.goto('/#/wizard')
        await fillPersonRequiredFields(pageA)
        await pageA.getByRole('button', { name: /Generate My Packing Questions/i }).click()
        try { await pageA.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* ok */ }
        await expect(pageA.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 15_000 })
        await pageA.getByRole('button', { name: /Create My First Packing List/i }).click()
        try { await pageA.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 }) } catch { /* ok */ }
        await pageA.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })

        // Create list
        await pageA.getByPlaceholder('Enter a name for your packing list').waitFor({ timeout: 15_000 })
        await pageA.getByPlaceholder('Enter a name for your packing list').fill(listName)
        await pageA.getByRole('button', { name: 'Create Packing List' }).click()
        await pageA.waitForURL(/#\/view-lists\//, { timeout: 10_000 })

        // Sync to pod: check an item, wait for green indicator cycle
        const firstCheckbox = pageA.locator('input[type="checkbox"]').first()
        await firstCheckbox.waitFor({ timeout: 10_000 })
        await firstCheckbox.click()
        await expect(pageA.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
        await expect(pageA.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
        // Uncheck to leave items in clean state for the collaboration test
        await firstCheckbox.click()
        await expect(pageA.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
        await expect(pageA.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
    })

    test.afterAll(async () => {
        await ctxA.close()
    })

    test('L1: User A shares a list; shareable link contains expected params', async () => {
        // Share button visible for own list (only shown when ownPodUrl is resolved)
        await expect(pageA.getByRole('button', { name: 'Share' })).toBeVisible({ timeout: 10_000 })

        // Open share modal
        await pageA.getByRole('button', { name: 'Share' }).click()
        await expect(pageA.getByText('Share packing list')).toBeVisible({ timeout: 5_000 })

        // Enter User B's pod URL then submit via the dialog's Share button (not the toolbar one)
        const collabPodUrl = `http://localhost:${CSS_PORT}/${COLLAB_POD_NAME}/`
        await pageA.getByPlaceholder(/pod url/i).fill(collabPodUrl)
        await pageA.getByRole('dialog').getByRole('button', { name: 'Share' }).click()

        // Wait for the generated link (ACL request may take a moment)
        await expect(pageA.getByRole('textbox', { name: /shareable link/i })).toBeVisible({ timeout: 15_000 })
        shareLink = await pageA.getByRole('textbox', { name: /shareable link/i }).inputValue()

        expect(shareLink).toContain('/view-lists/')
        expect(shareLink).toContain('pod=')
        expect(shareLink).toContain(encodeURIComponent(`http://localhost:${CSS_PORT}/testuser/`))

        // Close modal
        await pageA.keyboard.press('Escape')

        // "Shared list" badge must NOT appear on User A's own view
        await expect(pageA.getByText('Shared list')).not.toBeVisible()
    })

    test('L2: User B opens the shared link; sees "Shared list" badge and list contents', async ({ browser }) => {
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()

        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)

            // Navigate directly to the full shareable URL
            await pageB.goto(shareLink)

            // "Shared list" badge must be visible
            await expect(pageB.getByText('Shared list')).toBeVisible({ timeout: 30_000 })

            // List name must match what User A created
            await expect(pageB.getByText(listName)).toBeVisible({ timeout: 15_000 })

            // Share button must NOT be visible on a shared list
            await expect(pageB.getByRole('button', { name: 'Share' })).not.toBeVisible()
        } finally {
            await ctxB.close()
        }
    })

    test('L3: User B checks an item; User A sees the change within one poll cycle', async ({ browser }) => {
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()

        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)

            // Navigate to the shared list
            await pageB.goto(shareLink)
            await expect(pageB.getByText('Shared list')).toBeVisible({ timeout: 30_000 })

            // User B checks the first item
            const firstCheckbox = pageB.locator('input[type="checkbox"]').first()
            await firstCheckbox.waitFor({ timeout: 10_000 })
            await firstCheckbox.click()

            // Wait for User B's save to reach the pod (green "Saved" indicator cycle)
            await expect(pageB.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
            await expect(pageB.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })

            // User A polls every 5s — checked state should propagate within 12s
            await expect(pageA.locator('input[type="checkbox"]:checked').first()).toBeVisible({ timeout: 12_000 })
        } finally {
            await ctxB.close()
        }
    })
})
