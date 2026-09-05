import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { LoadingState } from './LoadingState'

describe('LoadingState', () => {
    it('announces what is loading to screen readers', () => {
        render(<LoadingState message="Loading packing lists..." />)

        const status = screen.getByRole('status')
        expect(status.textContent).toContain('Loading packing lists...')
        expect(status.getAttribute('aria-live')).toBe('polite')
    })

    it('shows a packing-themed suitcase that screen readers skip', () => {
        const { container } = render(<LoadingState message="Loading backups..." />)

        // An icon rather than 🧳 since #335, so it takes the theme's colour —
        // but it is still the rocking suitcase, and still skipped by readers.
        const suitcase = container.querySelector('.loading-suitcase')
        expect(suitcase).toBeTruthy()
        expect(suitcase!.tagName.toLowerCase()).toBe('svg')
        expect(suitcase!.getAttribute('aria-hidden')).toBe('true')
    })

    it('renders a skeleton of the content to come', () => {
        render(<LoadingState message="Loading packing lists..." />)

        expect(screen.getAllByTestId('loading-skeleton-card')).toHaveLength(3)
    })

    it('lets a page choose how many skeleton cards to show', () => {
        render(<LoadingState message="Loading questions..." rows={5} />)

        expect(screen.getAllByTestId('loading-skeleton-card')).toHaveLength(5)
    })

    it('hides the decorative skeleton from screen readers, which already have the message', () => {
        render(<LoadingState message="Loading packing list..." />)

        const skeleton = screen.getByTestId('loading-skeleton')
        expect(skeleton.getAttribute('aria-hidden')).toBe('true')
    })

    it('holds still for anyone who asked for reduced motion', () => {
        const css = readFileSync(resolve(__dirname, '../index.css'), 'utf-8')
        const reducedMotionBlocks = css
            .split('@media (prefers-reduced-motion: reduce) {')
            .slice(1)
            .join('\n')

        expect(reducedMotionBlocks).toContain('.loading-suitcase')
        expect(reducedMotionBlocks).toContain('.loading-skeleton-bar')
    })
})
