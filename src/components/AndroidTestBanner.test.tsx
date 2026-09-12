import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

const mockIsNativePlatform = vi.fn()
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))

const mockIsRecruiting = vi.fn()
vi.mock('../config/androidTest', async () => {
    const actual = await vi.importActual<typeof import('../config/androidTest')>('../config/androidTest')
    return { ...actual, isRecruitingTesters: () => mockIsRecruiting() }
})

import { AndroidTestBanner, ANDROID_TEST_DISMISSED_KEY } from './AndroidTestBanner'
import { ANDROID_TEST_PATH } from '../config/androidTest'

function renderBanner(initialPath = '/home') {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <AndroidTestBanner />
        </MemoryRouter>,
    )
}

describe('AndroidTestBanner', () => {
    beforeEach(() => {
        mockIsNativePlatform.mockReset().mockReturnValue(false)
        mockIsRecruiting.mockReset().mockReturnValue(true)
        localStorage.clear()
    })
    afterEach(() => cleanup())

    it('asks web visitors to help with the closed test', () => {
        renderBanner()

        expect(screen.getByTestId('android-test-banner')).toBeTruthy()
    })

    it('sends people to the in-app page, never straight to Google Play', () => {
        // The Play opt-in URL only works for someone already on the tester list;
        // a stranger clicking it gets an error page. The in-app page is where the
        // account caveat and the 14-day commitment get explained first.
        renderBanner()

        const link = screen.getByRole('link', { name: /how to help/i })
        expect(link.getAttribute('href')).toBe(ANDROID_TEST_PATH)
        expect(link.getAttribute('href')).not.toContain('play.google.com')
    })

    it('stays hidden while no tester group is configured', () => {
        mockIsRecruiting.mockReturnValue(false)

        renderBanner()

        expect(screen.queryByTestId('android-test-banner')).toBeNull()
    })

    it('stays hidden inside the native app, where the reader already has it', () => {
        mockIsNativePlatform.mockReturnValue(true)

        renderBanner()

        expect(screen.queryByTestId('android-test-banner')).toBeNull()
    })

    it('stays hidden on the recruitment page itself', () => {
        renderBanner('/android-test')

        expect(screen.queryByTestId('android-test-banner')).toBeNull()
    })

    it('goes away when dismissed and remembers that', () => {
        renderBanner()

        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

        expect(screen.queryByTestId('android-test-banner')).toBeNull()
        expect(localStorage.getItem(ANDROID_TEST_DISMISSED_KEY)).toBe('true')
    })

    it('stays dismissed on the next visit', () => {
        localStorage.setItem(ANDROID_TEST_DISMISSED_KEY, 'true')

        renderBanner()

        expect(screen.queryByTestId('android-test-banner')).toBeNull()
    })

    it('still renders when localStorage cannot be read', () => {
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied')
        })

        renderBanner()

        expect(screen.getByTestId('android-test-banner')).toBeTruthy()
        getItem.mockRestore()
    })

    it('does not blow up when dismissal cannot be saved', () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('denied')
        })

        renderBanner()
        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

        expect(screen.queryByTestId('android-test-banner')).toBeNull()
        setItem.mockRestore()
    })
})
