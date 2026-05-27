import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import {
    CSS_ISSUER,
    CSS_PORT,
    TEST_EMAIL,
    TEST_PASSWORD,
    TEST_POD_NAME,
    COLLAB_EMAIL,
    COLLAB_PASSWORD,
    COLLAB_POD_NAME,
} from '../../playwright.config'

// M tests use two pod users. Serial mode gives exclusive pod access.
test.describe.configure({ mode: 'serial' })

test.describe('M – Full pod collaboration', () => {
    let pageA: import('@playwright/test').Page
    let ctxA: import('@playwright/test').BrowserContext
    let inviteLink: string
    const listName = `Collab Trip ${Date.now()}`
    const collabWebId = `http://localhost:${CSS_PORT}/${COLLAB_POD_NAME}/profile/card#me`
    const ownerPodUrl = `http://localhost:${CSS_PORT}/${TEST_POD_NAME}/`

    test.beforeAll(async ({ browser }) => {
        // Owner: log in, run wizard, create a packing list, sync to pod
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

        await pageA.getByPlaceholder('Enter a name for your packing list').waitFor({ timeout: 15_000 })
        await pageA.getByPlaceholder('Enter a name for your packing list').fill(listName)
        await pageA.getByRole('button', { name: 'Create Packing List' }).click()
        await pageA.waitForURL(/#\/view-lists\//, { timeout: 10_000 })

        // Wait for pod sync indicator
        const firstCheckbox = pageA.locator('input[type="checkbox"]').first()
        await firstCheckbox.waitFor({ timeout: 10_000 })
        await firstCheckbox.click()
        await expect(pageA.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
        await expect(pageA.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
        await pageA.getByRole('button', { name: /show packed/i }).click()
        await firstCheckbox.click()
        await expect(pageA.locator('span.text-green-600').first()).toBeVisible({ timeout: 8_000 })
        await expect(pageA.locator('span.text-green-600').first()).not.toBeVisible({ timeout: 8_000 })
        await pageA.getByRole('button', { name: /hide packed/i }).click()
    })

    test.afterAll(async () => {
        await ctxA.close()
    })

    test('M1: Owner navigates to sharing settings', async () => {
        await pageA.goto('/#/sharing')
        await expect(pageA.getByRole('heading', { name: /sharing settings/i })).toBeVisible({ timeout: 10_000 })
    })

    test('M2: Owner grants full access to collaborator and gets invite link', async () => {
        await pageA.goto('/#/sharing')
        await pageA.getByLabel(/collaborator webid/i).fill(collabWebId)
        await pageA.getByRole('button', { name: /grant access/i }).click()

        await expect(pageA.getByLabel(/invite link/i)).toBeVisible({ timeout: 15_000 })
        inviteLink = await pageA.getByLabel(/invite link/i).inputValue()

        expect(inviteLink).toContain('/pod/')
        expect(inviteLink).toContain(encodeURIComponent(ownerPodUrl))
        expect(inviteLink).toContain('/view-lists')

        // Collaborator should now appear in the list
        await expect(pageA.getByText(collabWebId)).toBeVisible({ timeout: 10_000 })
    })

    test('M3: Collab visits invite link and sees foreign context banner', async ({ browser }) => {
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageB.goto(inviteLink)

            await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })
        } finally {
            await ctxB.close()
        }
    })

    test('M4: Collab sees owner packing lists in foreign context', async ({ browser }) => {
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageB.goto(inviteLink)

            await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })
            await expect(pageB.getByText(listName)).toBeVisible({ timeout: 15_000 })
        } finally {
            await ctxB.close()
        }
    })

    test('M5: Collab navigates to a specific list in foreign context', async ({ browser }) => {
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageB.goto(inviteLink)

            await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })
            await pageB.getByText(listName).click()
            await pageB.waitForURL(/\/pod\/.+\/view-lists\/.+/, { timeout: 10_000 })
            await expect(pageB.getByText(/viewing.*data/i)).toBeVisible()
        } finally {
            await ctxB.close()
        }
    })

    test('M6: Auto-store writes shared-with-me.ttl to collab pod', async ({ browser }) => {
        const collabPodUrl = `http://localhost:${CSS_PORT}/${COLLAB_POD_NAME}/`
        const swmUrl = `${collabPodUrl}pack-me-up/shared-with-me.ttl`

        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageB.goto(inviteLink)
            await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })

            // Allow time for auto-store to complete
            await pageB.waitForTimeout(3000)

            const status = await pageB.evaluate(async (url) => {
                const res = await fetch(url, { method: 'HEAD' })
                return res.status
            }, swmUrl)
            expect(status).toBe(200)
        } finally {
            await ctxB.close()
        }
    })

    test('M7: Context switcher appears after visiting shared pod', async ({ browser }) => {
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageB.goto(inviteLink)
            await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })

            await expect(pageB.getByRole('combobox', { name: /switch context/i })).toBeVisible({ timeout: 5_000 })
        } finally {
            await ctxB.close()
        }
    })

    test('M8: Collab switches back to own context via context switcher', async ({ browser }) => {
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageB.goto(inviteLink)
            await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })

            await pageB.getByRole('combobox', { name: /switch context/i }).selectOption('__own__')
            await pageB.waitForURL(/#\/view-lists/, { timeout: 10_000 })
            await expect(pageB.getByText(/viewing.*data/i)).not.toBeVisible()
        } finally {
            await ctxB.close()
        }
    })

    test('M9: Owner revokes access; collab sees access denied', async ({ browser }) => {
        // Owner revokes
        await pageA.goto('/#/sharing')
        await expect(pageA.getByText(collabWebId)).toBeVisible({ timeout: 10_000 })
        await pageA.getByRole('button', { name: /revoke/i }).first().click()
        await expect(pageA.getByText(collabWebId)).not.toBeVisible({ timeout: 10_000 })

        // Collab tries to access invite link — should get access denied
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        try {
            await pageB.goto('/')
            await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageB.goto(inviteLink)
            await expect(pageB.getByText(/access denied/i)).toBeVisible({ timeout: 20_000 })
        } finally {
            await ctxB.close()
        }
    })
})
