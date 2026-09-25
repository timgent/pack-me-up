import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { ShareByAddress } from './ShareByAddress'

describe('ShareByAddress', () => {
    afterEach(() => cleanup())

    // The invite link is the path that needs nothing; the address field is
    // the one that needs something only the other person has. So it is there
    // for whoever wants it, and closed for everybody else.
    it('is closed until asked for', () => {
        const { container } = render(<ShareByAddress open={false} onOpenChange={vi.fn()}><input aria-label="field" /></ShareByAddress>)

        expect(screen.getByText(/use a sharing address instead/i)).toBeTruthy()
        expect(container.querySelector('details')?.open).toBe(false)
    })

    it('opens when told to — picking someone you know fills it in', () => {
        const { container } = render(<ShareByAddress open onOpenChange={vi.fn()}><input aria-label="field" /></ShareByAddress>)

        expect(container.querySelector('details')?.open).toBe(true)
    })

    it('reports being opened by hand', () => {
        const onOpenChange = vi.fn()
        const { container } = render(<ShareByAddress open={false} onOpenChange={onOpenChange}><input aria-label="field" /></ShareByAddress>)

        const details = container.querySelector('details')!
        details.open = true
        fireEvent(details, new Event('toggle'))

        expect(onOpenChange).toHaveBeenCalledWith(true)
    })
})
