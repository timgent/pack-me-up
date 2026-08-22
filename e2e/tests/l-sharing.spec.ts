import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { CSS_ISSUER, CSS_PORT, LUSER_EMAIL, LUSER_PASSWORD, LUSER_POD_NAME, COLLAB_EMAIL, COLLAB_PASSWORD, COLLAB_POD_NAME } from '../../playwright.config'
import { expandAllSections, firstItemChip } from '../helpers/packing-list'

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
        await loginToCss(pageA, CSS_ISSUER, LUSER_EMAIL, LUSER_PASSWORD)

        await pageA.goto('/#/wizard')
        await fillPersonRequiredFields(pageA)
        await pageA.getByRole('button', { name: /Generate My Packing Questions/i }).click()
        try { await pageA.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* ok */ }
        await expect(pageA.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 15_000 })
        await pageA.getByRole('button', { name: /Create My First Packing List/i }).click()
        await pageA.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })

        // Create list
        await pageA.getByPlaceholder('Enter a name for your packing list').waitFor({ timeout: 15_000 })
        await pageA.getByPlaceholder('Enter a name for your packing list').fill(listName)
        await pageA.getByRole('button', { name: 'Create Packing List' }).click()
        await pageA.waitForURL(/#\/view-lists\//, { timeout: 10_000 })
        await expandAllSections(pageA)

        // Sync to pod: check an item, wait for green indicator cycle
        const firstCheckbox = firstItemChip(pageA)
        await firstCheckbox.waitFor({ timeout: 10_000 })
        await firstCheckbox.click()
        await expect(pageA.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
        await expect(pageA.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
        // Uncheck to leave items in clean state for the collaboration test.
        // Must toggle "Show Packed" first: after checking, the item is hidden (showPacked=false),
        // so re-evaluating the locator would find a *different* checkbox without the toggle.
        await pageA.getByRole('button', { name: /show packed/i }).click()
        await firstCheckbox.click()
        await expect(pageA.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
        await expect(pageA.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
        await pageA.getByRole('button', { name: /hide packed/i }).click()
    })

    test.afterAll(async () => {
        await ctxA.close()
    })

    test('L1: User A shares a list; shareable link contains expected params', async () => {
        // Share button renders immediately, enabled once pod URL resolves (~1 network round-trip)
        // exact: true — the packing list's "Collapse the shared items list" section header also matches a bare 'Share' substring
        await expect(pageA.getByRole('button', { name: 'Share', exact: true })).toBeEnabled({ timeout: 10_000 })

        // Open share modal
        await pageA.getByRole('button', { name: 'Share', exact: true }).click()
        await expect(pageA.getByText('Manage sharing')).toBeVisible({ timeout: 5_000 })

        // Enter User B's WebID then submit via the dialog's Share button (not the toolbar one)
        const collabWebId = `http://localhost:${CSS_PORT}/${COLLAB_POD_NAME}/profile/card#me`
        await pageA.getByPlaceholder(/profile\/card#me/i).fill(collabWebId)
        await pageA.getByRole('dialog').getByRole('button', { name: 'Share' }).click()

        // Wait for the generated link (ACL request may take a moment)
        await expect(pageA.getByRole('textbox', { name: /shareable link/i })).toBeVisible({ timeout: 15_000 })
        shareLink = await pageA.getByRole('textbox', { name: /shareable link/i }).inputValue()

        expect(shareLink).toContain('/view-lists/')
        expect(shareLink).toContain('pod=')
        expect(shareLink).toContain(encodeURIComponent(`http://localhost:${CSS_PORT}/${LUSER_POD_NAME}/`))

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
            await expect(pageB.getByRole('button', { name: 'Share', exact: true })).not.toBeVisible()
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
            const firstCheckbox = firstItemChip(pageB)
            await firstCheckbox.waitFor({ timeout: 10_000 })
            await firstCheckbox.click()

            // Wait for User B's save to reach the pod (green "Saved" indicator cycle)
            await expect(pageB.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
            await expect(pageB.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })

            // Confirm no pod-write error was surfaced (error toast = ACL or network failure)
            await expect(pageB.getByText(/Failed to save to Pod/i)).not.toBeVisible()

            // User A polls every 5s — give 3 full cycles (15s) for propagation.
            // With showPacked=false (default), checked items are removed from the DOM,
            // so we verify sync via the "N packed items hidden" banner instead.
            await expect(pageA.getByText(/packed.*hidden/i)).toBeVisible({ timeout: 20_000 })
        } finally {
            await ctxB.close()
        }
    })

    test('L4: anonymous user checks item on public link; owner sees the change within one poll cycle', async ({ browser }) => {
        // Close any dialog left open from L1: the Modal component has no Escape handler,
        // so clicking the X close button is the only reliable way to dismiss it.
        const residualDialog = pageA.locator('[role="dialog"]')
        if (await residualDialog.isVisible()) {
            await residualDialog.getByRole('button', { name: 'Close' }).click()
            await expect(residualDialog).toHaveCount(0)
        }
        // Now the toolbar Share button is the only one visible
        await pageA.getByRole('button', { name: 'Share', exact: true }).click()
        await expect(pageA.getByText('Manage sharing')).toBeVisible({ timeout: 5_000 })
        await pageA.getByRole('button', { name: 'Anyone with the link' }).click()
        await pageA.getByRole('dialog').getByRole('button', { name: /^Share publicly/i }).click()
        await expect(pageA.getByRole('textbox', { name: /shareable link/i })).toBeVisible({ timeout: 15_000 })
        const publicLink = await pageA.getByRole('textbox', { name: /shareable link/i }).inputValue()
        await pageA.keyboard.press('Escape')

        // Open a fresh anonymous context — no login
        const ctxAnon = await browser.newContext()
        const pageAnon = await ctxAnon.newPage()
        try {
            await pageAnon.goto(publicLink)

            // Wait for list items to load via pod poll.
            // Item 1 is already packed (from L3) so it's hidden with showPacked=false;
            // the first visible checkbox is item 2.
            const firstCheckbox = firstItemChip(pageAnon)
            await firstCheckbox.waitFor({ timeout: 20_000 })

            // Check the first visible item
            await firstCheckbox.click()

            // Wait for the anonymous write to reach the pod
            await pageAnon.waitForResponse(
                r => r.url().includes('/pack-me-up/packing-lists/') && r.request().method() === 'PUT',
                { timeout: 10_000 }
            )

            // Confirm no pod-write error was surfaced
            await expect(pageAnon.getByText(/Failed to save to Pod/i)).not.toBeVisible()

            // User A polls every 5 s — give 3 cycles (15 s) for propagation.
            // After L3 there was 1 packed item hidden; after L4 there should be 2.
            await expect(pageA.getByText(/2 packed.*hidden/i)).toBeVisible({ timeout: 20_000 })
        } finally {
            await ctxAnon.close()
        }
    })
})
