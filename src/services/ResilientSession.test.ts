import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint, createLocalJWKSet, decodeProtectedHeader, type JWK } from 'jose'
import {
    ResilientSession,
    SessionEndedError,
    ExternalLoginError,
    type ResilientSessionOptions,
} from './ResilientSession'

/**
 * These cover the exchange that decides whether a user stays logged in.
 *
 * The case that matters most is the one the underlying library gets wrong: a
 * refresh that succeeds at the token endpoint but fails afterwards. The provider
 * has already retired the old refresh token by then, so if the replacement is not
 * banked immediately the session is unrecoverable — and presenting the spent one
 * next time gets the entire grant revoked as a suspected replay.
 */

const TOKEN_ENDPOINT = 'https://idp.example.org/token'
const JWKS_URI = 'https://idp.example.org/jwks'
const IDP = 'https://idp.example.org'
const CLIENT_ID = 'https://app.example.org/client-id.json'
const WEB_ID = 'https://user.example.org/profile/card#me'

/** An in-memory stand-in for SessionIDB. */
class FakeDb {
    items = new Map<string, unknown>()
    closed = 0
    async init() { return this }
    async setItem(id: string, value: unknown) { this.items.set(id, value) }
    async getItem(id: string) { return this.items.has(id) ? this.items.get(id) : null }
    async deleteItem(id: string) { this.items.delete(id) }
    async clear() { this.items.clear() }
    close() { this.closed++ }
}

let signingKeys: Awaited<ReturnType<typeof generateKeyPair>>
let dpopKeys: Awaited<ReturnType<typeof generateKeyPair>>
let localJwks: ReturnType<typeof createLocalJWKSet>

async function makeAccessToken(
    opts: { expiresIn?: string | number; signWith?: CryptoKey; omitWebId?: boolean; jkt?: string } = {},
): Promise<string> {
    const jkt = opts.jkt ?? await calculateJwkThumbprint(await exportJWK(dpopKeys.publicKey))
    return new SignJWT({
        ...(opts.omitWebId ? {} : { webid: WEB_ID }),
        client_id: CLIENT_ID,
        cnf: { jkt },
    })
        .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
        .setIssuer(IDP)
        .setAudience('solid')
        .setIssuedAt()
        .setExpirationTime(opts.expiresIn ?? '1h')
        .sign(opts.signWith ?? signingKeys.privateKey)
}

function makeSession(
    db: FakeDb,
    onExpiration?: () => void,
    overrides: Partial<ResilientSessionOptions> = {},
) {
    return new ResilientSession(
        { client_id: CLIENT_ID },
        db as unknown as ConstructorParameters<typeof ResilientSession>[1],
        {
            onSessionExpiration: onExpiration,
            // Verify against the local test key set rather than a remote JWKS.
            resolveJwks: () => localJwks,
            ...overrides,
        },
    )
}

function seed(db: FakeDb, refreshToken = 'refresh-token-v1') {
    db.items.set('client_id', CLIENT_ID)
    db.items.set('token_endpoint', TOKEN_ENDPOINT)
    db.items.set('dpop_keypair', dpopKeys)
    db.items.set('refresh_token', refreshToken)
    db.items.set('idp', IDP)
    db.items.set('jwks_uri', JWKS_URI)
}

describe('ResilientSession', () => {
    let db: FakeDb

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        signingKeys = await generateKeyPair('ES256')
        dpopKeys = await generateKeyPair('ES256')
        const jwk = await exportJWK(signingKeys.publicKey)
        localJwks = createLocalJWKSet({ keys: [{ ...jwk, alg: 'ES256', kid: 'test-key', use: 'sig' }] })
        db = new FakeDb()
        seed(db)
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('banks the rotated refresh token even when the refresh fails afterwards', async () => {
        // The provider rotates and answers 200, then verification fails — exactly
        // the window where the old token is already spent. Whatever goes wrong
        // after the exchange, the replacement must not be lost with it.
        const strangerKeys = await generateKeyPair('ES256')
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                return new Response(JSON.stringify({
                    access_token: await makeAccessToken({ signWith: strangerKeys.privateKey }),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 3600,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new TypeError('Network request failed')
        }))

        const session = makeSession(db)
        await expect(session.restore()).rejects.toThrow()

        // The replacement must have survived the failure. Keeping the old value
        // here is what strands a session for good.
        expect(db.items.get('refresh_token')).toBe('refresh-token-v2')
        session.cancelRenewal()
    }, 30_000)

    it('restores the session and stores the rotated token on success', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                return new Response(JSON.stringify({
                    access_token: await makeAccessToken(),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 3600,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new Error(`unexpected request to ${url}`)
        }))

        const session = makeSession(db)
        await session.restore()

        expect(session.isActive).toBe(true)
        expect(session.webId).toBe(WEB_ID)
        expect(db.items.get('refresh_token')).toBe('refresh-token-v2')
        session.cancelRenewal()
    }, 30_000)

    it('ends the session only when the provider rejects the grant', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ error: 'invalid_grant', error_description: 'grant request is invalid' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        )))

        const onExpiration = vi.fn()
        const session = makeSession(db, onExpiration)

        await expect(session.restore()).rejects.toBeInstanceOf(SessionEndedError)
        expect(onExpiration).toHaveBeenCalledTimes(1)
    }, 30_000)

    it('records why the session ended, before telling the UI about it', async () => {
        // dispatchExpirationEvent() carries no payload, so the reason has to be
        // readable off the session itself by the time the callback fires — that
        // is what lets the UI say "your identity provider ended this" instead of
        // a generic, possibly misleading "something went wrong".
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ error: 'invalid_grant' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        )))

        let reasonWhenNotified: string | undefined
        const session = makeSession(db, () => { reasonWhenNotified = session.lastEndedReason })

        await expect(session.restore()).rejects.toBeInstanceOf(SessionEndedError)

        expect(session.lastEndedReason).toBe('invalid_grant')
        expect(reasonWhenNotified).toBe('invalid_grant')
    }, 30_000)

    it('retries a 503 rather than treating it as the end of the session', async () => {
        const fetchMock = vi.fn(async () => new Response('upstream unavailable', { status: 503 }))
        vi.stubGlobal('fetch', fetchMock)

        const onExpiration = vi.fn()
        const session = makeSession(db, onExpiration)

        await expect(session.restore()).rejects.not.toBeInstanceOf(SessionEndedError)
        expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
        // A struggling server is not a logged-out user.
        expect(onExpiration).not.toHaveBeenCalled()
        expect(db.items.get('refresh_token')).toBe('refresh-token-v1')
        session.cancelRenewal()
    }, 30_000)

    it('retries an unreachable token endpoint and keeps the refresh token', async () => {
        const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch') })
        vi.stubGlobal('fetch', fetchMock)

        const onExpiration = vi.fn()
        const session = makeSession(db, onExpiration)

        await expect(session.restore()).rejects.not.toBeInstanceOf(SessionEndedError)
        expect(onExpiration).not.toHaveBeenCalled()
        expect(db.items.get('refresh_token')).toBe('refresh-token-v1')
        session.cancelRenewal()
    }, 30_000)

    it('recovers on a later attempt once the network comes back', async () => {
        // One blip, then the network is there. The retry inside a single restore()
        // should ride straight over it. Longer outages are the caller's backoff.
        let failuresLeft = 1
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                if (failuresLeft-- > 0) throw new TypeError('Failed to fetch')
                return new Response(JSON.stringify({
                    access_token: await makeAccessToken(),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 3600,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new Error(`unexpected request to ${url}`)
        }))

        const session = makeSession(db)
        await session.restore()

        expect(session.isActive).toBe(true)
        session.cancelRenewal()
    }, 30_000)

    it('reports no stored session when there is nothing to restore', async () => {
        const empty = new FakeDb()
        const session = makeSession(empty)
        expect(await session.hasStoredSession()).toBe(false)
        expect(await makeSession(db).hasStoredSession()).toBe(true)
    })

    it('wants renewal before the token has actually lapsed', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                return new Response(JSON.stringify({
                    // 90s of life left: still valid, but inside the renewal buffer.
                    access_token: await makeAccessToken({ expiresIn: '90s' }),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 90,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new Error(`unexpected request to ${url}`)
        }))

        const session = makeSession(db)
        await session.restore()

        expect(session.isActive).toBe(true)
        expect(session.getExpiresIn()).toBeGreaterThan(0)
        expect(session.needsRenewal()).toBe(true)
        session.cancelRenewal()
    }, 30_000)

    it('comes back on its own after a refresh that failed transiently', async () => {
        // A phone waking with the radio still down is the common case: the timer
        // that was due while it slept fires, the refresh fails, and nothing has
        // asked for a retry. Without one the token quietly lapses and the grant
        // is left to rot until the provider gives up on it.
        const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch') })
        vi.stubGlobal('fetch', fetchMock)

        const session = makeSession(db, undefined, { transientRetryDelaysMs: [10] })
        await expect(session.restore()).rejects.not.toBeInstanceOf(SessionEndedError)

        const callsSoFar = fetchMock.mock.calls.length
        expect(callsSoFar).toBeGreaterThan(0)

        // Nothing else is watching. The session must come back by itself.
        await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsSoFar))
        session.cancelRenewal()
    }, 30_000)

    it('stops trying once the provider has rejected the grant', async () => {
        const fetchMock = vi.fn(async () => new Response(
            JSON.stringify({ error: 'invalid_grant' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        ))
        vi.stubGlobal('fetch', fetchMock)

        const session = makeSession(db, undefined, { transientRetryDelaysMs: [10] })
        await expect(session.restore()).rejects.toBeInstanceOf(SessionEndedError)

        const callsSoFar = fetchMock.mock.calls.length
        // A dead grant is not worth hammering the token endpoint over.
        await new Promise(resolve => setTimeout(resolve, 200))
        expect(fetchMock.mock.calls.length).toBe(callsSoFar)
    }, 30_000)

    it('never erases the stored session over a token it cannot make sense of', async () => {
        // SessionCore answers an access token with no `webid` claim by calling its
        // own logout(), which clears IndexedDB — the refresh token with it. The
        // provider is having a bad minute; that must not cost the session.
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                return new Response(JSON.stringify({
                    access_token: await makeAccessToken({ omitWebId: true }),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 3600,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new Error(`unexpected request to ${url}`)
        }))

        const onExpiration = vi.fn()
        const session = makeSession(db, onExpiration)

        await expect(session.restore()).rejects.not.toBeInstanceOf(SessionEndedError)

        expect(db.items.get('refresh_token')).toBe('refresh-token-v2')
        expect(db.items.size).toBeGreaterThan(1)
        expect(onExpiration).not.toHaveBeenCalled()
        session.cancelRenewal()
    }, 30_000)
})

/**
 * Signing in from the native app, through the system browser (#358).
 *
 * The library's own login navigates the page it runs in, and its callback
 * handler sends that page's URL as the token request's `redirect_uri`. In the
 * native shell that page is the WebView at `https://localhost`, while the
 * provider sent the user back to a custom scheme — so the provider would refuse
 * the exchange. These pin the half the app does itself: an authorize URL handed
 * to the system browser, and a code exchange that names the redirect URI the
 * provider actually used.
 */
describe('ResilientSession external-agent login', () => {
    const AUTHORIZATION_ENDPOINT = 'https://idp.example.org/auth'
    const REDIRECT_URI = 'com.example.app:/auth-callback'

    let db: FakeDb
    let tokenRequests: { body: URLSearchParams; dpop: string | null }[]
    let tokenResponse: (jkt: string) => Promise<Response>

    const openIdConfiguration = (issuer = IDP) => ({
        issuer,
        authorization_endpoint: AUTHORIZATION_ENDPOINT,
        token_endpoint: TOKEN_ENDPOINT,
        jwks_uri: JWKS_URI,
    })

    function stubProvider(configuration = openIdConfiguration()) {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url === `${IDP}/.well-known/openid-configuration`) {
                return Response.json(configuration)
            }
            if (url === TOKEN_ENDPOINT) {
                const dpop = new Headers(init?.headers).get('dpop')
                tokenRequests.push({ body: new URLSearchParams(String(init?.body)), dpop })
                // Bind the access token to whatever key the client proved it holds,
                // as a real provider does.
                const jwk = decodeProtectedHeader(dpop ?? '').jwk as JWK
                return tokenResponse(await calculateJwkThumbprint(jwk))
            }
            throw new Error(`unexpected request to ${url}`)
        }))
    }

    /** Starts a login and returns the authorize URL the system browser was given. */
    async function begin(session: ResilientSession): Promise<URL> {
        const open = vi.fn(async (_url: string) => {})
        await session.beginExternalLogin(IDP, REDIRECT_URI, open)
        expect(open).toHaveBeenCalledTimes(1)
        return new URL(open.mock.calls[0][0])
    }

    /** What the provider sends the browser back to once the user has consented. */
    function callbackFor(authorize: URL, overrides: Record<string, string | null> = {}): string {
        const params = new URLSearchParams({
            code: 'authorization-code-1',
            state: authorize.searchParams.get('state') ?? '',
            iss: IDP,
        })
        for (const [key, value] of Object.entries(overrides)) {
            if (value === null) params.delete(key)
            else params.set(key, value)
        }
        return `${REDIRECT_URI}?${params}`
    }

    async function s256(verifier: string): Promise<string> {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
        return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        signingKeys = await generateKeyPair('ES256')
        dpopKeys = await generateKeyPair('ES256')
        const jwk = await exportJWK(signingKeys.publicKey)
        localJwks = createLocalJWKSet({ keys: [{ ...jwk, alg: 'ES256', kid: 'test-key', use: 'sig' }] })
        db = new FakeDb()
        localStorage.clear()
        tokenRequests = []
        tokenResponse = async jkt => Response.json({
            access_token: await makeAccessToken({ jkt }),
            refresh_token: 'refresh-token-from-login',
            expires_in: 3600,
            token_type: 'DPoP',
        })
        stubProvider()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('hands the system browser a PKCE authorize request for the given redirect URI', async () => {
        const session = makeSession(db)
        const authorize = await begin(session)

        expect(authorize.origin + authorize.pathname).toBe(AUTHORIZATION_ENDPOINT)
        expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
            response_type: 'code',
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            scope: 'openid offline_access webid',
            code_challenge_method: 'S256',
            // CSS only issues a refresh token when consent is asked for explicitly.
            prompt: 'consent',
        })
        expect(authorize.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(authorize.searchParams.get('state')).toBeTruthy()
        // Nothing is stored until the provider has actually said yes.
        expect(db.items.size).toBe(0)
    })

    it('refuses a provider whose configuration names a different issuer (RFC 9207)', async () => {
        stubProvider(openIdConfiguration('https://impostor.example.org'))
        const open = vi.fn(async () => {})

        await expect(makeSession(db).beginExternalLogin(IDP, REDIRECT_URI, open)).rejects.toThrow(/issuer/i)
        expect(open).not.toHaveBeenCalled()
    })

    it('exchanges the code naming the redirect URI the provider used, not the page it runs in', async () => {
        const session = makeSession(db)
        const authorize = await begin(session)

        await session.completeExternalLogin(callbackFor(authorize))

        expect(tokenRequests).toHaveLength(1)
        const { body, dpop } = tokenRequests[0]
        expect(body.get('grant_type')).toBe('authorization_code')
        expect(body.get('code')).toBe('authorization-code-1')
        expect(body.get('redirect_uri')).toBe(REDIRECT_URI)
        expect(body.get('client_id')).toBe(CLIENT_ID)
        expect(await s256(body.get('code_verifier') ?? '')).toBe(authorize.searchParams.get('code_challenge'))
        expect(dpop).toBeTruthy()
    })

    it('signs the user in and tells the app so', async () => {
        const onSessionStateChange = vi.fn()
        const session = makeSession(db, undefined, { onSessionStateChange })
        const authorize = await begin(session)

        await session.completeExternalLogin(callbackFor(authorize))

        expect(session.isActive).toBe(true)
        expect(session.webId).toBe(WEB_ID)
        expect(onSessionStateChange).toHaveBeenCalled()
    })

    it('stores the session where a later restore will look for it', async () => {
        const session = makeSession(db)
        await session.completeExternalLogin(callbackFor(await begin(session)))

        expect(db.items.get('refresh_token')).toBe('refresh-token-from-login')
        expect(db.items.get('client_id')).toBe(CLIENT_ID)
        expect(db.items.get('idp')).toBe(IDP)
        expect(db.items.get('token_endpoint')).toBe(TOKEN_ENDPOINT)
        expect(db.items.get('jwks_uri')).toBe(JWKS_URI)
        expect(db.items.get('dpop_keypair')).toBeTruthy()

        // A reload (or a cold start) restores from exactly those items.
        const bankedKeys = db.items.get('dpop_keypair') as { publicKey: CryptoKey }
        const bankedJkt = await calculateJwkThumbprint(await exportJWK(bankedKeys.publicKey))
        tokenResponse = async jkt => {
            expect(jkt).toBe(bankedJkt)
            return Response.json({
                access_token: await makeAccessToken({ jkt }),
                refresh_token: 'refresh-token-rotated',
                expires_in: 3600,
                token_type: 'DPoP',
            })
        }
        const afterReload = makeSession(db)
        await afterReload.restore()

        expect(afterReload.isActive).toBe(true)
        expect(tokenRequests.at(-1)?.body.get('refresh_token')).toBe('refresh-token-from-login')
        afterReload.cancelRenewal()
    })

    it('banks the refresh token before anything that can throw', async () => {
        const strangerKeys = await generateKeyPair('ES256')
        tokenResponse = async jkt => Response.json({
            access_token: await makeAccessToken({ jkt, signWith: strangerKeys.privateKey }),
            refresh_token: 'refresh-token-from-login',
            expires_in: 3600,
            token_type: 'DPoP',
        })
        const session = makeSession(db)

        await expect(session.completeExternalLogin(callbackFor(await begin(session)))).rejects.toThrow()

        expect(db.items.get('refresh_token')).toBe('refresh-token-from-login')
    })

    it('survives the app being killed while the browser was open', async () => {
        // Android reclaims a backgrounded app freely, and a sign-in can take the
        // user minutes. The callback then lands in a brand-new process.
        const authorize = await begin(makeSession(db))

        const coldStarted = makeSession(db)
        await coldStarted.completeExternalLogin(callbackFor(authorize))

        expect(coldStarted.isActive).toBe(true)
    })

    describe('a callback it cannot trust never costs the session already stored', () => {
        beforeEach(() => seed(db, 'existing-refresh-token'))

        const expectStoredSessionIntact = () => {
            expect(db.items.get('refresh_token')).toBe('existing-refresh-token')
            expect(db.items.get('dpop_keypair')).toBe(dpopKeys)
            expect(tokenRequests).toHaveLength(0)
        }

        it('rejects a state it did not issue, and keeps waiting for the real one', async () => {
            const session = makeSession(db)
            const authorize = await begin(session)

            await expect(session.completeExternalLogin(callbackFor(authorize, { state: 'forged' })))
                .rejects.toMatchObject({ reason: 'state-mismatch' })
            expectStoredSessionIntact()

            // A forged callback must not cancel the sign-in the user is part-way through.
            await session.completeExternalLogin(callbackFor(authorize))
            expect(session.isActive).toBe(true)
        })

        it('rejects a callback from a different issuer', async () => {
            const session = makeSession(db)
            const authorize = await begin(session)

            await expect(session.completeExternalLogin(callbackFor(authorize, { iss: 'https://impostor.example.org' })))
                .rejects.toMatchObject({ reason: 'issuer-mismatch' })
            expectStoredSessionIntact()
        })

        it('rejects a callback on a redirect URI it did not ask for', async () => {
            const session = makeSession(db)
            const authorize = await begin(session)
            const elsewhere = callbackFor(authorize).replace(REDIRECT_URI, 'com.example.app:/elsewhere')

            await expect(session.completeExternalLogin(elsewhere)).rejects.toMatchObject({ reason: 'redirect-mismatch' })
            expectStoredSessionIntact()
        })

        it('reports the provider refusing, and forgets the attempt', async () => {
            const session = makeSession(db)
            const authorize = await begin(session)

            await expect(session.completeExternalLogin(callbackFor(authorize, { code: null, error: 'access_denied' })))
                .rejects.toMatchObject({ reason: 'access_denied' })
            expectStoredSessionIntact()
            expect(session.hasPendingExternalLogin()).toBe(false)
        })

        it('rejects a callback when no sign-in was started', async () => {
            const stray = `${REDIRECT_URI}?code=c&state=s&iss=${encodeURIComponent(IDP)}`

            await expect(makeSession(db).completeExternalLogin(stray)).rejects.toMatchObject({ reason: 'no-pending-login' })
            expectStoredSessionIntact()
        })

        it('rejects a callback for a sign-in abandoned long ago', async () => {
            const session = makeSession(db)
            const authorize = await begin(session)
            vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60 * 60 * 1000)

            await expect(session.completeExternalLogin(callbackFor(authorize))).rejects.toMatchObject({ reason: 'expired' })
            expectStoredSessionIntact()
        })
    })

    it('reports failures as ExternalLoginError', async () => {
        const session = makeSession(db)
        await expect(session.completeExternalLogin(`${REDIRECT_URI}?code=c&state=s`)).rejects.toBeInstanceOf(ExternalLoginError)
    })
})
