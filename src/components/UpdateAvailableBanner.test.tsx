import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { UpdateAvailableBanner } from './UpdateAvailableBanner'

describe('UpdateAvailableBanner', () => {
    it('says a new version is ready', () => {
        render(<UpdateAvailableBanner onReload={vi.fn()} />)

        expect(screen.getByRole('status').textContent).toMatch(/new version of pack me up is ready/i)
    })

    it('calls onReload when the button is pressed', () => {
        const onReload = vi.fn()
        render(<UpdateAvailableBanner onReload={onReload} />)

        fireEvent.click(screen.getByRole('button', { name: /reload/i }))

        expect(onReload).toHaveBeenCalled()
    })

    // Tailwind v4's preflight gives buttons `cursor: default`, so a text-styled
    // button looked like a link but showed no pointer on hover.
    it('shows a pointer cursor over the button', () => {
        render(<UpdateAvailableBanner onReload={vi.fn()} />)

        expect(screen.getByRole('button', { name: /reload/i }).className).toMatch(/\bcursor-pointer\b/)
    })
})
