import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppSession } from '../types/AppSession'
import type { SolidDataset, WithServerResourceInfo } from '@inrupt/solid-client'
import { inviteToDataset } from './rdfSerialization'

const mockGetSolidDataset = vi.fn()
const mockGetContainedResourceUrlAll = vi.fn()
const mockOverwriteFile = vi.fn()
const mockDeleteFile = vi.fn()
const mockSetPublicAccess = vi.fn()

vi.mock('@inrupt/solid-client', async importOriginal => {
    const actual = await importOriginal<typeof import('@inrupt/solid-client')>()
    return {
        ...actual,
        getSolidDataset: (...args: unknown[]) => mockGetSolidDataset(...args),
        getContainedResourceUrlAll: (...args: unknown[]) => mockGetContainedResourceUrlAll(...args),
        overwriteFile: (...args: unknown[]) => mockOverwriteFile(...args),
        deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
        universalAccess: { ...actual.universalAccess, setPublicAccess: (...args: unknown[]) => mockSetPublicAccess(...args) },
    }
})

const {
    inviteUrlFor,
    createInvite,
    listInvites,
    acceptInvite,
    deleteInvite,
    buildInviteLink,
    InviteAccessError,
} = await import('./invites')

const POD = 'https://alice.example.org/'
const mockFetch = vi.fn()
const session = { info: { isLoggedIn: true, webId: 'https://alice.example.org/profile/card#me' }, fetch: mockFetch } as unknown as AppSession

const asDataset = (ds: SolidDataset) => ds as SolidDataset & WithServerResourceInfo

beforeEach(() => {
    vi.clearAllMocks()
    mockOverwriteFile.mockResolvedValue(undefined)
    mockDeleteFile.mockResolvedValue(undefined)
    mockSetPublicAccess.mockResolvedValue({ read: false, append: true, write: false })
    mockFetch.mockResolvedValue({ ok: true, status: 205, text: async () => '' })
})

describe('inviteUrlFor', () => {
    it('puts the token in the path, because the URL is the secret', () => {
        expect(inviteUrlFor(POD, 'tok-aaaaaaaaaaaaaaaaaaaa'))
            .toBe('https://alice.example.org/pack-me-up/invites/tok-aaaaaaaaaaaaaaaaaaaa')
    })

    it('refuses to build a URL from something that is not a token', () => {
        // A token that reached here unchecked would be a path traversal into
        // somebody's Pod.
        expect(() => inviteUrlFor(POD, '../../profile/card')).toThrow()
        expect(() => inviteUrlFor(POD, '')).toThrow()
    })
})

describe('createInvite', () => {
    it('writes the invite and opens it for appending, in that order', () => {
        // Granting first would leave a public-append URL pointing at nothing;
        // writing first means the resource exists before anyone can reach it.
        const order: string[] = []
        mockOverwriteFile.mockImplementation(async () => { order.push('write'); })
        mockSetPublicAccess.mockImplementation(async () => { order.push('grant'); return { read: false, append: true, write: false } })

        return createInvite(session, POD, { kind: 'full-setup' }).then(() => {
            expect(order).toEqual(['write', 'grant'])
        })
    })

    it('grants append and nothing else', async () => {
        await createInvite(session, POD, { kind: 'full-setup' })

        expect(mockSetPublicAccess).toHaveBeenCalledWith(
            expect.stringContaining('/pack-me-up/invites/'),
            { read: false, append: true, write: false },
            expect.anything(),
        )
    })

    it('hands back a token and the URL it lives at', async () => {
        const invite = await createInvite(session, POD, { kind: 'list', listId: 'l1', label: 'Ski trip' })

        expect(invite.token).toMatch(/^[A-Za-z0-9_-]{22,}$/)
        expect(invite.url).toBe(inviteUrlFor(POD, invite.token))
        expect(invite.kind).toBe('list')
        expect(invite.listId).toBe('l1')
        expect(invite.label).toBe('Ski trip')
    })

    it('tidies up the resource when the grant fails', async () => {
        // A drop box nobody can append to is a link that silently never works.
        // Better to have no invite than a broken one.
        mockSetPublicAccess.mockResolvedValue(null)

        await expect(createInvite(session, POD, { kind: 'full-setup' })).rejects.toBeInstanceOf(InviteAccessError)
        expect(mockDeleteFile).toHaveBeenCalledWith(expect.stringContaining('/pack-me-up/invites/'), expect.anything())
    })

    it('says plainly when the Pod will not do public access', async () => {
        mockSetPublicAccess.mockResolvedValue(null)

        await expect(createInvite(session, POD, { kind: 'full-setup' }))
            .rejects.toThrow(/access control/i)
    })
})

describe('listInvites', () => {
    it('reads every invite in the container', async () => {
        const a = inviteUrlFor(POD, 'tok-aaaaaaaaaaaaaaaaaaaa')
        const b = inviteUrlFor(POD, 'tok-bbbbbbbbbbbbbbbbbbbb')
        mockGetSolidDataset.mockImplementation(async (url: string) => {
            if (url.endsWith('/invites/')) return asDataset({} as SolidDataset)
            if (url === a) return asDataset(inviteToDataset({ token: 'tok-aaaaaaaaaaaaaaaaaaaa', kind: 'full-setup', createdAt: '2026-01-01T00:00:00.000Z', acceptedBy: [] }, a))
            return asDataset(inviteToDataset({ token: 'tok-bbbbbbbbbbbbbbbbbbbb', kind: 'list', listId: 'l1', createdAt: '2026-01-02T00:00:00.000Z', acceptedBy: ['https://bob.example.org/profile/card#me'] }, b))
        })
        mockGetContainedResourceUrlAll.mockReturnValue([a, b])

        const invites = await listInvites(session, POD)

        expect(invites.map(i => i.token)).toEqual(['tok-aaaaaaaaaaaaaaaaaaaa', 'tok-bbbbbbbbbbbbbbbbbbbb'])
        expect(invites[1].acceptedBy).toEqual(['https://bob.example.org/profile/card#me'])
        expect(invites[0].url).toBe(a)
    })

    it('is empty when no invite has ever been made', async () => {
        // A 404 on the container is a Pod that has never had an invite, which
        // is the normal state of most Pods.
        mockGetSolidDataset.mockRejectedValue(Object.assign(new Error('Not found'), { statusCode: 404 }))

        expect(await listInvites(session, POD)).toEqual([])
    })

    it('skips whatever it cannot read rather than failing the lot', async () => {
        const good = inviteUrlFor(POD, 'tok-cccccccccccccccccccc')
        const junk = `${POD}pack-me-up/invites/junk`
        mockGetSolidDataset.mockImplementation(async (url: string) => {
            if (url.endsWith('/invites/')) return asDataset({} as SolidDataset)
            if (url === good) return asDataset(inviteToDataset({ token: 'tok-cccccccccccccccccccc', kind: 'full-setup', createdAt: '2026-01-01T00:00:00.000Z', acceptedBy: [] }, good))
            throw new Error('unreadable')
        })
        mockGetContainedResourceUrlAll.mockReturnValue([junk, good])

        const invites = await listInvites(session, POD)

        expect(invites.map(i => i.token)).toEqual(['tok-cccccccccccccccccccc'])
    })
})

describe('acceptInvite', () => {
    const url = 'https://alice.example.org/pack-me-up/invites/tok-dddddddddddddddddddd'

    it('sends an inserts-only patch, which is all Append allows', async () => {
        await acceptInvite(session, url, 'https://bob.example.org/profile/card#me')

        expect(mockFetch).toHaveBeenCalledWith(url, expect.objectContaining({
            method: 'PATCH',
            headers: expect.objectContaining({ 'Content-Type': 'text/n3' }),
        }))
        const body = mockFetch.mock.calls[0][1].body as string
        expect(body).toContain('solid:inserts')
        expect(body).not.toContain('solid:deletes')
        expect(body).toContain('https://bob.example.org/profile/card#me')
    })

    it('reports a link that has been revoked as such', async () => {
        // The commonest failure by far: the inviter changed their mind, or the
        // invite was already used and tidied up.
        mockFetch.mockResolvedValue({ ok: false, status: 404, text: async () => 'Not Found' })

        await expect(acceptInvite(session, url, 'https://bob.example.org/profile/card#me'))
            .rejects.toThrow(/no longer/i)
    })

    it('reports a refusal distinctly from a missing invite', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' })

        await expect(acceptInvite(session, url, 'https://bob.example.org/profile/card#me'))
            .rejects.toThrow(/not accepting/i)
    })
})

describe('deleteInvite', () => {
    it('deletes the resource, which is what revoking an invite is', async () => {
        await deleteInvite(session, 'https://alice.example.org/pack-me-up/invites/tok-eeeeeeeeeeeeeeeeeeee')

        expect(mockDeleteFile).toHaveBeenCalledWith(
            'https://alice.example.org/pack-me-up/invites/tok-eeeeeeeeeeeeeeeeeeee',
            expect.anything(),
        )
    })
})

describe('buildInviteLink', () => {
    const OWNER = 'https://alice.example.org/profile/card#me'

    it('carries everything the other end needs, since it can read nothing', () => {
        const link = buildInviteLink('https://pack-me-up.app', POD, OWNER, {
            token: 'tok-ffffffffffffffffffff',
            kind: 'list',
            label: 'Ski trip',
            createdAt: '2026-01-01T00:00:00.000Z',
            acceptedBy: [],
        })

        expect(link).toContain('/#/invite/tok-ffffffffffffffffffff')
        // Read back through a parser rather than matched as text:
        // URLSearchParams spells a space `+`, which is correct and is not what
        // encodeURIComponent would have written.
        const params = new URLSearchParams(link.split('?')[1])
        expect(params.get('pod')).toBe(POD)
        expect(params.get('owner')).toBe(OWNER)
        expect(params.get('kind')).toBe('list')
        expect(params.get('label')).toBe('Ski trip')
    })

    it('leaves out a label there is none of', () => {
        const link = buildInviteLink('https://pack-me-up.app', POD, OWNER, {
            token: 'tok-gggggggggggggggggggg',
            kind: 'full-setup',
            createdAt: '2026-01-01T00:00:00.000Z',
            acceptedBy: [],
        })

        expect(link).not.toContain('label=')
    })
})
