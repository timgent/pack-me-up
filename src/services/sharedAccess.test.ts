import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@inrupt/solid-client', async importOriginal => {
    const actual = await importOriginal<typeof import('@inrupt/solid-client')>()
    return { ...actual, getSolidDataset: vi.fn() }
})
vi.mock('./solidPod', async importOriginal => {
    const actual = await importOriginal<typeof import('./solidPod')>()
    return { ...actual, verifyForeignPodAccess: vi.fn() }
})

import { getSolidDataset, createSolidDataset } from '@inrupt/solid-client'
import { verifyForeignPodAccess } from './solidPod'
import { checkSharedAccess } from './sharedAccess'
import type { AppSession } from '../types/AppSession'

const mockGetSolidDataset = vi.mocked(getSolidDataset)
const mockVerify = vi.mocked(verifyForeignPodAccess)
const session = { info: { isLoggedIn: true, webId: 'https://bob.example.org/profile/card#me' }, fetch: vi.fn() } as unknown as AppSession

const POD = 'https://alice.example.org/'
const LIST_URL = `${POD}pack-me-up/packing-lists/list-123.ttl`

beforeEach(() => vi.clearAllMocks())

describe('checkSharedAccess', () => {
    describe('a whole setup', () => {
        it('is open once it can be read', async () => {
            mockVerify.mockResolvedValue(true)
            expect(await checkSharedAccess(session, { kind: 'setup', podUrl: POD })).toBe('open')
            expect(mockVerify).toHaveBeenCalledWith(session, POD)
        })

        // An accepted invite that the sender's app has not yet run to grant.
        it('is refused while it is refused', async () => {
            mockVerify.mockResolvedValue(false)
            expect(await checkSharedAccess(session, { kind: 'setup', podUrl: POD })).toBe('refused')
        })

        // Offline, or the server is down: that says nothing about access, and
        // opening it is where the app explains what it can.
        it('is not called refused when the check itself could not be made', async () => {
            mockVerify.mockRejectedValue(new Error('network'))
            expect(await checkSharedAccess(session, { kind: 'setup', podUrl: POD })).toBe('open')
        })
    })

    describe('one list', () => {
        it('is open once it can be read', async () => {
            mockGetSolidDataset.mockResolvedValue(createSolidDataset() as never)
            expect(await checkSharedAccess(session, { kind: 'list', listUrl: LIST_URL })).toBe('open')
            expect(mockGetSolidDataset).toHaveBeenCalledWith(LIST_URL, { fetch: session.fetch })
        })

        it.each([401, 403])('is refused while it answers %i', async statusCode => {
            mockGetSolidDataset.mockRejectedValue({ statusCode })
            expect(await checkSharedAccess(session, { kind: 'list', listUrl: LIST_URL })).toBe('refused')
        })

        it('is not called refused for any other failure', async () => {
            mockGetSolidDataset.mockRejectedValue({ statusCode: 404 })
            expect(await checkSharedAccess(session, { kind: 'list', listUrl: LIST_URL })).toBe('open')
        })
    })
})
