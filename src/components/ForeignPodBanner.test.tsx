import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React, { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ForeignPodBanner } from './ForeignPodBanner'
import { PageBannerSlot, PageBannerSlotProvider } from './PageBannerSlot'

const POD = 'https://alice.example.org/'

describe('ForeignPodBanner', () => {
    afterEach(() => cleanup())

    it('says whose data is on screen', () => {
        render(<MemoryRouter><ForeignPodBanner ownerName="Alice Smith" podUrl={POD} /></MemoryRouter>)

        expect(screen.getByTestId('foreign-pod-banner').textContent).toMatch(/Viewing Alice Smith's data/)
    })

    // Before this, the only way out of someone else's setup was the context
    // switcher in the account menu.
    it('offers the way back to your own lists', () => {
        render(<MemoryRouter><ForeignPodBanner ownerName="Alice Smith" podUrl={POD} /></MemoryRouter>)

        expect(screen.getByRole('link', { name: /back to my lists/i }).getAttribute('href')).toBe('/view-lists')
    })

    // Rendered in the page's padded container it could never be full width,
    // unlike the app's other banners — so it goes to a slot beside them.
    it('renders into the page banner slot when there is one', () => {
        function Page() {
            return (
                <div data-testid="container">
                    <ForeignPodBanner ownerName="Alice Smith" podUrl={POD} />
                </div>
            )
        }
        function Harness() {
            const [ready] = useState(true)
            return (
                <PageBannerSlotProvider>
                    <div data-testid="banners"><PageBannerSlot /></div>
                    {ready && <Page />}
                </PageBannerSlotProvider>
            )
        }
        render(<MemoryRouter><Harness /></MemoryRouter>)

        const banner = screen.getByTestId('foreign-pod-banner')
        expect(screen.getByTestId('banners').contains(banner)).toBe(true)
        expect(screen.getByTestId('container').contains(banner)).toBe(false)
    })
})
