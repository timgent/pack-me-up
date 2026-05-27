import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { SharePackingListModal } from './SharePackingListModal'
import type { AppSession } from '../types/AppSession'

vi.mock('../services/solidPod', () => ({
    grantCollaboratorAccess: vi.fn(),
    grantPublicAccess: vi.fn(),
}))

import { grantCollaboratorAccess, grantPublicAccess } from '../services/solidPod'

const mockGrantCollaboratorAccess = vi.mocked(grantCollaboratorAccess)
const mockGrantPublicAccess = vi.mocked(grantPublicAccess)

const mockSession = {
    info: { isLoggedIn: true, webId: 'https://alice.solidcommunity.net/profile/card#me' },
    fetch: vi.fn(),
} as unknown as AppSession

const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    session: mockSession,
    fileUrl: 'https://alice.solidcommunity.net/pack-me-up/packing-lists/abc.ttl',
    listId: 'abc',
    sharerPodUrl: 'https://alice.solidcommunity.net/',
}

function renderModal(props = {}) {
    return render(<SharePackingListModal {...defaultProps} {...props} />)
}

describe('SharePackingListModal', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            writable: true,
        })
        Object.defineProperty(window, 'location', {
            value: { origin: 'https://pack-me-up.app', hash: '' },
            writable: true,
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('rendering', () => {
        it('renders when isOpen is true', () => {
            renderModal()
            expect(screen.getByText('Share packing list')).toBeTruthy()
        })

        it('does not render when isOpen is false', () => {
            renderModal({ isOpen: false })
            expect(screen.queryByText('Share packing list')).toBeNull()
        })

        it('renders a WebID input', () => {
            renderModal()
            expect(screen.getByPlaceholderText(/profile\/card#me/i)).toBeTruthy()
        })

        it('renders a Share button', () => {
            renderModal()
            expect(screen.getByRole('button', { name: /^share$/i })).toBeTruthy()
        })
    })

    describe('granting access', () => {
        it('does not call grantCollaboratorAccess when WebID input is empty', async () => {
            renderModal()
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))
            expect(mockGrantCollaboratorAccess).not.toHaveBeenCalled()
        })

        it('calls grantCollaboratorAccess with the entered WebID directly', async () => {
            mockGrantCollaboratorAccess.mockResolvedValue(undefined)
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: 'https://bob.solidcommunity.net/profile/card#me' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() =>
                expect(mockGrantCollaboratorAccess).toHaveBeenCalledWith(
                    mockSession,
                    defaultProps.fileUrl,
                    'https://bob.solidcommunity.net/profile/card#me'
                )
            )
        })

        it('trims whitespace from the WebID before calling grantCollaboratorAccess', async () => {
            mockGrantCollaboratorAccess.mockResolvedValue(undefined)
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: '  https://bob.solidcommunity.net/profile/card#me  ' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() =>
                expect(mockGrantCollaboratorAccess).toHaveBeenCalledWith(
                    mockSession,
                    defaultProps.fileUrl,
                    'https://bob.solidcommunity.net/profile/card#me'
                )
            )
        })

        it('shows the generated link after successful grant', async () => {
            mockGrantCollaboratorAccess.mockResolvedValue(undefined)
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: 'https://bob.solidcommunity.net/profile/card#me' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(screen.getByRole('textbox', { name: /shareable link/i })).toBeTruthy())
            const linkInput = screen.getByRole('textbox', { name: /shareable link/i }) as HTMLInputElement
            expect(linkInput.value).toContain('/view-lists/abc')
            expect(linkInput.value).toContain('pod=')
            expect(linkInput.value).toContain(encodeURIComponent('https://alice.solidcommunity.net/'))
        })

        it('shows a "Copy link" button after successful grant', async () => {
            mockGrantCollaboratorAccess.mockResolvedValue(undefined)
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: 'https://bob.solidcommunity.net/profile/card#me' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(screen.getByRole('button', { name: /copy link/i })).toBeTruthy())
        })

        it('Share button is disabled while grant is in progress', async () => {
            let resolveGrant: () => void
            mockGrantCollaboratorAccess.mockReturnValue(new Promise(res => { resolveGrant = res }))
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: 'https://bob.solidcommunity.net/profile/card#me' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            const sharingBtn = screen.getByRole('button', { name: /sharing/i })
            expect(sharingBtn).toBeTruthy()
            expect((sharingBtn as HTMLButtonElement).disabled).toBe(true)

            resolveGrant!()
        })
    })

    describe('clipboard', () => {
        it('clicking "Copy link" calls navigator.clipboard.writeText with the link', async () => {
            mockGrantCollaboratorAccess.mockResolvedValue(undefined)
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: 'https://bob.solidcommunity.net/profile/card#me' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(screen.getByRole('button', { name: /copy link/i })).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /copy link/i }))

            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
                expect.stringContaining('/view-lists/abc')
            )
        })
    })

    describe('error handling', () => {
        it('shows an error message when grantCollaboratorAccess throws', async () => {
            mockGrantCollaboratorAccess.mockRejectedValue(new Error('ACL not supported'))
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: 'https://bob.solidcommunity.net/profile/card#me' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(screen.getByText(/ACL not supported/i)).toBeTruthy())
        })

        it('clears error message when WebID input changes', async () => {
            mockGrantCollaboratorAccess.mockRejectedValue(new Error('ACL not supported'))
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: 'https://bob.solidcommunity.net/profile/card#me' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(screen.getByText(/ACL not supported/i)).toBeTruthy())

            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: 'https://carol.solidcommunity.net/profile/card#me' },
            })

            expect(screen.queryByText(/ACL not supported/i)).toBeNull()
        })
    })
})

describe('SharePackingListModal — anyone with the link mode', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            writable: true,
        })
        Object.defineProperty(window, 'location', {
            value: { origin: 'https://pack-me-up.app', hash: '' },
            writable: true,
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders a tab or button to switch to "anyone with the link" mode', () => {
        renderModal()
        expect(screen.getByRole('button', { name: /anyone with the link/i })).toBeTruthy()
    })

    it('switching to "anyone with the link" mode hides the WebID input', async () => {
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        expect(screen.queryByPlaceholderText(/profile\/card#me/i)).toBeNull()
    })

    it('shows a "Share publicly" button in "anyone with the link" mode', async () => {
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        expect(screen.getByRole('button', { name: /share publicly/i })).toBeTruthy()
    })

    it('calls grantPublicAccess (not grantCollaboratorAccess) when "Share publicly" is clicked', async () => {
        mockGrantPublicAccess.mockResolvedValue(undefined)
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /share publicly/i }))

        await waitFor(() => expect(mockGrantPublicAccess).toHaveBeenCalledWith(mockSession, defaultProps.fileUrl))
        expect(mockGrantCollaboratorAccess).not.toHaveBeenCalled()
    })

    it('shows the generated link after granting public access', async () => {
        mockGrantPublicAccess.mockResolvedValue(undefined)
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /share publicly/i }))

        await waitFor(() => expect(screen.getByRole('textbox', { name: /shareable link/i })).toBeTruthy())
        const linkInput = screen.getByRole('textbox', { name: /shareable link/i }) as HTMLInputElement
        expect(linkInput.value).toContain('/view-lists/abc')
        expect(linkInput.value).toContain('pod=')
    })

    it('shows an error when grantPublicAccess throws', async () => {
        mockGrantPublicAccess.mockRejectedValue(new Error('ACL not supported'))
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /share publicly/i }))

        await waitFor(() => expect(screen.getByText(/ACL not supported/i)).toBeTruthy())
    })

    it('"Copy link" copies the link to clipboard in public mode', async () => {
        mockGrantPublicAccess.mockResolvedValue(undefined)
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /share publicly/i }))

        await waitFor(() => expect(screen.getByRole('button', { name: /copy link/i })).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /copy link/i }))

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/view-lists/abc'))
    })
})
