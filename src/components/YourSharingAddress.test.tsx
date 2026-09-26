import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { YourSharingAddress } from './YourSharingAddress'

const mockShowToast = vi.fn()
vi.mock('./ToastContext', () => ({ useToast: () => ({ showToast: mockShowToast }) }))

const WEB_ID = 'https://bob.solidcommunity.net/profile/card#me'

const originalClipboard = navigator.clipboard
const originalShare = (navigator as Navigator & { share?: unknown }).share

function stubClipboard(writeText: () => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('YourSharingAddress', () => {
    beforeEach(() => {
        mockShowToast.mockReset()
        stubClipboard(vi.fn().mockResolvedValue(undefined))
    })

    afterEach(() => {
        Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
        if (originalShare === undefined) delete (navigator as Navigator & { share?: unknown }).share
        else Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true })
    })

    it('shows the address in full, because they may need to read it out', () => {
        render(<YourSharingAddress webId={WEB_ID} />)

        expect(screen.getByText(WEB_ID)).toBeTruthy()
    })

    it('copies the address and says so', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        stubClipboard(writeText)
        render(<YourSharingAddress webId={WEB_ID} />)

        fireEvent.click(screen.getByRole('button', { name: /copy my address/i }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith(WEB_ID))
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'success'))
    })

    it('tells them to select it by hand when the clipboard refuses', async () => {
        stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
        render(<YourSharingAddress webId={WEB_ID} />)

        fireEvent.click(screen.getByRole('button', { name: /copy my address/i }))

        await waitFor(() =>
            expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/select/i), 'error', expect.anything()),
        )
    })

    it('offers the phone share sheet when there is one', async () => {
        const share = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'share', { value: share, configurable: true })
        render(<YourSharingAddress webId={WEB_ID} />)

        fireEvent.click(screen.getByRole('button', { name: /^send my address$/i }))

        await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(WEB_ID) })))
    })

    it('hides the share sheet button where there is no share sheet', () => {
        delete (navigator as Navigator & { share?: unknown }).share

        render(<YourSharingAddress webId={WEB_ID} />)

        expect(screen.queryByRole('button', { name: /^send my address$/i })).toBeNull()
    })

    it('says nothing when someone cancels the share sheet', async () => {
        const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
        Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(abort), configurable: true })
        render(<YourSharingAddress webId={WEB_ID} />)

        fireEvent.click(screen.getByRole('button', { name: /^send my address$/i }))

        await new Promise(resolve => setTimeout(resolve, 0))
        expect(mockShowToast).not.toHaveBeenCalled()
    })

    it('shows a QR code on request, for the two-people-on-a-sofa case', () => {
        render(<YourSharingAddress webId={WEB_ID} />)
        expect(screen.queryByRole('img', { name: /QR code/i })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /show qr code/i }))

        expect(screen.getByRole('img', { name: /QR code/i })).toBeTruthy()
    })

    it('can be given its own wording for the places it turns up in', () => {
        render(
            <YourSharingAddress
                webId={WEB_ID}
                title="Send them this address"
                description="They shared with a different one."
            />,
        )

        expect(screen.getByText('Send them this address')).toBeTruthy()
        expect(screen.getByText('They shared with a different one.')).toBeTruthy()
    })

    // The address is the thing they came for; the sentence about it is
    // secondary, so it sits under the address and its buttons (#360).
    it('shows the address and its actions before the explanation', () => {
        render(<YourSharingAddress webId={WEB_ID} description="Why you would send this." />)

        const after = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        const description = screen.getByText('Why you would send this.')
        expect(after(screen.getByText(WEB_ID), description)).toBe(true)
        expect(after(screen.getByRole('button', { name: /copy my address/i }), description)).toBe(true)
    })
})
