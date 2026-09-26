import { SessionCore, type SessionOptions } from '@uvdsl/solid-oidc-client-browser/core'
import type { SessionIDB } from '@uvdsl/solid-oidc-client-browser'
import {
    SignJWT,
    exportJWK,
    jwtVerify,
    createRemoteJWKSet,
    calculateJwkThumbprint,
    generateKeyPair,
    type JWTVerifyGetKey,
} from 'jose'
import { logAuthEvent, reportSessionEnded } from './authLog'

/**
 * A SessionCore that treats "I could not reach the token endpoint" and
 * "your session is over" as the different things they are.
 *
 * SessionCore deliberately ships no refresh lifecycle — its docs hand that job to
 * the surrounding app. Its own `restore()` is a single unguarded attempt, and the
 * refresh it performs has an ordering bug that can strand a session permanently:
 *
 *   1. POST the refresh token. The provider consumes it and issues a replacement.
 *   2. Fetch the JWKS over the network and verify the new access token.
 *   3. *Only then* write the replacement refresh token to IndexedDB.
 *
 * If step 2 fails — a dropped connection, a slow JWKS endpoint, a phone whose
 * clock is a few seconds off (jose verifies with zero clock tolerance) — the
 * replacement is thrown away while the provider has already retired the old one.
 * IndexedDB is left holding a spent token. Presenting a spent refresh token is
 * how OAuth clients signal a stolen-token replay, so the provider does not merely
 * refuse it: `oidc-provider`, which backs both CSS and Inrupt's ESS, destroys the
 * whole grant. The next refresh cannot fail any harder, and the only way back is
 * a full re-login.
 *
 * This subclass keeps SessionCore's login, DPoP and fetch handling and replaces
 * only the refresh:
 *
 *   - the replacement refresh token is written **before** anything that can throw;
 *   - refreshes are serialised across tabs with the Web Locks API, so two tabs
 *     waking together cannot both spend the same token and trip replay detection;
 *   - transient failures are retried with backoff instead of ending the session;
 *   - the session ends only when the provider itself rejects the grant;
 *   - tokens are renewed *before* they lapse, so no request races the expiry.
 */

/** Renew this many seconds before the access token actually expires. */
const EXPIRY_BUFFER_SECONDS = 120

/** Tolerated clock difference between this device and the provider. */
const CLOCK_TOLERANCE_SECONDS = 300

/**
 * Attempts within a single restore() before handing back to the caller. Kept
 * small on purpose: SolidPodContext retries on a much longer backoff, and on
 * anything it hears about coming back (network, tab focus). Grinding through a
 * long backoff here would only stall the app's first paint.
 */
const MAX_ATTEMPTS = 2

const RETRY_BASE_MS = 800

/**
 * How long to wait before trying again after a refresh that failed transiently.
 *
 * Something has to own this. On a phone the renewal timer that was due while the
 * device slept fires on the way back up, with the radio still down — the refresh
 * fails, and unless the session asks for another go, nothing does: the app is
 * still "logged in", so the recovery backoff in SolidPodContext (which only
 * covers a session that is not active) never engages. The token then lapses in
 * silence and the grant is left to rot until the provider gives up on it.
 */
const TRANSIENT_RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000, 300_000]

const REFRESH_LOCK = 'pmu-solid-token-refresh'

/**
 * Where a sign-in through the system browser waits for its callback.
 * localStorage rather than the library's sessionStorage: the user can spend
 * minutes in the browser, and Android is free to kill the app meanwhile — the
 * callback then arrives in a new process, which must still be able to finish.
 */
const PENDING_EXTERNAL_LOGIN_KEY = 'pmu-pending-external-login'

/** A sign-in not finished in this long is abandoned; its callback is refused. */
const PENDING_EXTERNAL_LOGIN_TTL_MS = 15 * 60 * 1000

interface PendingExternalLogin {
    idp: string
    tokenEndpoint: string
    jwksUri: string
    clientId: string
    redirectUri: string
    codeVerifier: string
    state: string
    startedAt: number
}

function readPendingExternalLogin(): PendingExternalLogin | undefined {
    try {
        const stored = localStorage.getItem(PENDING_EXTERNAL_LOGIN_KEY)
        return stored ? (JSON.parse(stored) as PendingExternalLogin) : undefined
    } catch {
        return undefined
    }
}

function clearPendingExternalLogin(): void {
    try { localStorage.removeItem(PENDING_EXTERNAL_LOGIN_KEY) } catch { /* nothing to clear */ }
}

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 7636 PKCE, S256 — the same shape the library produces. */
async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
    const verifier = `${crypto.randomUUID()}-${crypto.randomUUID()}`
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
    return { verifier, challenge: base64Url(digest) }
}

const trimTrailingSlash = (url: string) => (url.endsWith('/') ? url.slice(0, -1) : url)

/**
 * Thrown when the provider has rejected the grant itself. This is the only
 * failure that genuinely ends a session — everything else is worth retrying.
 */
export class SessionEndedError extends Error {
    readonly reason: string
    constructor(reason: string, message?: string) {
        super(message ?? `Solid session ended: ${reason}`)
        this.name = 'SessionEndedError'
        this.reason = reason
    }
}

/**
 * A sign-in through the system browser that cannot be completed. `reason` says
 * why: the provider's own `error` code, or one of ours — `no-pending-login`,
 * `expired`, `state-mismatch`, `issuer-mismatch`, `redirect-mismatch`,
 * `token-request-failed`.
 */
export class ExternalLoginError extends Error {
    readonly reason: string
    constructor(reason: string, message?: string) {
        super(message ?? `Sign-in could not be completed: ${reason}`)
        this.name = 'ExternalLoginError'
        this.reason = reason
    }
}

/** A failure we expect to recover from — network, server, or verification hiccup. */
class TransientRefreshError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'TransientRefreshError'
    }
}

interface StoredKeyPair {
    publicKey: CryptoKey
    privateKey: CryptoKey
}

interface TokenResponse {
    access_token: string
    refresh_token?: string
    expires_in: number
    token_type: string
    id_token?: string
    scope?: string
}

/**
 * One JWKS per issuer, reused across refreshes. `createRemoteJWKSet` caches
 * internally, so holding the instance keeps the refresh path off the network in
 * the common case — one fewer thing that can fail mid-refresh.
 */
const jwksCache = new Map<string, JWTVerifyGetKey>()

function jwksFor(jwksUri: string): JWTVerifyGetKey {
    let jwks = jwksCache.get(jwksUri)
    if (!jwks) {
        jwks = createRemoteJWKSet(new URL(jwksUri))
        jwksCache.set(jwksUri, jwks)
    }
    return jwks
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Runs `fn` while holding a browser-wide lock, so only one tab refreshes at a
 * time. Falls back to running unguarded where Web Locks is unavailable.
 */
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (!locks?.request) return fn()
    return locks.request(REFRESH_LOCK, fn) as Promise<T>
}

/** Builds the DPoP proof for the token request. */
async function createTokenEndpointDPoP(tokenEndpoint: string, keyPair: StoredKeyPair): Promise<string> {
    const publicJwk = await exportJWK(keyPair.publicKey)
    publicJwk.alg = 'ES256'
    return new SignJWT({ htu: tokenEndpoint, htm: 'POST' })
        .setIssuedAt()
        .setJti(crypto.randomUUID())
        .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: publicJwk })
        .sign(keyPair.privateKey)
}

/**
 * The provider's answer to a refused grant tells us whether to give up. Only
 * `invalid_grant` means the refresh token itself is finished; `invalid_client`
 * means our registration is gone. Everything else — 429, 5xx, a gateway's HTML
 * error page — is worth another try.
 */
function classifyTokenError(status: number, body: string): TransientRefreshError | SessionEndedError {
    let oauthError = ''
    try {
        oauthError = (JSON.parse(body) as { error?: string }).error ?? ''
    } catch {
        // Not JSON — a proxy or gateway error page. Treat as transient.
    }

    if (oauthError === 'invalid_grant') {
        return new SessionEndedError('invalid_grant', 'The identity provider rejected the refresh token.')
    }
    if (oauthError === 'invalid_client' || oauthError === 'unauthorized_client') {
        return new SessionEndedError(oauthError, 'The identity provider no longer recognises this app registration.')
    }
    return new TransientRefreshError(`Token endpoint returned ${status}${oauthError ? ` (${oauthError})` : ''}`)
}

export interface ResilientSessionOptions extends Omit<SessionOptions, 'database'> {
    /**
     * How to obtain the provider's signing keys. Injectable so tests can verify
     * against a local key set instead of reaching the network.
     */
    resolveJwks?: (jwksUri: string) => JWTVerifyGetKey
    /**
     * The backoff between retries after a transient failure. Injectable so tests
     * can watch a session come back without waiting out five real seconds.
     */
    transientRetryDelaysMs?: readonly number[]
}

export class ResilientSession extends SessionCore {
    /** SessionCore keeps its database private, so we hold our own handle. */
    private readonly db: SessionIDB
    /** And its client details, which the external-agent login needs. */
    private readonly clientDetails: ConstructorParameters<typeof SessionCore>[0]
    private readonly resolveJwks: (jwksUri: string) => JWTVerifyGetKey
    private readonly transientRetryDelaysMs: readonly number[]
    private renewalTimer: ReturnType<typeof setTimeout> | undefined
    /** Consecutive transient failures, for pacing the retry timer. */
    private transientFailures = 0
    /**
     * The `SessionEndedError.reason` from the failure that last ended this
     * session, so the UI can say *why* — the identity provider revoked the
     * grant, as opposed to a bug in this app. Set just before
     * `dispatchExpirationEvent()`, which carries no payload of its own.
     */
    lastEndedReason: string | undefined

    constructor(
        clientDetails: ConstructorParameters<typeof SessionCore>[0],
        database: SessionIDB,
        sessionOptions: ResilientSessionOptions,
    ) {
        const { resolveJwks, transientRetryDelaysMs, ...coreOptions } = sessionOptions
        super(clientDetails, { ...coreOptions, database })
        this.db = database
        this.clientDetails = clientDetails
        this.resolveJwks = resolveJwks ?? jwksFor
        this.transientRetryDelaysMs = transientRetryDelaysMs ?? TRANSIENT_RETRY_DELAYS_MS
    }

    /**
     * Replaces SessionCore's single-shot restore with a locked, retrying refresh
     * that only gives up when the provider rejects the grant.
     */
    async restore(): Promise<void> {
        if (this.refreshPromise) return this.refreshPromise

        this.refreshPromise = new Promise<void>((resolve, reject) => {
            this.resolveRefresh = resolve
            this.rejectRefresh = reject
        })
        // Nothing must reject this promise before a caller attaches a handler.
        const pending = this.refreshPromise
        pending.catch(() => { /* observed below by callers of restore() */ })

        const wasActive = this.isActive

        void (async () => {
            try {
                const tokens = await withRefreshLock(() => this.refreshWithRetries())
                await this.setTokenDetails(tokens)
                this.transientFailures = 0
                this.scheduleRenewal()
                logAuthEvent('refresh.succeeded', { expiresIn: this.getExpiresIn() })
                this.resolveRefresh?.()
            } catch (error) {
                const ended = error instanceof SessionEndedError
                logAuthEvent(
                    ended ? 'refresh.session-ended' : 'refresh.failed-transiently',
                    { reason: ended ? error.reason : String(error) },
                    ended ? 'error' : 'warn',
                )
                this.rejectRefresh?.(error instanceof Error ? error : new Error(String(error)))
                // Only the provider disowning the grant ends the session. A transient
                // failure leaves the stored refresh token intact for the next attempt,
                // and books that attempt rather than hoping something else will.
                if (ended) {
                    this.lastEndedReason = error.reason
                    reportSessionEnded(error.reason)
                    this.dispatchExpirationEvent()
                } else {
                    this.scheduleTransientRetry()
                }
            } finally {
                this.clearRefreshPromise()
                if (wasActive !== this.isActive) this.dispatchStateChangeEvent()
            }
        })()

        return this.refreshPromise
    }

    /** Renews slightly early, so no request is ever issued against a lapsed token. */
    async authFetch(
        input: string | URL | globalThis.Request,
        init?: RequestInit,
        dpopPayload?: unknown,
    ): Promise<Response> {
        if (this.isActive && this.needsRenewal()) {
            try {
                await this.restore()
            } catch {
                // Fall through: the existing token may still be good enough, and
                // restore() has already reported the failure.
            }
        }
        return super.authFetch(input, init, dpopPayload)
    }

    async logout(): Promise<void> {
        this.cancelRenewal()
        logAuthEvent('logout.requested')
        await super.logout()
    }

    /**
     * Starts a sign-in in an external user agent — the system browser — rather
     * than by navigating this page, which is what the library's `login()` does.
     * The native app needs this (#358): RFC 8252 rules out an embedded WebView
     * for authorization requests. `open` receives the authorize URL; the provider
     * answers on `redirectUri`, which whoever catches it hands to
     * `completeExternalLogin`.
     *
     * Always a Client ID Document: a dynamic registration is exactly what the
     * native app must never be (see solidClientIdentity.ts).
     */
    async beginExternalLogin(idp: string, redirectUri: string, open: (url: string) => Promise<void>): Promise<void> {
        const clientId = this.clientDetails && 'client_id' in this.clientDetails ? this.clientDetails.client_id : undefined
        if (!clientId) {
            throw new Error('Signing in through the system browser needs a Client ID Document.')
        }

        const response = await fetch(`${new URL(idp).origin}/.well-known/openid-configuration`)
        if (!response.ok) throw new Error(`Could not read the provider configuration: HTTP ${response.status}`)
        const configuration = (await response.json()) as {
            issuer: string
            authorization_endpoint: string
            token_endpoint: string
            jwks_uri: string
        }
        // RFC 9207: the provider we asked for must be the one that answers.
        if (trimTrailingSlash(configuration.issuer) !== trimTrailingSlash(idp)) {
            throw new Error(`RFC 9207 - the provider's issuer ${configuration.issuer} is not ${idp}`)
        }

        const { verifier, challenge } = await createPkcePair()
        const state = crypto.randomUUID()
        const pending: PendingExternalLogin = {
            idp: configuration.issuer,
            tokenEndpoint: configuration.token_endpoint,
            jwksUri: configuration.jwks_uri,
            clientId,
            redirectUri,
            codeVerifier: verifier,
            state,
            startedAt: Date.now(),
        }
        localStorage.setItem(PENDING_EXTERNAL_LOGIN_KEY, JSON.stringify(pending))

        const authorize = new URL(configuration.authorization_endpoint)
        authorize.search = new URLSearchParams({
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: 'openid offline_access webid',
            client_id: clientId,
            code_challenge_method: 'S256',
            code_challenge: challenge,
            state,
            // CSS v7 only issues a refresh token when consent is asked for — the
            // library sends this for the same reason.
            prompt: 'consent',
        }).toString()

        logAuthEvent('login.external-agent-opened', { idp: configuration.issuer })
        await open(authorize.toString())
    }

    /** Whether a sign-in through the system browser is waiting for its callback. */
    hasPendingExternalLogin(): boolean {
        return readPendingExternalLogin() !== undefined
    }

    /**
     * Finishes a sign-in `beginExternalLogin` started, from the URL the provider
     * sent the browser back to.
     *
     * Everything that can reject the callback is checked before anything is
     * written: a stray, forged or stale callback must not cost the session this
     * device already has. After the exchange, the rule every refresh follows
     * holds here too — the tokens are stored before verification, the one step
     * that can still throw.
     */
    async completeExternalLogin(callbackUrl: string): Promise<void> {
        const pending = readPendingExternalLogin()
        if (!pending) throw new ExternalLoginError('no-pending-login')
        if (Date.now() - pending.startedAt > PENDING_EXTERNAL_LOGIN_TTL_MS) {
            clearPendingExternalLogin()
            throw new ExternalLoginError('expired')
        }

        const callback = new URL(callbackUrl)
        if (callbackUrl.split(/[?#]/)[0] !== pending.redirectUri) {
            throw new ExternalLoginError('redirect-mismatch')
        }
        // Not ours: leave the pending sign-in alone, so a forged callback cannot
        // cancel the one the user is part-way through.
        if (callback.searchParams.get('state') !== pending.state) {
            throw new ExternalLoginError('state-mismatch')
        }
        const providerError = callback.searchParams.get('error')
        if (providerError) {
            clearPendingExternalLogin()
            throw new ExternalLoginError(providerError, callback.searchParams.get('error_description') ?? undefined)
        }
        if (callback.searchParams.get('iss') !== pending.idp) {
            throw new ExternalLoginError('issuer-mismatch')
        }
        const code = callback.searchParams.get('code')
        if (!code) throw new ExternalLoginError('no-code')

        // A code is single-use: from here on, this attempt is spent either way.
        clearPendingExternalLogin()

        const keyPair = await generateKeyPair('ES256') as StoredKeyPair
        let response: Response
        try {
            response = await fetch(pending.tokenEndpoint, {
                method: 'POST',
                headers: {
                    dpop: await createTokenEndpointDPoP(pending.tokenEndpoint, keyPair),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: pending.codeVerifier,
                    // What the provider sent the browser to, which is what it
                    // checks — not this page's URL, as the library would send.
                    redirect_uri: pending.redirectUri,
                    client_id: pending.clientId,
                }),
            })
        } catch (error) {
            throw new ExternalLoginError('token-request-failed', `Could not reach the token endpoint: ${String(error)}`)
        }
        if (!response.ok) {
            throw new ExternalLoginError('token-request-failed', `Token endpoint returned ${response.status}`)
        }
        const tokens = (await response.json()) as TokenResponse

        await this.db.init()
        try {
            await Promise.all([
                this.db.setItem('idp', pending.idp),
                this.db.setItem('jwks_uri', pending.jwksUri),
                this.db.setItem('token_endpoint', pending.tokenEndpoint),
                this.db.setItem('client_id', pending.clientId),
                this.db.setItem('dpop_keypair', keyPair),
                this.db.setItem('refresh_token', tokens.refresh_token),
            ])
        } finally {
            try { this.db.close() } catch { /* already closed */ }
        }

        await this.verifyAccessToken(tokens.access_token, {
            idp: pending.idp,
            jwksUri: pending.jwksUri,
            clientId: pending.clientId,
            keyPair,
        })
        await this.setTokenDetails({ ...tokens, dpop_key_pair: keyPair } as Parameters<SessionCore['setTokenDetails']>[0])
        this.transientFailures = 0
        this.dispatchStateChangeEvent()
    }

    /** True once the access token is inside the pre-expiry buffer. */
    needsRenewal(): boolean {
        const expiresIn = this.getExpiresIn()
        if (expiresIn < 0) return true
        return expiresIn <= EXPIRY_BUFFER_SECONDS
    }

    /** Whether a session is stored and worth trying to restore. */
    async hasStoredSession(): Promise<boolean> {
        try {
            await this.db.init()
            const refreshToken = await this.db.getItem('refresh_token')
            return Boolean(refreshToken)
        } catch {
            return false
        } finally {
            try { this.db.close() } catch { /* already closed */ }
        }
    }

    /** Renews shortly before expiry rather than waiting for a request to fail. */
    scheduleRenewal(): void {
        this.cancelRenewal()
        if (!this.isActive) return

        const expiresIn = this.getExpiresIn()
        const delaySeconds = Math.max(expiresIn - EXPIRY_BUFFER_SECONDS, 30)
        // setTimeout clamps above ~24.8 days; sessions never live that long, but
        // guard anyway so a bogus `exp` cannot schedule an immediate loop.
        const delayMs = Math.min(delaySeconds, 60 * 60 * 24) * 1000

        this.renewalTimer = setTimeout(() => {
            logAuthEvent('refresh.scheduled-renewal')
            void this.restore().catch(() => { /* reported by restore() */ })
        }, delayMs)
    }

    cancelRenewal(): void {
        if (this.renewalTimer !== undefined) {
            clearTimeout(this.renewalTimer)
            this.renewalTimer = undefined
        }
    }

    /**
     * Books another attempt after a transient failure, on a backoff that tops out
     * at five minutes. It shares the renewal timer: whichever of the two is due
     * first is the one worth doing, and a success re-arms the normal schedule.
     */
    private scheduleTransientRetry(): void {
        this.cancelRenewal()

        const delay = this.transientRetryDelaysMs[
            Math.min(this.transientFailures, this.transientRetryDelaysMs.length - 1)
        ]
        this.transientFailures += 1

        this.renewalTimer = setTimeout(() => {
            logAuthEvent('refresh.retry-after-failure', { attempt: this.transientFailures })
            void this.restore().catch(() => { /* reported by restore() */ })
        }, delay)
    }

    private async refreshWithRetries() {
        let lastError: unknown
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return await this.performRefresh()
            } catch (error) {
                lastError = error
                if (error instanceof SessionEndedError) throw error
                if (attempt === MAX_ATTEMPTS) break
                const backoff = RETRY_BASE_MS * 2 ** (attempt - 1)
                logAuthEvent('refresh.retrying', { attempt, backoff, reason: String(error) }, 'warn')
                await sleep(backoff)
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }

    /**
     * One refresh-token exchange.
     *
     * The ordering here is the whole point: the replacement refresh token is
     * persisted the moment it arrives, before verification, before anything else
     * that can throw. A rotated token that is received but not stored is a dead
     * session; a stored token that later fails verification just gets retried.
     */
    private async performRefresh() {
        await this.db.init()
        try {
            const [clientId, tokenEndpoint, keyPair, refreshToken, idp, jwksUri] = await Promise.all([
                this.db.getItem('client_id') as Promise<string | null>,
                this.db.getItem('token_endpoint') as Promise<string | null>,
                this.db.getItem('dpop_keypair') as Promise<StoredKeyPair | null>,
                this.db.getItem('refresh_token') as Promise<string | null>,
                this.db.getItem('idp') as Promise<string | null>,
                this.db.getItem('jwks_uri') as Promise<string | null>,
            ])

            if (!clientId || !tokenEndpoint || !keyPair || !refreshToken || !idp || !jwksUri) {
                throw new SessionEndedError('no-stored-session', 'No stored Solid session to restore.')
            }

            const dpop = await createTokenEndpointDPoP(tokenEndpoint, keyPair)

            let response: Response
            try {
                response = await fetch(tokenEndpoint, {
                    method: 'POST',
                    headers: { dpop, 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
                        client_id: clientId,
                    }),
                })
            } catch (error) {
                // Offline, DNS failure, connection reset. The refresh token was
                // never presented, so it is certainly still good.
                throw new TransientRefreshError(`Could not reach the token endpoint: ${String(error)}`)
            }

            if (!response.ok) {
                throw classifyTokenError(response.status, await response.text().catch(() => ''))
            }

            const tokens = (await response.json()) as TokenResponse

            // ── The fix. Persist the rotated token before doing anything fallible. ──
            if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
                await this.db.setItem('refresh_token', tokens.refresh_token)
                logAuthEvent('refresh.token-rotated')
            }

            await this.verifyAccessToken(tokens.access_token, { idp, jwksUri, clientId, keyPair })

            return { ...tokens, dpop_key_pair: keyPair } as Parameters<SessionCore['setTokenDetails']>[0]
        } finally {
            try { this.db.close() } catch { /* already closed */ }
        }
    }

    /**
     * Verifies the new access token. Failures here are transient by design: the
     * rotated refresh token is already stored, so retrying is safe, and a phone
     * with a skewed clock should not be logged out over it.
     */
    private async verifyAccessToken(
        accessToken: string,
        ctx: { idp: string; jwksUri: string; clientId: string; keyPair: StoredKeyPair },
    ): Promise<void> {
        let payload
        try {
            ;({ payload } = await jwtVerify(accessToken, this.resolveJwks(ctx.jwksUri), {
                issuer: ctx.idp,
                audience: 'solid',
                clockTolerance: CLOCK_TOLERANCE_SECONDS,
            }))
        } catch (error) {
            // Signature, JWKS fetch or clock problems. Retrying is safe and often works.
            throw new TransientRefreshError(`Could not verify the new access token: ${String(error)}`)
        }

        // SessionCore answers an access token it cannot read — no `webid`, no `exp`,
        // not a JWT at all — by calling its own logout(), which clears IndexedDB and
        // the refresh token with it. Stop such a token here, before setTokenDetails
        // ever sees it: a provider having a bad minute must not cost the session.
        // Transient, because the stored refresh token is untouched and the next
        // exchange may well come back with a usable token.
        if (!payload.webid || !payload.exp) {
            throw new TransientRefreshError('The new access token is missing its webid or exp claim.')
        }

        // These two cannot come right on a retry: the stored key or registration
        // no longer matches what the provider is issuing, so the session is over.
        const cnf = payload.cnf as { jkt?: string } | undefined
        const thumbprint = await calculateJwkThumbprint(await exportJWK(ctx.keyPair.publicKey))
        if (cnf?.jkt !== thumbprint) {
            throw new SessionEndedError('dpop-key-mismatch', 'The access token is bound to a different key.')
        }
        if (payload.client_id !== ctx.clientId) {
            throw new SessionEndedError('client-id-mismatch', 'The access token was issued to a different client.')
        }
    }
}
