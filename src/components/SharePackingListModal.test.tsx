import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { SharePackingListModal } from './SharePackingListModal'
import type { AppSession } from '../types/AppSession'

vi.mock('../services/solidPod', () => ({
    grantCollaboratorAccess: vi.fn(),
    grantPublicAccess: vi.fn(),
    revokeCollaboratorAccess: vi.fn(),
    revokePublicAccess: vi.fn(),
    getCollaborators: vi.fn(),
    isPubliclyAccessible: vi.fn(),
}))

import {
    grantCollaboratorAccess,
    grantPublicAccess,
    revokeCollaboratorAccess,
    revokePublicAccess,
    getCollaborators,
    isPubliclyAccessible,
} from '../services/solidPod'

const mockGrantCollaboratorAccess = vi.mocked(grantCollaboratorAccess)
const mockGrantPublicAccess = vi.mocked(grantPublicAccess)
const mockRevokeCollaboratorAccess = vi.mocked(revokeCollaboratorAccess)
const mockRevokePublicAccess = vi.mocked(revokePublicAccess)
const mockGetCollaborators = vi.mocked(getCollaborators)
const mockIsPubliclyAccessible = vi.mocked(isPubliclyAccessible)

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
        mockGetCollaborators.mockResolvedValue([])
        mockIsPubliclyAccessible.mockResolvedValue(false)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('rendering', () => {
        it('renders when isOpen is true', async () => {
            renderModal()
            await waitFor(() => expect(screen.getByText('Manage sharing')).toBeTruthy())
        })

        it('does not render when isOpen is false', () => {
            renderModal({ isOpen: false })
            expect(screen.queryByText('Manage sharing')).toBeNull()
        })

        it('renders a WebID input in "With a person" mode', async () => {
            renderModal()
            await waitFor(() => expect(screen.getByPlaceholderText(/profile\/card#me/i)).toBeTruthy())
        })

        it('renders a Share button', async () => {
            renderModal()
            await waitFor(() => expect(screen.getByRole('button', { name: /^share$/i })).toBeTruthy())
        })
    })

    describe('current access section', () => {
        it('shows loading state while fetching ACL', () => {
            mockGetCollaborators.mockReturnValue(new Promise(() => {}))
            mockIsPubliclyAccessible.mockReturnValue(new Promise(() => {}))
            renderModal()
            expect(screen.getByText('Loading…')).toBeTruthy()
        })

        it('shows empty state when no collaborators and not public', async () => {
            mockGetCollaborators.mockResolvedValue([])
            mockIsPubliclyAccessible.mockResolvedValue(false)
            renderModal()
            await waitFor(() => expect(screen.getByText('No one else has access yet.')).toBeTruthy())
        })

        it('shows current named collaborators', async () => {
            mockGetCollaborators.mockResolvedValue(['https://bob.solidcommunity.net/profile/card#me'])
            mockIsPubliclyAccessible.mockResolvedValue(false)
            renderModal()
            await waitFor(() =>
                expect(screen.getByText('https://bob.solidcommunity.net/profile/card#me')).toBeTruthy()
            )
        })

        it('shows public row when publicly accessible', async () => {
            mockGetCollaborators.mockResolvedValue([])
            mockIsPubliclyAccessible.mockResolvedValue(true)
            renderModal()
            await waitFor(() => expect(screen.getByText('🌐 Anyone with the link')).toBeTruthy())
        })

        it('shows revoke button for each named collaborator', async () => {
            mockGetCollaborators.mockResolvedValue(['https://bob.solidcommunity.net/profile/card#me'])
            mockIsPubliclyAccessible.mockResolvedValue(false)
            renderModal()
            await waitFor(() =>
                expect(screen.getByRole('button', { name: /revoke access for https:\/\/bob/i })).toBeTruthy()
            )
        })

        it('shows revoke button for public access', async () => {
            mockGetCollaborators.mockResolvedValue([])
            mockIsPubliclyAccessible.mockResolvedValue(true)
            renderModal()
            await waitFor(() =>
                expect(screen.getByRole('button', { name: /revoke public access/i })).toBeTruthy()
            )
        })
    })

    describe('revoking access', () => {
        it('calls revokeCollaboratorAccess and refreshes list', async () => {
            mockGetCollaborators.mockResolvedValue(['https://bob.solidcommunity.net/profile/card#me'])
            mockIsPubliclyAccessible.mockResolvedValue(false)
            mockRevokeCollaboratorAccess.mockResolvedValue(undefined)
            renderModal()

            const revokeBtn = await waitFor(() =>
                screen.getByRole('button', { name: /revoke access for https:\/\/bob/i })
            )
            fireEvent.click(revokeBtn)

            await waitFor(() =>
                expect(mockRevokeCollaboratorAccess).toHaveBeenCalledWith(
                    mockSession,
                    defaultProps.fileUrl,
                    'https://bob.solidcommunity.net/profile/card#me'
                )
            )
        })

        it('calls revokePublicAccess when revoking public access', async () => {
            mockGetCollaborators.mockResolvedValue([])
            mockIsPubliclyAccessible.mockResolvedValue(true)
            mockRevokePublicAccess.mockResolvedValue(undefined)
            renderModal()

            const revokeBtn = await waitFor(() =>
                screen.getByRole('button', { name: /revoke public access/i })
            )
            fireEvent.click(revokeBtn)

            await waitFor(() =>
                expect(mockRevokePublicAccess).toHaveBeenCalledWith(mockSession, defaultProps.fileUrl)
            )
        })
    })

    describe('granting access', () => {
        it('does not call grantCollaboratorAccess when WebID input is empty', async () => {
            renderModal()
            await waitFor(() => screen.getByRole('button', { name: /^share$/i }))
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))
            expect(mockGrantCollaboratorAccess).not.toHaveBeenCalled()
        })

        it('calls grantCollaboratorAccess with the entered WebID directly', async () => {
            mockGrantCollaboratorAccess.mockResolvedValue(undefined)
            renderModal()

            await waitFor(() => screen.getByPlaceholderText(/profile\/card#me/i))
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

            await waitFor(() => screen.getByPlaceholderText(/profile\/card#me/i))
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

            await waitFor(() => screen.getByPlaceholderText(/profile\/card#me/i))
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

            await waitFor(() => screen.getByPlaceholderText(/profile\/card#me/i))
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

            await waitFor(() => screen.getByPlaceholderText(/profile\/card#me/i))
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

            await waitFor(() => screen.getByPlaceholderText(/profile\/card#me/i))
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

            await waitFor(() => screen.getByPlaceholderText(/profile\/card#me/i))
            fireEvent.change(screen.getByPlaceholderText(/profile\/card#me/i), {
                target: { value: 'https://bob.solidcommunity.net/profile/card#me' },
            })
            fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

            await waitFor(() => expect(screen.getByText(/ACL not supported/i)).toBeTruthy())
        })

        it('clears error message when WebID input changes', async () => {
            mockGrantCollaboratorAccess.mockRejectedValue(new Error('ACL not supported'))
            renderModal()

            await waitFor(() => screen.getByPlaceholderText(/profile\/card#me/i))
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
        mockGetCollaborators.mockResolvedValue([])
        mockIsPubliclyAccessible.mockResolvedValue(false)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders a tab or button to switch to "anyone with the link" mode', async () => {
        render(<SharePackingListModal {...defaultProps} />)
        await waitFor(() => expect(screen.getByRole('button', { name: /anyone with the link/i })).toBeTruthy())
    })

    it('switching to "anyone with the link" mode hides the WebID input', async () => {
        render(<SharePackingListModal {...defaultProps} />)
        await waitFor(() => screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        expect(screen.queryByPlaceholderText(/profile\/card#me/i)).toBeNull()
    })

    it('shows a "Share publicly" button in "anyone with the link" mode', async () => {
        render(<SharePackingListModal {...defaultProps} />)
        await waitFor(() => screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        expect(screen.getByRole('button', { name: /share publicly/i })).toBeTruthy()
    })

    it('calls grantPublicAccess (not grantCollaboratorAccess) when "Share publicly" is clicked', async () => {
        mockGrantPublicAccess.mockResolvedValue(undefined)
        render(<SharePackingListModal {...defaultProps} />)
        await waitFor(() => screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /share publicly/i }))

        await waitFor(() => expect(mockGrantPublicAccess).toHaveBeenCalledWith(mockSession, defaultProps.fileUrl))
        expect(mockGrantCollaboratorAccess).not.toHaveBeenCalled()
    })

    it('shows the generated link after granting public access', async () => {
        mockGrantPublicAccess.mockResolvedValue(undefined)
        render(<SharePackingListModal {...defaultProps} />)
        await waitFor(() => screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /share publicly/i }))

        await waitFor(() => expect(screen.getByRole('textbox', { name: /shareable link/i })).toBeTruthy())
        const linkInput = screen.getByRole('textbox', { name: /shareable link/i }) as HTMLInputElement
        expect(linkInput.value).toContain('/view-lists/abc')
        expect(linkInput.value).toContain('pod=')
    })

    it('shows an error when grantPublicAccess throws', async () => {
        mockGrantPublicAccess.mockRejectedValue(new Error('ACL not supported'))
        render(<SharePackingListModal {...defaultProps} />)
        await waitFor(() => screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /share publicly/i }))

        await waitFor(() => expect(screen.getByText(/ACL not supported/i)).toBeTruthy())
    })

    it('"Copy link" copies the link to clipboard in public mode', async () => {
        mockGrantPublicAccess.mockResolvedValue(undefined)
        render(<SharePackingListModal {...defaultProps} />)
        await waitFor(() => screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /anyone with the link/i }))
        fireEvent.click(screen.getByRole('button', { name: /share publicly/i }))

        await waitFor(() => expect(screen.getByRole('button', { name: /copy link/i })).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /copy link/i }))

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/view-lists/abc'))
    })
})
