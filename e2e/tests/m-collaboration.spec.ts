import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { loginToExistingCssAccount, createCssClientCredentials, getCssBearerToken } from '../helpers/pod-seed'
import {
    CSS_ISSUER,
    CSS_PORT,
    MUSER_EMAIL,
    MUSER_PASSWORD,
    MUSER_POD_NAME,
    COLLAB_EMAIL,
    COLLAB_PASSWORD,
    COLLAB_POD_NAME,
} from '../../playwright.config'

// M tests use two pod users. Serial mode gives exclusive pod access.
test.describe.configure({ mode: 'serial' })

test.describe('M – Full pod collaboration', () => {
    let pageA: import('@playwright/test').Page
    let ctxA: import('@playwright/test').BrowserContext
    let pageB: import('@playwright/test').Page
    let ctxB: import('@playwright/test').BrowserContext
    let inviteLink: string
    const listName = `Collab Trip ${Date.now()}`
    const collabWebId = `http://localhost:${CSS_PORT}/${COLLAB_POD_NAME}/profile/card#me`
    const ownerPodUrl = `http://localhost:${CSS_PORT}/${MUSER_POD_NAME}/`

    test.beforeAll(async ({ browser }) => {
        // Owner: log in, ensure a question set exists, create a packing list, sync to pod
        ctxA = await browser.newContext()
        pageA = await ctxA.newPage()
        await pageA.goto('/')
        await loginToCss(pageA, CSS_ISSUER, MUSER_EMAIL, MUSER_PASSWORD)

        // Try create-packing-list directly — if a question set already exists skip the wizard.
        await pageA.goto('/#/create-packing-list')
        const nameInput = pageA.getByPlaceholder('Enter a name for your packing list')
        const isReady = await nameInput.isVisible({ timeout: 8_000 }).catch(() => false)
        if (!isReady) {
            await pageA.goto('/#/wizard')
            await fillPersonRequiredFields(pageA)
            await pageA.getByRole('button', { name: /Generate My Packing Questions/i }).click()
            try { await pageA.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* ok */ }
            await expect(pageA.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 15_000 })
            await pageA.getByRole('button', { name: /Create My First Packing List/i }).click()
            try { await pageA.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 }) } catch { /* ok */ }
            await pageA.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })
        }

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

        // Collaborator: log in once; each test navigates to inviteLink on the shared page.
        ctxB = await browser.newContext()
        pageB = await ctxB.newPage()
        await pageB.goto('/')
        await loginToCss(pageB, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
    })

    test.afterAll(async () => {
        await ctxA.close()
        await ctxB.close()
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

    test('M3: Collab visits invite link and sees foreign context banner', async () => {
        await pageB.goto(inviteLink)
        await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })
    })

    test('M4: Collab sees owner packing lists in foreign context', async () => {
        await pageB.goto(inviteLink)
        await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })
        await expect(pageB.getByText(listName)).toBeVisible({ timeout: 15_000 })
    })

    test('M5: Collab navigates to a specific list in foreign context', async () => {
        await pageB.goto(inviteLink)
        await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })
        await pageB.getByText(listName).click()
        await pageB.waitForURL(/\/pod\/.+\/view-lists\/.+/, { timeout: 10_000 })
        await expect(pageB.getByText(/viewing.*data/i)).toBeVisible()
    })

    test('M6: Auto-store writes shared-with-me.ttl to collab pod', async () => {
        const collabPodUrl = `http://localhost:${CSS_PORT}/${COLLAB_POD_NAME}/`
        const collabWebIdForAuth = `http://localhost:${CSS_PORT}/${COLLAB_POD_NAME}/profile/card#me`
        const swmUrl = `${collabPodUrl}pack-me-up/shared-with-me.ttl`

        await pageB.goto(inviteLink)
        await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })

        // Poll via authenticated server-side request rather than sleeping.
        const accountToken = await loginToExistingCssAccount(CSS_PORT, COLLAB_EMAIL, COLLAB_PASSWORD)
        const { id, secret } = await createCssClientCredentials(CSS_PORT, accountToken, collabWebIdForAuth)
        const bearerToken = await getCssBearerToken(CSS_PORT, id, secret, collabWebIdForAuth)
        await expect(async () => {
            const res = await fetch(swmUrl, { method: 'HEAD', headers: { Authorization: `Bearer ${bearerToken}` } })
            expect(res.status).toBe(200)
        }).toPass({ intervals: [1_000, 2_000, 3_000, 5_000], timeout: 15_000 })
    })

    test('M7: Context switcher appears after visiting shared pod', async () => {
        await pageB.goto(inviteLink)
        await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })

        // Context switcher appears after login sync loads shared-with-me.ttl from pod
        // (loginSyncVersion in Navigation triggers re-read). Allow generous time for sync.
        await expect(pageB.getByRole('combobox', { name: /switch context/i })).toBeVisible({ timeout: 30_000 })
    })

    test('M8: Collab switches back to own context via context switcher', async () => {
        await pageB.goto(inviteLink)
        await expect(pageB.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })

        await pageB.getByRole('combobox', { name: /switch context/i }).selectOption('__own__')
        await pageB.waitForURL(/#\/view-lists/, { timeout: 10_000 })
        await expect(pageB.getByText(/viewing.*data/i)).not.toBeVisible()
    })

    test('M9: Owner revokes access; collab sees access denied', async () => {
        // Owner revokes
        await pageA.goto('/#/sharing')
        await expect(pageA.getByText(collabWebId)).toBeVisible({ timeout: 10_000 })
        await pageA.getByRole('button', { name: /revoke/i }).first().click()
        await expect(pageA.getByText(collabWebId)).not.toBeVisible({ timeout: 10_000 })

        // Collab navigates to invite link — full page load re-fetches from pod, should get access denied
        await pageB.goto(inviteLink)
        await expect(pageB.getByText(/access denied/i)).toBeVisible({ timeout: 20_000 })
    })
})
