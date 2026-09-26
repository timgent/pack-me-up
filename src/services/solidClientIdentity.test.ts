import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    HOSTED_CLIENT_ID_URL,
    HOSTED_NATIVE_CLIENT_ID_URL,
    LEGACY_NATIVE_REDIRECT_URI,
    NATIVE_AUTH_REDIRECT_URI,
    solidClientDetails,
} from './solidClientIdentity'

/**
 * Which client the app presents itself as decides how long a session survives.
 *
 * A hosted Client ID Document is a permanent identity: the provider re-reads it
 * on every grant, and the registration cannot go stale. A dynamic registration
 * is a throwaway one, created at login and kept only for as long as the provider
 * feels like keeping it — when it is reaped, the next refresh comes back
 * `invalid_client`, which is terminal, and the user is signed out with a
 * perfectly good refresh token on disk.
 *
 * The native shell is served from `https://localhost`, so it used to fall
 * through to dynamic registration on every install. These pin it to a hosted
 * document instead — its own one, since it signs in through the system browser
 * and comes back on a redirect URI no web client may register (#358).
 */

describe('solidClientDetails', () => {
    it('uses the hosted native Client ID Document in the native app', () => {
        expect(solidClientDetails({ isNativePlatform: true, origin: 'https://localhost' }))
            .toEqual({ client_id: HOSTED_NATIVE_CLIENT_ID_URL })
    })

    it('uses the configured Client ID Document on the deployed site', () => {
        expect(solidClientDetails({
            clientIdUrl: 'https://packmeup.example.com/client-id.json',
            isNativePlatform: false,
            origin: 'https://packmeup.example.com',
        })).toEqual({ client_id: 'https://packmeup.example.com/client-id.json' })
    })

    it('lets a configured native document override the hosted one, so a preview build can be tested natively', () => {
        expect(solidClientDetails({
            nativeClientIdUrl: 'https://preview.example.com/client-id-native.json',
            isNativePlatform: true,
            origin: 'https://localhost',
        })).toEqual({ client_id: 'https://preview.example.com/client-id-native.json' })
    })

    it('never hands the native app the web document, which cannot list its redirect URI', () => {
        // A build with VITE_CLIENT_ID_URL set for the website must not send the
        // phone back to a document its custom-scheme redirect is not in — the
        // provider would refuse every sign-in.
        expect(solidClientDetails({
            clientIdUrl: 'https://packmeup.example.com/client-id.json',
            isNativePlatform: true,
            origin: 'https://localhost',
        })).toEqual({ client_id: HOSTED_NATIVE_CLIENT_ID_URL })
    })

    it('registers dynamically on a web origin with no hosted document, such as a preview deploy', () => {
        expect(solidClientDetails({ isNativePlatform: false, origin: 'https://preview.example.com' }))
            .toEqual({ redirect_uris: ['https://preview.example.com/'], client_name: 'Pack Me Up' })
    })
})

type ClientIdDocument = {
    client_id: string
    redirect_uris: string[]
    application_type?: string
    [field: string]: unknown
}

const readDocument = (file: string) => JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../public', file), 'utf-8'),
) as ClientIdDocument

/**
 * `oidc-provider` — what Community Solid Server and Inrupt's ESS are built on —
 * validates every redirect URI in a Client ID Document against the document's
 * `application_type` (lib/helpers/client_schema.js), and one bad entry
 * invalidates the whole document. These encode its rules so the two documents
 * cannot drift into a shape a provider would refuse.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

describe('the hosted Client ID Document', () => {
    const document = readDocument('client-id.json')

    it('is the document the website claims to be', () => {
        expect(document.client_id).toBe(HOSTED_CLIENT_ID_URL)
    })

    it('is a web client, so it lists web URIs only', () => {
        // Adding the native app's custom-scheme redirect here would make the
        // provider reject this document outright — and with it every sign-in
        // from the website. The native app has its own document for that.
        expect(document.application_type ?? 'web').toBe('web')
        for (const uri of document.redirect_uris) {
            expect(['https:', 'http:']).toContain(new URL(uri).protocol)
        }
    })

    it('still lists the redirect URI that app versions released before #358 send', () => {
        // Those builds sign in inside the WebView and return to their own loopback
        // origin. Drop this entry and every phone that has not updated yet cannot
        // log in at all.
        expect(document.redirect_uris).toContain(LEGACY_NATIVE_REDIRECT_URI)
    })
})

describe('the hosted native Client ID Document', () => {
    const document = readDocument('client-id-native.json')
    const web = readDocument('client-id.json')

    it('is the document the native app claims to be', () => {
        expect(document.client_id).toBe(HOSTED_NATIVE_CLIENT_ID_URL)
    })

    it('is a native client, the only kind allowed a custom-scheme redirect', () => {
        expect(document.application_type).toBe('native')
    })

    it('lists the redirect URI the system browser hands back to the app', () => {
        expect(document.redirect_uris).toContain(NATIVE_AUTH_REDIRECT_URI)
    })

    it('lists only URIs a native client may register', () => {
        for (const uri of document.redirect_uris) {
            const { protocol, hostname, hash } = new URL(uri)
            expect(hash).toBe('')
            if (protocol === 'https:') {
                expect(LOOPBACK_HOSTS.has(hostname)).toBe(false)
            } else if (protocol === 'http:') {
                expect(LOOPBACK_HOSTS.has(hostname)).toBe(true)
            } else {
                // RFC 8252 §7.1: a private-use scheme must be reverse-domain.
                expect(protocol).toContain('.')
            }
        }
    })

    it('presents the same app, asking for the same access, as the web document', () => {
        for (const field of ['@context', 'client_name', 'client_uri', 'scope', 'grant_types']) {
            expect(document[field], field).toEqual(web[field])
        }
    })
})
