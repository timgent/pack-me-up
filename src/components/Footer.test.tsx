import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

const { mockIsRecruiting, mockIsNativePlatform } = vi.hoisted(() => ({
    mockIsRecruiting: vi.fn(),
    mockIsNativePlatform: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))

vi.mock('../config/androidTest', async () => {
    const actual = await vi.importActual<typeof import('../config/androidTest')>('../config/androidTest')
    return { ...actual, isRecruitingTesters: () => mockIsRecruiting() }
})

import { Footer, FEEDBACK_EMAIL } from './Footer'

function renderFooter() {
    return render(<MemoryRouter><Footer /></MemoryRouter>)
}

describe('Footer', () => {
    beforeEach(() => {
        mockIsRecruiting.mockReset().mockReturnValue(false)
        mockIsNativePlatform.mockReset().mockReturnValue(false)
    })
    afterEach(() => {
        cleanup()
    })

    it('links to the privacy policy', () => {
        renderFooter()

        expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe('/privacy-policy')
    })

    it('links to the data deletion page, which is the URL Google Play is given', () => {
        renderFooter()

        expect(screen.getByRole('link', { name: 'Delete my data' }).getAttribute('href')).toBe('/your-data')
    })

    it('links to settings, the one place a signed-out user can reach the theme choice', () => {
        renderFooter()

        expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
    })

    it('offers a way to get in touch', () => {
        renderFooter()

        expect(screen.getByRole('link', { name: 'Feedback' }).getAttribute('href')).toBe(`mailto:${FEEDBACK_EMAIL}`)
    })

    // Sentry's feedback widget is a fixed circle in the bottom-right corner, and
    // on a narrow screen it sat right on top of the "Feedback" link once you
    // scrolled to the end of the page. The links need to clear it; on desktop the
    // row is centred well clear of the widget, so the extra space comes off again.
    it('keeps the links clear of the floating feedback widget on mobile', () => {
        const { container } = renderFooter()

        const nav = container.querySelector('footer nav')!
        expect(nav.className).toContain('pb-24')
        expect(nav.className).toContain('md:pb-5')
    })

    // Same story as the nav's top inset: a browser tab has its own chrome below
    // the page, so only the native shell and installed PWAs should reserve room
    // for the gesture bar. CSS decides that, not an inline style.
    it('leaves the gesture-bar inset to CSS rather than an inline style', () => {
        const { container } = renderFooter()

        const footer = container.querySelector('footer')!
        expect(footer.style.paddingBottom).toBe('')
        expect(footer.className).toContain('safe-area-bottom')
    })

    it('avoids reusing "Your data", which the pod switcher already uses for something else', () => {
        renderFooter()

        expect(screen.queryByRole('link', { name: /^your data$/i })).toBeNull()
    })
})

describe('Footer tester recruitment link', () => {
    beforeEach(() => {
        mockIsRecruiting.mockReset().mockReturnValue(true)
        mockIsNativePlatform.mockReset().mockReturnValue(false)
    })
    afterEach(() => cleanup())

    it('offers the way back to the test page, since the banner dismisses for good', () => {
        renderFooter()

        expect(screen.getByRole('link', { name: 'Help test on Android' }).getAttribute('href')).toBe('/android-test')
    })

    it('says nothing while no tester group is configured', () => {
        mockIsRecruiting.mockReturnValue(false)

        renderFooter()

        expect(screen.queryByRole('link', { name: 'Help test on Android' })).toBeNull()
    })

    it('says nothing in the native app, whose reader already has it', () => {
        mockIsNativePlatform.mockReturnValue(true)

        renderFooter()

        expect(screen.queryByRole('link', { name: 'Help test on Android' })).toBeNull()
    })
})
