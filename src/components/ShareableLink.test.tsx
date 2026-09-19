import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ShareableLink } from './ShareableLink'

vi.mock('./ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const LINK = 'https://pack-me-up.app/#/view-lists/abc?pod=https%3A%2F%2Falice.example.org%2F'

describe('ShareableLink', () => {
    beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        })
        delete (navigator as Navigator & { share?: unknown }).share
    })

    it('shows the link in a field they can select and copy by hand', () => {
        render(<ShareableLink link={LINK} label="Shareable link" />)

        expect((screen.getByRole('textbox', { name: 'Shareable link' }) as HTMLInputElement).value).toBe(LINK)
    })

    it('copies the link', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        render(<ShareableLink link={LINK} label="Shareable link" />)

        fireEvent.click(screen.getByRole('button', { name: /copy link/i }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK))
    })

    it('offers the share sheet for the link, which is the half that has to travel', async () => {
        const share = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'share', { value: share, configurable: true })
        render(<ShareableLink link={LINK} label="Shareable link" />)

        fireEvent.click(screen.getByRole('button', { name: /send link/i }))

        await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining(LINK),
        })))
    })

    it('offers the link as a QR code for a phone in the same room', () => {
        render(<ShareableLink link={LINK} label="Shareable link" />)

        fireEvent.click(screen.getByRole('button', { name: /show qr code/i }))

        expect(screen.getByRole('img', { name: /QR code/i })).toBeTruthy()
    })

    it('selects the whole link when the field is clicked', () => {
        render(<ShareableLink link={LINK} label="Shareable link" />)
        const field = screen.getByRole('textbox', { name: 'Shareable link' }) as HTMLInputElement
        field.select = vi.fn()

        fireEvent.click(field)

        expect(field.select).toHaveBeenCalled()
    })

    it('names what is being shared in the message when told', async () => {
        const share = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'share', { value: share, configurable: true })
        render(<ShareableLink link={LINK} label="Shareable link" subject="Ski trip" />)

        fireEvent.click(screen.getByRole('button', { name: /send link/i }))

        await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Ski trip'),
        })))
    })
})
