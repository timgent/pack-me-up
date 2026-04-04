import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SolidProviderSelector, LAST_PROVIDER_KEY } from './SolidProviderSelector'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSelect: vi.fn(),
}

describe('SolidProviderSelector', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('default provider (no last-used stored)', () => {
    it('shows solidcommunity.net as the primary option', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      const primaryButton = screen.getByRole('button', { name: /solidcommunity\.net/i })
      expect(primaryButton).toBeTruthy()
    })

    it('hides other providers by default', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      expect(screen.queryByRole('button', { name: /inrupt podspaces/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /solidweb\.org/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /private data pod/i })).toBeNull()
    })

    it('shows other providers when "Other providers" is clicked', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /other providers/i }))
      expect(screen.getByRole('button', { name: /inrupt podspaces/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /solidweb\.org/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /private data pod/i })).toBeTruthy()
    })
  })

  describe('with last-used provider stored', () => {
    it('shows the last-used provider as the primary option', () => {
      localStorage.setItem(LAST_PROVIDER_KEY, 'https://solidweb.org')
      render(<SolidProviderSelector {...defaultProps} />)
      const primaryButton = screen.getByRole('button', { name: /solidweb\.org/i })
      expect(primaryButton).toBeTruthy()
    })

    it('does not show other providers by default', () => {
      localStorage.setItem(LAST_PROVIDER_KEY, 'https://solidweb.org')
      render(<SolidProviderSelector {...defaultProps} />)
      expect(screen.queryByRole('button', { name: /solidcommunity\.net/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /inrupt podspaces/i })).toBeNull()
    })

    it('falls back to solidcommunity.net for an unrecognised issuer', () => {
      localStorage.setItem(LAST_PROVIDER_KEY, 'https://unknown-provider.example.com')
      render(<SolidProviderSelector {...defaultProps} />)
      expect(screen.getByRole('button', { name: /solidcommunity\.net/i })).toBeTruthy()
    })
  })

  describe('saving last-used provider', () => {
    it('saves the selected provider issuer to localStorage', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /solidcommunity\.net/i }))
      expect(localStorage.getItem(LAST_PROVIDER_KEY)).toBe('https://solidcommunity.net')
    })

    it('saves a different provider when selected from the expanded list', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /other providers/i }))
      fireEvent.click(screen.getByRole('button', { name: /inrupt podspaces/i }))
      expect(localStorage.getItem(LAST_PROVIDER_KEY)).toBe('https://login.inrupt.com')
    })

    it('calls onSelect with the issuer', () => {
      const onSelect = vi.fn()
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      fireEvent.click(screen.getByRole('button', { name: /solidcommunity\.net/i }))
      expect(onSelect).toHaveBeenCalledWith('https://solidcommunity.net')
    })
  })
})
