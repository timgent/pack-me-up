import { describe, it, expect } from 'vitest'
import { createInviteToken, isInviteToken } from './inviteToken'

describe('createInviteToken', () => {
    it('makes a token that survives a URL without escaping', () => {
        const token = createInviteToken()

        expect(encodeURIComponent(token)).toBe(token)
    })

    it('carries enough randomness to be worth guessing at', () => {
        // The token is the whole proof that the person accepting was sent the
        // link, so guessing one must be hopeless. base64url over 16 bytes is
        // 128 bits in 22 characters.
        expect(createInviteToken().length).toBeGreaterThanOrEqual(22)
    })

    it('does not repeat itself', () => {
        const tokens = new Set(Array.from({ length: 200 }, () => createInviteToken()))

        expect(tokens.size).toBe(200)
    })
})

describe('isInviteToken', () => {
    it('accepts what createInviteToken makes', () => {
        expect(isInviteToken(createInviteToken())).toBe(true)
    })

    it('rejects anything of the wrong shape', () => {
        // Acceptances arrive from other people's pods, so what comes back is
        // somebody else's input until this says otherwise.
        expect(isInviteToken('')).toBe(false)
        expect(isInviteToken('short')).toBe(false)
        expect(isInviteToken('has spaces in it and is long enough')).toBe(false)
        expect(isInviteToken('../../etc/passwd-but-long-enough-yes')).toBe(false)
        expect(isInviteToken('a'.repeat(200))).toBe(false)
    })

    it('rejects things that are not strings', () => {
        expect(isInviteToken(null)).toBe(false)
        expect(isInviteToken(undefined)).toBe(false)
        expect(isInviteToken(42)).toBe(false)
    })
})
