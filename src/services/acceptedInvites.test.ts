import { describe, it, expect } from 'vitest'
import { invitedListId, withAcceptedInvite, withAccessConfirmed, type AcceptedInvite } from './acceptedInvites'
import type { SharedListsWithMe, SharedWithMeList } from './rdfSerialization'

const POD = 'https://alice.example.org/'
const OWNER = 'https://alice.example.org/profile/card#me'
const NOW = '2026-09-25T12:00:00.000Z'

const noSetups: SharedWithMeList = { contexts: [], lastModified: '2026-01-01T00:00:00.000Z' }
const noLists: SharedListsWithMe = { lists: [], lastModified: '2026-01-01T00:00:00.000Z' }

describe('invitedListId', () => {
    it('takes an id shaped like the ones this app makes', () => {
        expect(invitedListId('0b7a3c1e-5d2f-4e8a-9b6c-1d2e3f4a5b6c')).toBe('0b7a3c1e-5d2f-4e8a-9b6c-1d2e3f4a5b6c')
    })

    // It becomes a path segment on somebody's Pod, and it arrived in a link
    // anybody could have edited.
    it.each([
        ['missing', null],
        ['empty', ''],
        ['a path traversal', '../../private'],
        ['a nested path', 'a/b'],
        ['a URL', 'https://evil.example/x'],
        ['absurdly long', 'a'.repeat(200)],
    ])('refuses one that is %s', (_why, value) => {
        expect(invitedListId(value)).toBeNull()
    })
})

describe('withAcceptedInvite', () => {
    describe('a full-setup invite', () => {
        const invite: AcceptedInvite = { kind: 'full-setup', podUrl: POD, ownerWebId: OWNER, ownerName: 'Alice Smith' }

        it('is recorded as a setup shared with me, before any access exists', () => {
            const { sharedWithMe, sharedListsWithMe } = withAcceptedInvite(invite, noSetups, noLists, NOW)

            expect(sharedWithMe?.contexts).toEqual([{ podUrl: POD, webId: OWNER, label: 'Alice Smith', addedAt: NOW, awaitingAccess: true }])
            expect(sharedWithMe?.lastModified).toBe(NOW)
            // Nothing to write on the other document.
            expect(sharedListsWithMe).toBeNull()
        })

        it('leaves the name to be looked up later when their card has none', () => {
            const { sharedWithMe } = withAcceptedInvite({ ...invite, ownerName: null }, noSetups, noLists, NOW)

            expect(sharedWithMe?.contexts[0]).not.toHaveProperty('label')
        })

        // Shared, revoked, then invited again: until the new grant lands this
        // is a wait again, not a revocation.
        it('marks an already recorded setup as waiting again', () => {
            const existing: SharedWithMeList = { contexts: [{ podUrl: POD, addedAt: '2026-02-02T00:00:00.000Z' }], lastModified: '2026-02-02T00:00:00.000Z' }

            expect(withAcceptedInvite(invite, existing, noLists, NOW).sharedWithMe?.contexts)
                .toEqual([{ podUrl: POD, addedAt: '2026-02-02T00:00:00.000Z', awaitingAccess: true }])
        })

        it('changes nothing when that setup is already waiting', () => {
            const existing: SharedWithMeList = { contexts: [{ podUrl: POD, addedAt: '2026-02-02T00:00:00.000Z', awaitingAccess: true }], lastModified: '2026-02-02T00:00:00.000Z' }

            expect(withAcceptedInvite(invite, existing, noLists, NOW).sharedWithMe).toBeNull()
        })

        it('keeps what was already there', () => {
            const other = { podUrl: 'https://carol.example.org/', addedAt: '2026-02-02T00:00:00.000Z' }
            const { sharedWithMe } = withAcceptedInvite(invite, { contexts: [other], lastModified: NOW }, noLists, NOW)

            expect(sharedWithMe?.contexts).toHaveLength(2)
            expect(sharedWithMe?.contexts[0]).toEqual(other)
        })
    })

    describe('a list invite', () => {
        const invite: AcceptedInvite = { kind: 'list', podUrl: POD, ownerWebId: OWNER, ownerName: 'Alice Smith', listId: 'list-123', label: 'Ski trip' }

        it('is recorded as a list shared with me, named as the invite named it', () => {
            const { sharedWithMe, sharedListsWithMe } = withAcceptedInvite(invite, noSetups, noLists, NOW)

            expect(sharedListsWithMe?.lists).toEqual([{
                listId: 'list-123',
                listUrl: `${POD}pack-me-up/packing-lists/list-123.ttl`,
                podUrl: POD,
                ownerWebId: OWNER,
                label: 'Ski trip',
                addedAt: NOW,
                awaitingAccess: true,
            }])
            expect(sharedWithMe).toBeNull()
        })

        it('marks an already recorded list as waiting again', () => {
            const existing: SharedListsWithMe = {
                lists: [{ listId: 'list-123', listUrl: 'x', podUrl: POD, addedAt: '2026-02-02T00:00:00.000Z' }],
                lastModified: '2026-02-02T00:00:00.000Z',
            }

            expect(withAcceptedInvite(invite, noSetups, existing, NOW).sharedListsWithMe?.lists[0].awaitingAccess).toBe(true)
        })

        it('changes nothing when that list is already waiting', () => {
            const existing: SharedListsWithMe = {
                lists: [{ listId: 'list-123', listUrl: 'x', podUrl: POD, addedAt: '2026-02-02T00:00:00.000Z', awaitingAccess: true }],
                lastModified: '2026-02-02T00:00:00.000Z',
            }

            expect(withAcceptedInvite(invite, noSetups, existing, NOW).sharedListsWithMe).toBeNull()
        })

        // A list invite from before the link carried the list: accepting it
        // still works, there is just nothing on this side to point at.
        it('records nothing when the link does not say which list', () => {
            const result = withAcceptedInvite({ ...invite, listId: undefined }, noSetups, noLists, NOW)

            expect(result).toEqual({ sharedWithMe: null, sharedListsWithMe: null })
        })
    })
})

// The first time a share opens, it stops being a wait — so that a later
// refusal can be told for what it is: access taken away.
describe('withAccessConfirmed', () => {
    const LIST_URL = `${POD}pack-me-up/packing-lists/list-123.ttl`
    const setups: SharedWithMeList = {
        contexts: [{ podUrl: POD, addedAt: '2026-02-02T00:00:00.000Z', awaitingAccess: true }, { podUrl: 'https://carol.example.org/', addedAt: '2026-02-02T00:00:00.000Z', awaitingAccess: true }],
        lastModified: '2026-02-02T00:00:00.000Z',
    }
    const lists: SharedListsWithMe = {
        lists: [{ listId: 'list-123', listUrl: LIST_URL, podUrl: POD, addedAt: '2026-02-02T00:00:00.000Z', awaitingAccess: true }],
        lastModified: '2026-02-02T00:00:00.000Z',
    }

    it('clears the wait on the setup that opened, and only that one', () => {
        const updated = withAccessConfirmed(setups, { kind: 'setup', podUrl: POD }, NOW)

        expect(updated?.contexts[0]).not.toHaveProperty('awaitingAccess')
        expect(updated?.contexts[1].awaitingAccess).toBe(true)
        expect(updated?.lastModified).toBe(NOW)
    })

    it('clears the wait on the list that opened', () => {
        const updated = withAccessConfirmed(lists, { kind: 'list', listUrl: LIST_URL }, NOW)

        expect(updated?.lists[0]).not.toHaveProperty('awaitingAccess')
    })

    it('changes nothing when there was no wait to clear', () => {
        expect(withAccessConfirmed(noSetups, { kind: 'setup', podUrl: POD }, NOW)).toBeNull()
        expect(withAccessConfirmed({ ...setups, contexts: [{ podUrl: POD, addedAt: '' }] }, { kind: 'setup', podUrl: POD }, NOW)).toBeNull()
    })
})
