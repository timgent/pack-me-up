import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PrivacyPolicyPage } from './privacy-policy'

describe('PrivacyPolicyPage', () => {
    it('renders the privacy policy heading', () => {
        render(<PrivacyPolicyPage />)

        expect(screen.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeTruthy()
    })

    it('mentions where data is stored', () => {
        render(<PrivacyPolicyPage />)

        expect(screen.getByRole('heading', { name: 'Where your data is stored' })).toBeTruthy()
        expect(screen.getAllByText(/Solid Pod/).length).toBeGreaterThan(0)
    })

    it('provides a contact email', () => {
        render(<PrivacyPolicyPage />)

        const link = screen.getByRole('link', { name: 'tim.packmeup@gmail.com' })
        expect(link.getAttribute('href')).toBe('mailto:tim.packmeup@gmail.com')
    })
})
