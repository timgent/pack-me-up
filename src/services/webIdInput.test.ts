import { describe, it, expect } from 'vitest'
import { normaliseWebIdInput } from './webIdInput'

describe('normaliseWebIdInput', () => {
    it('returns null for nothing to work with', () => {
        expect(normaliseWebIdInput('')).toBeNull()
        expect(normaliseWebIdInput('   ')).toBeNull()
    })

    it('leaves a well-formed WebID alone', () => {
        expect(normaliseWebIdInput('https://bob.solidcommunity.net/profile/card#me'))
            .toBe('https://bob.solidcommunity.net/profile/card#me')
    })

    it('trims surrounding whitespace, which is what pasting gives you', () => {
        expect(normaliseWebIdInput('  https://bob.solidcommunity.net/profile/card#me \n'))
            .toBe('https://bob.solidcommunity.net/profile/card#me')
    })

    it('adds the scheme when someone types a bare host', () => {
        expect(normaliseWebIdInput('bob.solidcommunity.net'))
            .toBe('https://bob.solidcommunity.net/profile/card#me')
    })

    it('turns a Pod root into the profile card inside it', () => {
        expect(normaliseWebIdInput('https://bob.solidcommunity.net'))
            .toBe('https://bob.solidcommunity.net/profile/card#me')
        expect(normaliseWebIdInput('https://bob.solidcommunity.net/'))
            .toBe('https://bob.solidcommunity.net/profile/card#me')
    })

    it('treats any trailing slash as the container it means', () => {
        // Path-based Pods (a CSS server hosting several users) put the Pod at a
        // sub-path, so the rule cannot be "root only".
        expect(normaliseWebIdInput('http://localhost:4000/testuser/'))
            .toBe('http://localhost:4000/testuser/profile/card#me')
    })

    it('adds the fragment to a profile card that is missing it', () => {
        expect(normaliseWebIdInput('https://bob.solidcommunity.net/profile/card'))
            .toBe('https://bob.solidcommunity.net/profile/card#me')
        expect(normaliseWebIdInput('https://bob.solidcommunity.net/profile/card/'))
            .toBe('https://bob.solidcommunity.net/profile/card#me')
    })

    it('leaves a WebID minted by an identity provider exactly as it is', () => {
        // https://id.inrupt.com/alice is the whole WebID — it has no fragment
        // and no profile/card, and inventing either breaks it.
        expect(normaliseWebIdInput('https://id.inrupt.com/alice'))
            .toBe('https://id.inrupt.com/alice')
    })

    it('keeps a fragment that is not #me', () => {
        expect(normaliseWebIdInput('https://example.org/card#i'))
            .toBe('https://example.org/card#i')
    })

    it('rejects input that cannot be a web address', () => {
        expect(normaliseWebIdInput('not an address')).toBeNull()
        expect(normaliseWebIdInput('alice')).toBeNull()
        expect(normaliseWebIdInput('mailto:alice@example.org')).toBeNull()
        expect(normaliseWebIdInput('javascript:alert(1)')).toBeNull()
    })

    it('reads a bare host and port as a host and port, not as a scheme', () => {
        // `example.org:8443` parses as the scheme "example.org" if you let it,
        // which is how a Pod on a non-default port came out as "not an
        // address".
        expect(normaliseWebIdInput('example.org:8443/alice/'))
            .toBe('https://example.org:8443/alice/profile/card#me')
        expect(normaliseWebIdInput('bob.example.org:3000'))
            .toBe('https://bob.example.org:3000/profile/card#me')
    })

    it('still rejects a scheme that is a scheme', () => {
        expect(normaliseWebIdInput('ftp://example.org/alice/')).toBeNull()
        expect(normaliseWebIdInput('data:text/plain,hello')).toBeNull()
    })

    it('allows localhost, which is where the test pods live', () => {
        expect(normaliseWebIdInput('http://localhost:4000/testuser/profile/card#me'))
            .toBe('http://localhost:4000/testuser/profile/card#me')
    })
})
