import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { QrCode } from './QrCode'

describe('QrCode', () => {
    it('draws the code as an image with a label', () => {
        render(<QrCode value="https://bob.solidcommunity.net/profile/card#me" label="Bob's sharing address as a QR code" />)

        const img = screen.getByRole('img', { name: "Bob's sharing address as a QR code" })
        expect(img.querySelector('path')).toBeTruthy()
    })

    it('encodes different addresses differently', () => {
        const { container: a } = render(<QrCode value="https://alice.example.org/profile/card#me" label="a" />)
        const { container: b } = render(<QrCode value="https://bob.example.org/profile/card#me" label="b" />)

        expect(a.querySelector('path')?.getAttribute('d')).not.toBe(b.querySelector('path')?.getAttribute('d'))
    })

    it('handles an address long enough to need a bigger code', () => {
        const long = `https://storage.example.org/${'x'.repeat(200)}/profile/card#me`

        render(<QrCode value={long} label="long" />)

        expect(screen.getByRole('img', { name: 'long' }).querySelector('path')).toBeTruthy()
    })

    it('renders nothing rather than throwing on an empty value', () => {
        render(<QrCode value="" label="empty" />)

        expect(screen.queryByRole('img', { name: 'empty' })).toBeNull()
    })
})
