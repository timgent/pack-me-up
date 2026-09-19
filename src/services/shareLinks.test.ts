import { describe, it, expect, afterEach } from 'vitest'
import { buildSharedListPath, buildSharedListUrl, buildSharedSetupPath, buildSharedSetupUrl } from './solidPod'
import { buildInviteLink } from './invites'
import { PUBLIC_APP_ORIGIN, shareOrigin } from './publicAppOrigin'
import type { Invite } from './rdfSerialization'

/**
 * Every link this app builds for somebody else to open, in one place.
 *
 * All three are built on one device and opened on another. Inside the Capacitor
 * shell the runtime origin is `https://localhost`, so for as long as a builder
 * reads it, the link points at the phone that produced it — copyable,
 * shareable, and useless to the person who receives it (#357). The WAC grants
 * behind those links were made correctly all along, which is why this looked
 * like "sharing is local-only" rather than like a bug.
 *
 * The mistake is one line, and every new sharing surface is a fresh chance to
 * make it: the whole-setup invite link repeated it after the list link had it,
 * and `CreateInviteLink` repeated it again. So a new builder of a link that
 * leaves the device goes in the list below, and its call site gets a test that
 * the origin it passes is `shareOrigin()`.
 */

const LIST_ID = 'list-1'
const POD_URL = 'https://pod.example.com/'
const OWNER_WEB_ID = 'https://pod.example.com/profile/card#me'
const INVITE: Invite = {
    token: 'tok-aaaaaaaaaaaaaaaaaaaa',
    kind: 'full-setup',
    createdAt: '2026-01-01T00:00:00.000Z',
}

/** Every builder of a URL that is handed to somebody else. */
const linkBuilders: Array<[string, () => string]> = [
    ['buildSharedListUrl', () => buildSharedListUrl(LIST_ID, POD_URL, OWNER_WEB_ID)],
    ['buildSharedSetupUrl', () => buildSharedSetupUrl(POD_URL, OWNER_WEB_ID)],
    // Takes its origin as an argument; `shareOrigin()` is what every call site
    // must pass, and `CreateInviteLink.test.tsx` holds it to that.
    ['buildInviteLink', () => buildInviteLink(shareOrigin(), POD_URL, OWNER_WEB_ID, INVITE)],
]

describe('links that leave the device', () => {
    const originalLocation = window.location

    const stubOrigin = (origin: string) => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, origin },
        })
    }

    afterEach(() => {
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    })

    it.each(linkBuilders)('%s sends the public origin, not the native shell’s https://localhost', (_name, build) => {
        stubOrigin('https://localhost')
        const link = build()

        expect(link).not.toContain('localhost')
        expect(link.startsWith(`${PUBLIC_APP_ORIGIN}/#/`)).toBe(true)
    })

    it.each(linkBuilders)('%s keeps a real web origin, so a preview deploy links to itself', (_name, build) => {
        stubOrigin('https://preview.example.com')

        expect(build().startsWith('https://preview.example.com/#/')).toBe(true)
    })

    it('still carries everything the recipient needs to open it', () => {
        stubOrigin('https://localhost')

        expect(buildSharedListUrl(LIST_ID, POD_URL, OWNER_WEB_ID))
            .toBe(`${PUBLIC_APP_ORIGIN}/#${buildSharedListPath(LIST_ID, POD_URL, OWNER_WEB_ID)}`)
        expect(buildSharedSetupUrl(POD_URL, OWNER_WEB_ID))
            .toBe(`${PUBLIC_APP_ORIGIN}/#${buildSharedSetupPath(POD_URL, OWNER_WEB_ID)}`)
        expect(buildInviteLink(shareOrigin(), POD_URL, OWNER_WEB_ID, INVITE))
            .toBe(`${PUBLIC_APP_ORIGIN}/#/invite/${INVITE.token}`
                + `?pod=${encodeURIComponent(POD_URL)}&owner=${encodeURIComponent(OWNER_WEB_ID)}&kind=full-setup`)
    })
})
