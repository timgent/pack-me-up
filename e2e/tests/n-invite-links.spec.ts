import { test, expect } from '../fixtures'
import { fillPersonRequiredFields } from '../helpers/wizard'
import { loginToCss } from '../helpers/login'
import { createCssAccount } from '../helpers/css-api'
import {
    CSS_ISSUER,
    CSS_PORT,
    NUSER_EMAIL,
    NUSER_PASSWORD,
    NUSER_POD_NAME,
    NINVITEE_EMAIL,
    NINVITEE_PASSWORD,
    NINVITEE_POD_NAME,
} from '../../playwright.config'

/**
 * N — invite links, end to end across two Pods.
 *
 * The point of the feature is that neither person ever types the other's
 * address, so that is what these assert: the inviter only ever sees a link,
 * the invitee only ever clicks one, and access appears.
 *
 * Serial, and on two Pods nobody else uses: the invitee's WebID ends up
 * written into the inviter's Pod and then granted access to everything in it.
 */
test.describe.configure({ mode: 'serial' })

test.describe('N – Invite links', () => {
    let ctxA: import('@playwright/test').BrowserContext
    let pageA: import('@playwright/test').Page
    // The invitee's own browser, kept from accepting through to opening: the
    // path under test is theirs, and it has to get there without being handed
    // a URL.
    let ctxB: import('@playwright/test').BrowserContext
    let pageB: import('@playwright/test').Page
    let inviteLink: string

    const inviteeWebId = `http://localhost:${CSS_PORT}/${NINVITEE_POD_NAME}/profile/card#me`
    const inviterPodUrl = `http://localhost:${CSS_PORT}/${NUSER_POD_NAME}/`

    test.beforeAll(async ({ browser }) => {
        ctxA = await browser.newContext()
        pageA = await ctxA.newPage()
        await pageA.goto('/')
        await loginToCss(pageA, CSS_ISSUER, NUSER_EMAIL, NUSER_PASSWORD)

        // A question set *and* a list on the Pod, so the full setup has
        // something in it. A list matters specifically: `verifyForeignPodAccess`
        // reads the packing-lists container, and an inviter who has never made
        // one has no such container to read.
        await pageA.goto('/#/create-packing-list')
        const nameInput = pageA.getByLabel('Packing List Name')
        const ready = await nameInput.isVisible({ timeout: 8_000 }).catch(() => false)
        if (!ready) {
            await pageA.goto('/#/wizard')
            await fillPersonRequiredFields(pageA)
            await pageA.getByRole('button', { name: /Generate My Packing Questions/i }).click()
            try { await pageA.getByRole('button', { name: 'Yes, Override' }).click({ timeout: 3_000 }) } catch { /* first run */ }
            await pageA.getByRole('heading', { name: /Questions Generated Successfully/i }).waitFor({ timeout: 20_000 })
            await pageA.getByRole('button', { name: /Create My First Packing List/i }).click()
            await pageA.waitForURL(/#\/create-packing-list/, { timeout: 10_000 })
        }

        await pageA.getByLabel('Packing List Name').waitFor({ timeout: 15_000 })
        await pageA.getByLabel('Packing List Name').fill(`Invite Trip ${Date.now()}`)
        await pageA.getByRole('button', { name: 'Create Packing List' }).click()
        await pageA.waitForURL(/#\/view-lists\//, { timeout: 15_000 })
    })

    test.afterAll(async () => {
        await ctxA?.close()
        await ctxB?.close()
    })

    test('N1: inviter creates an invite link without typing any address', async () => {
        await pageA.goto('/#/sharing')
        await pageA.getByRole('button', { name: /create invite link/i }).first().click()

        const field = pageA.getByRole('textbox', { name: /invite link/i })
        await expect(field).toBeVisible({ timeout: 20_000 })
        inviteLink = await field.inputValue()

        expect(inviteLink).toContain('/#/invite/')
        expect(inviteLink).toContain(`pod=${encodeURIComponent(inviterPodUrl)}`)
        // Nobody has been named anywhere in this flow.
        expect(inviteLink).not.toContain(NINVITEE_POD_NAME)
    })

    test('N2: the link appears as outstanding, not yet accepted', async () => {
        await pageA.goto('/#/sharing')
        await expect(pageA.getByRole('heading', { name: /invite links you've sent/i })).toBeVisible({ timeout: 20_000 })
        await expect(pageA.getByText(/not accepted yet/i)).toBeVisible()
    })

    test('N3: the invitee opens the link and accepts, without typing an address either', async ({ browser }) => {
        ctxB = await browser.newContext()
        pageB = await ctxB.newPage()
        await pageB.goto('/')
        await loginToCss(pageB, CSS_ISSUER, NINVITEE_EMAIL, NINVITEE_PASSWORD)
        await pageB.goto(inviteLink)

        await expect(pageB.getByRole('heading', { name: /wants to share/i })).toBeVisible({ timeout: 20_000 })
        await pageB.getByRole('button', { name: /accept invite/i }).click()

        await expect(pageB.getByRole('heading', { name: /accepted/i })).toBeVisible({ timeout: 20_000 })
        // The delay is stated rather than hidden: there is no server to
        // grant while the inviter is away.
        await expect(pageB.getByText(/next time they open Pack Me Up/i)).toBeVisible()
    })

    test('N3b: the invitee sees the share waiting on the inviter, straight away', async () => {
        // Accepting used to write only to the inviter's Pod, so the invitee's
        // Sharing page had nothing to show for it, before access or after.
        await pageB.getByRole('link', { name: /go to sharing/i }).click()
        await pageB.waitForURL(/#\/sharing/, { timeout: 10_000 })

        await expect(pageB.getByText(/waiting for .* to open Pack Me Up/i)).toBeVisible({ timeout: 20_000 })
    })

    test('N4: the inviter opens the app and the invitee is granted access', async () => {
        // A fresh load is the moment redemption runs — the same thing that
        // happens when they next pick up their phone.
        await pageA.goto('/#/sharing')
        await pageA.reload()

        await expect(pageA.getByRole('heading', { name: /people with your full setup/i }).or(
            pageA.getByText(/people with your full setup/i),
        )).toBeVisible({ timeout: 20_000 })

        await expect(pageA.getByText(inviteeWebId)).toBeVisible({ timeout: 30_000 })
    })

    test('N5: the invite is used up, so a stranger holding the link cannot replay it', async ({ browser }) => {
        await expect(pageA.getByRole('heading', { name: /invite links you've sent/i })).toBeHidden({ timeout: 20_000 })

        // Deliberately somebody with no relationship to the inviter. The
        // original invitee is now a full-setup collaborator, which includes
        // write access to the invites container — so *they* can re-create the
        // deleted resource, and proving anything with them would prove the
        // wrong thing. See the note on invite visibility in CLAUDE.md.
        const stranger = `nstranger${Date.now().toString(36)}`
        await createCssAccount(CSS_PORT, `${stranger}@example.com`, 'test1234', stranger)

        const ctxC = await browser.newContext()
        const pageC = await ctxC.newPage()
        try {
            await pageC.goto('/')
            await loginToCss(pageC, CSS_ISSUER, `${stranger}@example.com`, 'test1234')
            await pageC.goto(inviteLink)
            await pageC.getByRole('button', { name: /accept invite/i }).click()

            await expect(pageC.getByText(/no longer exists|not accepting/i)).toBeVisible({ timeout: 20_000 })
        } finally {
            await ctxC.close()
        }
    })

    test('N6: the invitee finds what was shared with them on their Sharing page, and opens it', async () => {
        // From their own Sharing page, not a URL the test assembled: nothing
        // hands a real invitee the inviter's Pod address.
        await pageB.goto('/#/sharing')
        await pageB.reload()

        await expect(pageB.getByText(/waiting for .* to open Pack Me Up/i)).toBeHidden({ timeout: 20_000 })
        const shared = pageB.locator('section', { has: pageB.getByRole('heading', { name: /data shared with me/i }) })
        await shared.getByRole('button', { name: /^open$/i }).click()

        await pageB.waitForURL(/#\/pod\//, { timeout: 10_000 })
        // Access denied would render SharedAccessHelp instead.
        await expect(pageB.getByText(/can't open this yet/i)).toBeHidden({ timeout: 20_000 })
        await expect(pageB.getByText(/Viewing/i)).toBeVisible({ timeout: 20_000 })
    })

    test('N7: once the inviter revokes, the invitee is told it was revoked, not to keep waiting', async () => {
        await pageA.goto('/#/sharing')
        const revoke = pageA.getByRole('button', { name: `Revoke access for ${inviteeWebId}` })
        await expect(revoke).toBeVisible({ timeout: 20_000 })
        await revoke.click()
        await expect(revoke).not.toBeVisible({ timeout: 10_000 })

        await pageB.goto('/#/sharing')
        await pageB.reload()
        // It opened in N6, so a refusal now is access taken away. Before this
        // it read "Waiting for … to open Pack Me Up", which never ends.
        await expect(pageB.getByText(/has stopped sharing this with you/i)).toBeVisible({ timeout: 20_000 })
        await expect(pageB.getByText(/waiting for .* to open Pack Me Up/i)).toBeHidden()
    })
})
