import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ShareActions } from './ShareActions'

const mockShowToast = vi.fn()
vi.mock('./ToastContext', () => ({ useToast: () => ({ showToast: mockShowToast }) }))

const LINK = 'https://pack-me-up.app/#/view-lists/abc?pod=https%3A%2F%2Falice.example.org%2F'

const originalShare = (navigator as Navigator & { share?: unknown }).share

const props = {
    value: LINK,
    copyLabel: 'Copy link',
    copiedMessage: 'Link copied',
    shareLabel: 'Send link',
    shareTitle: 'A packing list',
    shareText: `Here's the list: ${LINK}`,
    qrLabel: 'This link as a QR code',
    qrHint: 'They can point a camera at this.',
    errorContext: 'test',
}

describe('ShareActions', () => {
    beforeEach(() => {
        mockShowToast.mockReset()
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        })
    })

    afterEach(() => {
        if (originalShare === undefined) delete (navigator as Navigator & { share?: unknown }).share
        else Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true })
    })

    it('copies the value and confirms in the caller’s words', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        render(<ShareActions {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK))
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Link copied', 'success'))
    })

    it('takes a function for the confirmation when it should vary', async () => {
        const copiedMessage = vi.fn(() => 'Freshly worded')
        render(<ShareActions {...props} copiedMessage={copiedMessage} />)

        fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Freshly worded', 'success'))
    })

    it('says what to do instead when the clipboard refuses', async () => {
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
            configurable: true,
        })
        render(<ShareActions {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

        await waitFor(() =>
            expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/select/i), 'error', expect.anything()),
        )
    })

    it('offers the system share sheet where there is one', async () => {
        const share = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'share', { value: share, configurable: true })
        render(<ShareActions {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Send link' }))

        await waitFor(() => expect(share).toHaveBeenCalledWith({
            title: 'A packing list',
            text: `Here's the list: ${LINK}`,
        }))
    })

    it('hides the share button where there is no share sheet', () => {
        delete (navigator as Navigator & { share?: unknown }).share

        render(<ShareActions {...props} />)

        expect(screen.queryByRole('button', { name: 'Send link' })).toBeNull()
    })

    it('stays quiet when the share sheet is dismissed', async () => {
        const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
        Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(abort), configurable: true })
        render(<ShareActions {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Send link' }))

        await new Promise(resolve => setTimeout(resolve, 0))
        expect(mockShowToast).not.toHaveBeenCalled()
    })

    it('toggles a QR code of the value', () => {
        render(<ShareActions {...props} />)
        expect(screen.queryByRole('img', { name: 'This link as a QR code' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /show qr code/i }))
        expect(screen.getByRole('img', { name: 'This link as a QR code' })).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: /hide qr code/i }))
        expect(screen.queryByRole('img', { name: 'This link as a QR code' })).toBeNull()
    })
})
