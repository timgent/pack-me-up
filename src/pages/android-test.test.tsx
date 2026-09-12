import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

// vi.mock is hoisted above module-level consts, so the fixture the factory
// closes over has to be hoisted with it.
const { GROUP_URL, mockIsRecruiting } = vi.hoisted(() => ({
    GROUP_URL: 'https://groups.google.com/g/packmeup-testers',
    mockIsRecruiting: vi.fn(),
}))

vi.mock('../config/androidTest', async () => {
    const actual = await vi.importActual<typeof import('../config/androidTest')>('../config/androidTest')
    return {
        ...actual,
        TESTER_GROUP_URL: GROUP_URL,
        isRecruitingTesters: () => mockIsRecruiting(),
    }
})

import { AndroidTestPage } from './android-test'
import { PLAY_OPT_IN_URL } from '../config/androidTest'

function renderPage() {
    return render(<MemoryRouter><AndroidTestPage /></MemoryRouter>)
}

describe('AndroidTestPage', () => {
    beforeEach(() => {
        mockIsRecruiting.mockReset().mockReturnValue(true)
    })
    afterEach(() => cleanup())

    describe('while recruiting', () => {
        it('sends step one to the tester group, because Play rejects anyone not on the list', () => {
            renderPage()

            const step = screen.getByTestId('android-test-step-join')
            expect(within(step).getByRole('link').getAttribute('href')).toBe(GROUP_URL)
        })

        it('sends step two to the Play opt-in page', () => {
            renderPage()

            const step = screen.getByTestId('android-test-step-opt-in')
            expect(within(step).getByRole('link').getAttribute('href')).toBe(PLAY_OPT_IN_URL)
        })

        it('opens the outbound links safely', () => {
            renderPage()

            for (const testid of ['android-test-step-join', 'android-test-step-opt-in']) {
                const link = within(screen.getByTestId(testid)).getByRole('link')
                expect(link.getAttribute('target')).toBe('_blank')
                expect(link.getAttribute('rel')).toContain('noopener')
            }
        })

        it('warns that the Google account must match the one on the phone', () => {
            // The single most common reason the opt-in link "does not work".
            expect(renderPage().container.textContent).toMatch(/same Google account/i)
        })

        it('is upfront about the 14 days', () => {
            expect(renderPage().container.textContent).toMatch(/14 days/i)
        })

        it('offers a way to report what they find', () => {
            renderPage()

            expect(screen.getByRole('link', { name: /feedback/i }).getAttribute('href')).toMatch(/^mailto:/)
        })
    })

    describe('while not recruiting', () => {
        beforeEach(() => mockIsRecruiting.mockReturnValue(false))

        it('says so rather than showing steps that go nowhere', () => {
            renderPage()

            expect(screen.getByTestId('android-test-closed')).toBeTruthy()
            expect(screen.queryByTestId('android-test-step-join')).toBeNull()
        })

        it('never shows a Play opt-in link that would only error', () => {
            expect(renderPage().container.innerHTML).not.toContain('play.google.com/apps/testing')
        })
    })
})
