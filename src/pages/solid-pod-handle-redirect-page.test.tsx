import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import React from 'react'
import { SolidPodHandleRedirectPage } from './solid-pod-handle-redirect-page'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}))

describe('SolidPodHandleRedirectPage', () => {
    let originalLocation: Location

    beforeEach(() => {
        mockNavigate.mockClear()
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
        setWindowLocation('?returnTo=%2Fview-lists')

        render(<SolidPodHandleRedirectPage />)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/view-lists')
        })
    })

    it('navigates to "/" when both sessionStorage authReturnTo and returnTo param are absent', async () => {
        setWindowLocation('')

        render(<SolidPodHandleRedirectPage />)

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/')
        })
    })
})
