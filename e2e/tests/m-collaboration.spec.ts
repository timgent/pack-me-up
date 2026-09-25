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
import { expandAllSections, firstItemChip } from '../helpers/packing-list'

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
        const nameInput = pageA.getByLabel('Packing List Name')
        const isReady = await nameInput.isVisible({ timeout: 8_000 }).catch(() => false)
        if (!isReady) {
            await pageA.goto('/#/wizard')
            await fillPersonRequiredFields(pageA)
            await pageA.getByRole('button', { name: /Generate My Packing Questions/i }).click()
            try { await pageA.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* ok */ }
            await expect(pageA.getByRole('heading', { name: /Questions Generated Successfully/i })).toBeVisible({ timeout: 15_000 })
            await pageA.getByRole('button', { name: /Create My First Packing List/i }).click()
            await pageA.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })
        }

        await pageA.getByLabel('Packing List Name').waitFor({ timeout: 15_000 })
        await pageA.getByLabel('Packing List Name').fill(listName)
        await pageA.getByRole('button', { name: 'Create Packing List' }).click()
        await pageA.waitForURL(/#\/view-lists\//, { timeout: 10_000 })
        await expandAllSections(pageA)

        // Wait for pod sync indicator
        const firstCheckbox = firstItemChip(pageA)
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
        await expect(pageA.getByRole('heading', { name: /share your full setup/i })).toBeVisible({ timeout: 10_000 })
    })

    test('M2: Owner grants full access to collaborator and gets invite link', async () => {
        await pageA.goto('/#/sharing')
        // The address path sits behind the invite link, closed until asked for.
        await pageA.getByText(/use a sharing address instead/i).click()
        await pageA.getByLabel(/their sharing address/i).fill(collabWebId)
        await pageA.getByRole('button', { name: /share my setup/i }).click()

        await expect(pageA.getByLabel(/invite link/i)).toBeVisible({ timeout: 15_000 })
        inviteLink = await pageA.getByLabel(/invite link/i).inputValue()

        expect(inviteLink).toContain('/pod/')
        expect(inviteLink).toContain(encodeURIComponent(ownerPodUrl))
        expect(inviteLink).toContain('/view-lists')

        // The share is confirmed in the page's own words, and the collaborator
        // appears in the list of people who have the full setup
        // "with <webid>" pins this to the confirmation panel — the success toast
        // says the same thing without it
        await expect(pageA.getByText(/your full setup is shared with/i)).toBeVisible({ timeout: 10_000 })
        await expect(
            pageA.getByRole('button', { name: `Revoke access for ${collabWebId}` })
        ).toBeVisible({ timeout: 10_000 })
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

    test('M7: the account menu offers the shared setup, marked as the one on screen', async ({ browser }) => {
        // A fresh login is required: loginSyncVersion only increments on login, which triggers
        // the Navigation component to re-read shared-with-me.ttl and populate the switcher.
        const ctxC = await browser.newContext()
        const pageC = await ctxC.newPage()
        try {
            await pageC.goto('/')
            await loginToCss(pageC, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageC.goto(inviteLink)
            await expect(pageC.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })
            // In the account menu now, not the header: there at every width.
            const desktop = pageC.getByTestId('nav-bar-desktop')
            await expect(async () => {
                // Start each try closed: the list loads after sign-in sync.
                await pageC.keyboard.press('Escape')
                await desktop.getByRole('button', { name: /account menu/i }).click()
                await expect(desktop.getByRole('group', { name: /viewing/i })).toBeVisible({ timeout: 2_000 })
            }).toPass({ timeout: 30_000 })
            await expect(desktop.getByRole('group', { name: /viewing/i }).getByRole('button', { name: /muser/i })).toHaveAttribute('aria-current', 'true')
        } finally {
            await ctxC.close()
        }
    })

    test('M8: Collab switches back to their own data from the account menu', async ({ browser }) => {
        // Fresh login for the same reason as M7 — loginSyncVersion must trigger shared-with-me.ttl re-read.
        const ctxC = await browser.newContext()
        const pageC = await ctxC.newPage()
        try {
            await pageC.goto('/')
            await loginToCss(pageC, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageC.goto(inviteLink)
            await expect(pageC.getByText(/viewing.*data/i)).toBeVisible({ timeout: 20_000 })

            const desktop = pageC.getByTestId('nav-bar-desktop')
            await desktop.getByRole('button', { name: /account menu/i }).click()
            await desktop.getByRole('group', { name: /viewing/i }).getByRole('button', { name: /your data/i }).click()
            await pageC.waitForURL(/#\/view-lists/, { timeout: 10_000 })
            await expect(pageC.getByText(/viewing.*data/i)).not.toBeVisible()
        } finally {
            await ctxC.close()
        }
    })

    test('M8b: Collab goes back to their own lists from the full-width banner', async () => {
        await pageB.goto(inviteLink)
        const banner = pageB.getByTestId('foreign-pod-banner')
        await expect(banner).toBeVisible({ timeout: 20_000 })

        // Edge to edge, like the app's other banners — not inset in the page.
        const box = await banner.boundingBox()
        expect(box?.x).toBe(0)
        expect(box?.width).toBe(pageB.viewportSize()?.width)

        await banner.getByRole('link', { name: /back to my lists/i }).click()
        await pageB.waitForURL(/#\/view-lists$/, { timeout: 10_000 })
        await expect(pageB.getByText(/viewing.*data/i)).not.toBeVisible()
    })

    test('M9: Owner revokes access; collab is told what to do about it', async ({ browser }) => {
        // Owner revokes
        await pageA.goto('/#/sharing')
        const revokeCollab = pageA.getByRole('button', { name: `Revoke access for ${collabWebId}` })
        await expect(revokeCollab).toBeVisible({ timeout: 10_000 })
        await revokeCollab.click()
        await expect(revokeCollab).not.toBeVisible({ timeout: 10_000 })

        // Fresh context required: pageB has stale PouchDB cache from M3-M6, so the app serves
        // cached data rather than detecting the 403. A fresh login has no local cache.
        const ctxC = await browser.newContext()
        const pageC = await ctxC.newPage()
        try {
            await pageC.goto('/')
            await loginToCss(pageC, CSS_ISSUER, COLLAB_EMAIL, COLLAB_PASSWORD)
            await pageC.goto(inviteLink)
            // Not "Access denied": the screen names the account they are
            // actually signed in as and hands them that address to send back,
            // because a mismatched address is the likelier cause and the one
            // they can fix themselves.
            await expect(pageC.getByRole('heading', { name: /can't open this yet/i })).toBeVisible({ timeout: 20_000 })
            // By test id: the WebID is also in the (hidden) mobile nav, so a
            // text match picks up a node nobody can see.
            await expect(pageC.getByTestId('sharing-address')).toHaveText(collabWebId)
            await expect(pageC.getByRole('button', { name: /copy my address/i })).toBeVisible()
        } finally {
            await ctxC.close()
        }
    })
})
