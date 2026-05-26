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
        // Uncheck to leave items in clean state
        await firstCheckbox.click()
        await expect(pageA.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
        await expect(pageA.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
    })

    test.afterAll(async () => {
        await ctxA.close()
    })

    test('L1: User A shares a list and the shareable link contains the expected params', async () => {
        // Share button should be visible for own list
        await expect(pageA.getByRole('button', { name: /^share$/i })).toBeVisible({ timeout: 5_000 })

        // Open share modal
        await pageA.getByRole('button', { name: /^share$/i }).click()
        await expect(pageA.getByText('Share packing list')).toBeVisible({ timeout: 5_000 })

        // Enter User B's pod URL
        const collabPodUrl = `http://localhost:${CSS_PORT}/${COLLAB_POD_NAME}/`
        await pageA.getByPlaceholder(/pod url/i).fill(collabPodUrl)
        await pageA.getByRole('button', { name: /^share$/i }).click()

        // Wait for the link to appear
        await expect(pageA.getByRole('textbox', { name: /shareable link/i })).toBeVisible({ timeout: 15_000 })

        const linkInput = pageA.getByRole('textbox', { name: /shareable link/i })
        shareLink = await linkInput.inputValue()

        expect(shareLink).toContain('/view-lists/')
        expect(shareLink).toContain('pod=')
        expect(shareLink).toContain(encodeURIComponent(`http://localhost:${CSS_PORT}/testuser/`))

        // Close modal
        await pageA.keyboard.press('Escape')

        // "Shared list" badge should NOT be on User A's own view
        expect(await pageA.getByText('Shared list').count()).toBe(0)
    })

    test('L2: User B opens the shared link and sees the "Shared list" badge', async ({ browser }) => {
        // User B: log in as collab user and navigate to the shared link
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()

        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)

            // Strip the origin from the shareLink to get the hash path
            const hashPart = shareLink.replace(/^https?:\/\/[^#]+/, '')
            await pageB.goto(hashPart)

            // "Shared list" badge must be visible
            await expect(pageB.getByText('Shared list')).toBeVisible({ timeout: 30_000 })

            // List name should match what User A created
            await expect(pageB.getByText(listName)).toBeVisible({ timeout: 15_000 })

            // Share button must NOT be visible on a shared list
            expect(await pageB.getByRole('button', { name: /^share$/i }).count()).toBe(0)
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

            const hashPart = shareLink.replace(/^https?:\/\/[^#]+/, '')
            await pageB.goto(hashPart)

            // Wait for list to load on shared view
            await expect(pageB.getByText('Shared list')).toBeVisible({ timeout: 30_000 })

            // User B checks the first item
            const firstCheckbox = pageB.locator('input[type="checkbox"]').first()
            await firstCheckbox.waitFor({ timeout: 10_000 })
            await firstCheckbox.click()

            // Wait for save indicator to complete on User B's side
            await expect(pageB.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
            await expect(pageB.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })

            // User A's page should reflect the checked item within 10s (one poll cycle)
            await expect(pageA.locator('input[type="checkbox"]:checked').first()).toBeVisible({ timeout: 10_000 })
        } finally {
            await ctxB.close()
        }
    })
})
