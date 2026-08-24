import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ThemeProvider, THEME_STORAGE_KEY } from './ThemeContext'
import { ThemeToggle } from './ThemeToggle'

function renderToggle(props: Partial<React.ComponentProps<typeof ThemeToggle>> = {}) {
    return render(
        <ThemeProvider>
            <ThemeToggle {...props} />
        </ThemeProvider>
    )
}

describe('ThemeToggle', () => {
    beforeEach(() => {
        window.localStorage.clear()
        document.documentElement.classList.remove('dark')
        window.matchMedia = vi.fn().mockReturnValue({
            matches: false,
            media: '(prefers-color-scheme: dark)',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }) as unknown as typeof window.matchMedia
    })

    it('offers to switch to dark while the app is light', () => {
        renderToggle()

        expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeTruthy()
    })

    it('switches the theme when clicked, and then offers the way back', () => {
        renderToggle()

        fireEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }))

        expect(document.documentElement.classList.contains('dark')).toBe(true)
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

        fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }))

        expect(document.documentElement.classList.contains('dark')).toBe(false)
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    })

    it('shows a visible label when asked, for the mobile menu', () => {
        renderToggle({ showLabel: true })

        expect(screen.getByText('Dark mode')).toBeTruthy()
    })

    it('has no visible label by default, for the icon-only desktop nav', () => {
        renderToggle()

        expect(screen.queryByText('Dark mode')).toBeNull()
    })
})
