import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { ThemeProvider } from '../components/ThemeContext'
import { SettingsPage } from './settings'

function renderPage() {
    return render(
        <ThemeProvider>
            <SettingsPage />
        </ThemeProvider>
    )
}

describe('SettingsPage', () => {
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

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('is titled Settings', () => {
        renderPage()

        expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    })

    it('offers the theme choice under Appearance', () => {
        renderPage()

        expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeTruthy()
        expect(screen.getByRole('radio', { name: /^light$/i })).toBeTruthy()
        expect(screen.getByRole('radio', { name: /^dark$/i })).toBeTruthy()
        expect(screen.getByRole('radio', { name: /^system$/i })).toBeTruthy()
    })

    /*
     * The page has to work signed out — that is why the theme control lives here
     * and not only in the account menu, which a signed-out user has no way to
     * open. It takes no session props at all, so this is a rendering assertion.
     */
    it('needs no session to render', () => {
        expect(() => renderPage()).not.toThrow()
    })
})
