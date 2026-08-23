import { test, expect } from '../fixtures'
import { loginToCss } from '../helpers/login'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD } from '../../playwright.config'

// Verify fix: offline-created list can be shared without 404
// The fix adds saveListToPod call before grantPublicAccess / grantCollaboratorAccess
test.describe.configure({ mode: 'serial' })

test.describe('Z – Offline list → login → share (regression for 404 fix)', () => {
    test('Z1: create list offline, login, share publicly → no error, link produced', async ({ page }) => {
        const errors404: string[] = []
        page.on('response', r => {
            if (r.status() === 404 && r.url().includes('pack-me')) errors404.push(r.url())
        })

        // ── 1. Run wizard offline then create list ──────────────────────────
        await page.goto('/#/wizard')
        await fillPersonRequiredFields(page)
        await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
        try { await page.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* ok */ }
        await expect(page.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 15_000 })
        await page.getByRole('button', { name: /Create My First Packing List/i }).click()
        await page.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })

        await page.getByLabel('Packing List Name').fill('Offline Verification List')
        await page.getByRole('button', { name: 'Create Packing List' }).click()
        await page.waitForURL(/#\/view-lists\//, { timeout: 10_000 })
        const listId = page.url().split('/view-lists/')[1]?.split('?')[0]
        console.log('Created list offline, id:', listId)

        // ── 2. Log in with CSS ──────────────────────────────────────────────
        await page.goto('/')
        await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD, { waitForLoggedIn: false })
        try {
            await page.getByRole('button', { name: /use.*local/i }).click({ timeout: 3_000 })
        } catch { /* no modal */ }
        await page.getByRole('button', { name: 'Logout' }).waitFor({ timeout: 15_000 })
        console.log('Logged in')

        // ── 3. Navigate to the list ──────────────────────────────────────────
        await page.goto(`/#/view-lists/${listId}`)
        const shareBtn = page.getByRole('button', { name: /^share$/i })
        await expect(shareBtn).toBeVisible({ timeout: 10_000 })
        await shareBtn.click()

        // ── 4. Check current access loaded cleanly (not frozen on "Loading…") ─
        await expect(page.getByText('Loading…')).not.toBeVisible({ timeout: 5_000 })

        // ── 5. Switch to public mode and share ──────────────────────────────
        await page.getByRole('button', { name: /anyone with the link/i }).click()
        await page.getByRole('button', { name: /share publicly/i }).click()

        // ── 6. Assert: no error shown, link is present ─────────────────────
        // Scoped to the modal, and given a timeout so that "no error element at
        // all" resolves rather than waiting for one to appear. Unscoped, the
        // first red thing on the page used to be an item row's delete button —
        // an icon, so its text was empty and this passed without ever looking
        // at the modal.
        const errorText = await page.getByRole('dialog').locator('.text-red-600').first()
            .textContent({ timeout: 2_000 }).catch(() => '')
        expect(errorText?.trim() ?? '', 'No error should appear in the modal').toBe('')

        const linkInput = page.getByRole('textbox', { name: /shareable link/i })
        await expect(linkInput).toBeVisible({ timeout: 12_000 })
        const linkValue = await linkInput.inputValue()
        expect(linkValue).toContain('/view-lists/')
        expect(linkValue).toContain('pod=')
        console.log('Shareable link:', linkValue)

        // ── 7. Close + reopen → Current access shows 🌐 row ────────────────
        // Use onClose button (×) rather than Escape to ensure overlay is gone
        const closeBtn = page.getByRole('button', { name: /close/i }).or(page.locator('button[aria-label="Close"]'))
        await closeBtn.click({ timeout: 3_000 }).catch(() => page.keyboard.press('Escape'))
        // Wait for modal to be fully gone before clicking Share again
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })
        await shareBtn.click()
        await expect(page.getByText('🌐 Anyone with the link')).toBeVisible({ timeout: 8_000 })
        console.log('"Anyone with the link" row visible ✓')

        // ── 8. Probe: revoke ────────────────────────────────────────────────
        await page.getByRole('button', { name: /revoke public access/i }).click()
        await expect(page.getByText('🌐 Anyone with the link')).not.toBeVisible({ timeout: 8_000 })
        console.log('Public row gone after revoke ✓')

        // 404s on pack-me resources are expected: pod polling before first sync + ACL probing during grant
        console.log('404s on pod pack-me resources (expected):', errors404.length ? errors404 : '(none)')
    })
})
