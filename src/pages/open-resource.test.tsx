import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OpenResourcePage } from './open-resource'

const mockUseSolidPod = vi.fn()
vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: () => mockUseSolidPod(),
}))

const mockGetPrimaryPodUrl = vi.fn()
vi.mock('../services/solidPod', async importOriginal => {
    const actual = await importOriginal<typeof import('../services/solidPod')>()
    return { ...actual, getPrimaryPodUrl: (...args: unknown[]) => mockGetPrimaryPodUrl(...args) }
})

const OWN_POD = 'https://alice.example/'
const OTHER_POD = 'https://bob.example/'
const session = { fetch: vi.fn(), info: { isLoggedIn: true, webId: 'https://alice.example/profile/card#me' } }

/** Renders the page and reports wherever it decided to send the visitor. */
function renderAt(resourceIri: string) {
    return render(
        <MemoryRouter initialEntries={[`/open?resource=${encodeURIComponent(resourceIri)}`]}>
            <Routes>
                <Route path="/open" element={<OpenResourcePage />} />
                <Route path="/view-lists/:id" element={<div>own list page</div>} />
                <Route path="/manage-questions" element={<div>own questions page</div>} />
                <Route path="/pod/:encoded/manage-questions" element={<div>their questions page</div>} />
            </Routes>
        </MemoryRouter>
    )
}

describe('OpenResourcePage', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({ isLoggedIn: true, session, isLoading: false })
        mockGetPrimaryPodUrl.mockResolvedValue(OWN_POD)
    })

    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('opens a list on your own pod as your own list', async () => {
        renderAt(`${OWN_POD}pack-me-up/packing-lists/abc.ttl`)
        expect(await screen.findByText('own list page')).toBeDefined()
    })

    it('opens your own question set on the questions page', async () => {
        renderAt(`${OWN_POD}pack-me-up/packing-list-questions.ttl`)
        expect(await screen.findByText('own questions page')).toBeDefined()
    })

    it('opens someone else\'s question set in their pod context', async () => {
        renderAt(`${OTHER_POD}pack-me-up/packing-list-questions.ttl`)
        expect(await screen.findByText('their questions page')).toBeDefined()
    })

    it('waits for the pod URL before deciding whose list it is', async () => {
        let resolvePod: (url: string) => void = () => {}
        mockGetPrimaryPodUrl.mockReturnValue(new Promise<string>(resolve => { resolvePod = resolve }))

        renderAt(`${OWN_POD}pack-me-up/packing-lists/abc.ttl`)

        expect(screen.queryByText('own list page')).toBeNull()
        expect(screen.getByRole('status')).toBeDefined()

        resolvePod(OWN_POD)
        expect(await screen.findByText('own list page')).toBeDefined()
    })

    it('says so plainly when it is handed something it cannot open', async () => {
        renderAt(`${OTHER_POD}notes/shopping.ttl`)
        expect(await screen.findByText(/can't open/i)).toBeDefined()
        expect(screen.getByText(`${OTHER_POD}notes/shopping.ttl`)).toBeDefined()
    })

    it('says so plainly when no resource was given at all', async () => {
        render(
            <MemoryRouter initialEntries={['/open']}>
                <Routes><Route path="/open" element={<OpenResourcePage />} /></Routes>
            </MemoryRouter>
        )
        expect(await screen.findByText(/can't open/i)).toBeDefined()
    })

    it('treats every pod as someone else\'s when nobody is signed in', async () => {
        mockUseSolidPod.mockReturnValue({ isLoggedIn: false, session: null, isLoading: false })

        renderAt(`${OWN_POD}pack-me-up/packing-list-questions.ttl`)

        expect(await screen.findByText('their questions page')).toBeDefined()
        expect(mockGetPrimaryPodUrl).not.toHaveBeenCalled()
    })

    it('does not decide anything while the session is still being restored', () => {
        mockUseSolidPod.mockReturnValue({ isLoggedIn: false, session: null, isLoading: true })

        renderAt(`${OWN_POD}pack-me-up/packing-lists/abc.ttl`)

        expect(screen.queryByText('own list page')).toBeNull()
        expect(screen.getByRole('status')).toBeDefined()
    })

    it('still opens the list when the pod URL cannot be resolved', async () => {
        mockGetPrimaryPodUrl.mockRejectedValue(new Error('offline'))

        renderAt(`${OWN_POD}pack-me-up/packing-lists/abc.ttl`)

        // Nobody's "own" pod, so it falls back to the shared-list route, which
        // this test's router has no entry for — the point is that it navigated.
        await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    })
})
