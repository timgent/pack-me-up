import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import React from 'react'
import { SolidPodHandleRedirectPage } from './solid-pod-handle-redirect-page'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}))

let mockHasQuestions = { hasQuestions: true, isLoading: false }
vi.mock('../hooks/useHasQuestions', () => ({
    useHasQuestions: () => mockHasQuestions,
}))

describe('SolidPodHandleRedirectPage', () => {
    let originalLocation: Location

    beforeEach(() => {
        mockNavigate.mockClear()
        mockHasQuestions = { hasQuestions: true, isLoading: false }
        sessionStorage.clear()
        originalLocation = window.location
    })

    afterEach(() => {
        sessionStorage.clear()
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    })

    function setWindowLocation(search: string) {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, search },
        })
    }

    it('navigates to sessionStorage authReturnTo route when set, and clears it', async () => {
        sessionStorage.setItem('authReturnTo', '/create-packing-list')
        setWindowLocation('?returnTo=%2Fmanage-questions')

        render(<SolidPodHandleRedirectPage />)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/create-packing-list')
        })
        expect(sessionStorage.getItem('authReturnTo')).toBeNull()
    })

    it('falls back to returnTo URL param when sessionStorage is empty', async () => {
        setWindowLocation('?returnTo=%2Fview-lists%2Fabc123')

        render(<SolidPodHandleRedirectPage />)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/view-lists/abc123')
        })
    })

    // #334: a deep link is an intent to come back; the home page is not.
    it('restores a deep link even for someone with no questions yet', async () => {
        mockHasQuestions = { hasQuestions: false, isLoading: false }
        sessionStorage.setItem('authReturnTo', '/view-lists/abc123')
        setWindowLocation('')

        render(<SolidPodHandleRedirectPage />)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/view-lists/abc123')
        })
    })

    it('sends someone who signed in from the home page to their lists', async () => {
        sessionStorage.setItem('authReturnTo', '/home')
        setWindowLocation('')

        render(<SolidPodHandleRedirectPage />)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/view-lists', { replace: true })
        })
        expect(sessionStorage.getItem('authReturnTo')).toBeNull()
    })

    it('sends someone with no questions to the wizard rather than an empty list view', async () => {
        mockHasQuestions = { hasQuestions: false, isLoading: false }
        sessionStorage.setItem('authReturnTo', '/home')
        setWindowLocation('')

        render(<SolidPodHandleRedirectPage />)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/wizard', { replace: true })
        })
    })

    it('navigates to the suggested destination when no route was stored at all', async () => {
        setWindowLocation('')

        render(<SolidPodHandleRedirectPage />)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/view-lists', { replace: true })
        })
    })

    // The pod sync that supplies the question set is still running, so the
    // answer could still change — guessing here is what sent returning users
    // into the wizard in #333.
    it('waits rather than guessing while the question check is still settling', async () => {
        mockHasQuestions = { hasQuestions: false, isLoading: true }
        sessionStorage.setItem('authReturnTo', '/home')
        setWindowLocation('')

        const { queryByText } = render(<SolidPodHandleRedirectPage />)

        await waitFor(() => expect(queryByText('Logging in...')).not.toBeNull())
        expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('navigates once the question check settles', async () => {
        mockHasQuestions = { hasQuestions: false, isLoading: true }
        setWindowLocation('')

        const { rerender } = render(<SolidPodHandleRedirectPage />)
        expect(mockNavigate).not.toHaveBeenCalled()

        mockHasQuestions = { hasQuestions: true, isLoading: false }
        rerender(<SolidPodHandleRedirectPage />)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/view-lists', { replace: true })
        })
        expect(mockNavigate).toHaveBeenCalledTimes(1)
    })
})
