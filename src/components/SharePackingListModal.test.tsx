import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { SharePackingListModal } from './SharePackingListModal'
import type { AppSession } from '../types/AppSession'

vi.mock('../services/solidPod', () => ({
    grantCollaboratorAccess: vi.fn(),
    deriveWebIdFromPodUrl: vi.fn((url: string) => `${url.replace(/\/$/, '')}/profile/card#me`),
}))

import { grantCollaboratorAccess, deriveWebIdFromPodUrl } from '../services/solidPod'

const mockGrantCollaboratorAccess = vi.mocked(grantCollaboratorAccess)
const mockDeriveWebIdFromPodUrl = vi.mocked(deriveWebIdFromPodUrl)

const mockSession = {
    info: { isLoggedIn: true, webId: 'https://alice.solidcommunity.net/profile/card#me' },
    fetch: vi.fn(),
} as unknown as AppSession

const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    session: mockSession,
    fileUrl: 'https://alice.solidcommunity.net/pack-me-up/packing-lists/abc.json',
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

        it('renders a pod URL input', () => {
            renderModal()
            expect(screen.getByPlaceholderText(/pod url/i)).toBeTruthy()
        })

        it('renders a Share button', () => {
            renderModal()
            expect(screen.getByRole('button', { name: /^share$/i })).toBeTruthy()
        })
    })

    describe('granting access', () => {
        it('does not call grantCollaboratorAccess when pod URL input is empty', async () => {
            renderModal()
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))
            expect(mockGrantCollaboratorAccess).not.toHaveBeenCalled()
        })

        it('calls deriveWebIdFromPodUrl with the entered pod URL', async () => {
            mockGrantCollaboratorAccess.mockResolvedValue(undefined)
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/pod url/i), {
                target: { value: 'https://bob.solidcommunity.net/' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(mockDeriveWebIdFromPodUrl).toHaveBeenCalledWith('https://bob.solidcommunity.net/'))
        })

        it('calls grantCollaboratorAccess with session, fileUrl, and derived WebID', async () => {
            mockGrantCollaboratorAccess.mockResolvedValue(undefined)
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/pod url/i), {
                target: { value: 'https://bob.solidcommunity.net/' },
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

            fireEvent.change(screen.getByPlaceholderText(/pod url/i), {
                target: { value: 'https://bob.solidcommunity.net/' },
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

            fireEvent.change(screen.getByPlaceholderText(/pod url/i), {
                target: { value: 'https://bob.solidcommunity.net/' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(screen.getByRole('button', { name: /copy link/i })).toBeTruthy())
        })

        it('Share button is disabled while grant is in progress', async () => {
            let resolveGrant: () => void
            mockGrantCollaboratorAccess.mockReturnValue(new Promise(res => { resolveGrant = res }))
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/pod url/i), {
                target: { value: 'https://bob.solidcommunity.net/' },
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

            fireEvent.change(screen.getByPlaceholderText(/pod url/i), {
                target: { value: 'https://bob.solidcommunity.net/' },
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

            fireEvent.change(screen.getByPlaceholderText(/pod url/i), {
                target: { value: 'https://bob.solidcommunity.net/' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(screen.getByText(/ACL not supported/i)).toBeTruthy())
        })

        it('clears error message when pod URL input changes', async () => {
            mockGrantCollaboratorAccess.mockRejectedValue(new Error('ACL not supported'))
            renderModal()

            fireEvent.change(screen.getByPlaceholderText(/pod url/i), {
                target: { value: 'https://bob.solidcommunity.net/' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(screen.getByText(/ACL not supported/i)).toBeTruthy())

            fireEvent.change(screen.getByPlaceholderText(/pod url/i), {
                target: { value: 'https://carol.solidcommunity.net/' },
            })

            expect(screen.queryByText(/ACL not supported/i)).toBeNull()
        })
    })
})
