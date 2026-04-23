import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SolidProviderSelector, LAST_PROVIDER_KEY } from './SolidProviderSelector'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSelect: vi.fn(),
}

// Queries that avoid role+name accessible-name computation (broken in happy-dom on Node 20
// for buttons whose accessible name comes from nested div children).
function getPrimaryProviderName() {
  // The primary button has a distinct blue-border class; its first child div holds the name.
  const btn = document.querySelector('button.border-blue-400') as HTMLElement | null
  return btn?.querySelector('div.font-medium')?.textContent ?? null
}

function clickProvider(name: string) {
  // Find the button that contains an exact-text name div, then click it.
  const all = Array.from(document.querySelectorAll('button'))
  const btn = all.find(b => b.querySelector('div.font-medium')?.textContent === name)
  if (!btn) throw new Error(`Provider button "${name}" not found`)
  fireEvent.click(btn)
}

function isProviderVisible(name: string): boolean {
  const all = Array.from(document.querySelectorAll('button'))
  return all.some(b => b.querySelector('div.font-medium')?.textContent === name)
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
    it('shows Inrupt PodSpaces as the primary option', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      expect(getPrimaryProviderName()).toBe('Inrupt PodSpaces')
    })

    it('hides other providers by default', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      expect(isProviderVisible('solidcommunity.net')).toBe(false)
      expect(isProviderVisible('solidweb.org')).toBe(false)
      expect(isProviderVisible('Private Data Pod')).toBe(false)
    })

    it('shows other providers when "Other providers" is clicked', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /other providers/i }))
      expect(isProviderVisible('solidcommunity.net')).toBe(true)
      expect(isProviderVisible('solidweb.org')).toBe(true)
      expect(isProviderVisible('Private Data Pod')).toBe(true)
    })
  })

  describe('with last-used provider stored', () => {
    it('shows the last-used provider as the primary option', () => {
      localStorage.setItem(LAST_PROVIDER_KEY, 'https://solidweb.org')
      render(<SolidProviderSelector {...defaultProps} />)
      expect(getPrimaryProviderName()).toBe('solidweb.org')
    })

    it('does not show other providers by default', () => {
      localStorage.setItem(LAST_PROVIDER_KEY, 'https://solidweb.org')
      render(<SolidProviderSelector {...defaultProps} />)
      expect(isProviderVisible('solidcommunity.net')).toBe(false)
      expect(isProviderVisible('Inrupt PodSpaces')).toBe(false)
    })

    it('falls back to Inrupt PodSpaces for an unrecognised issuer', () => {
      localStorage.setItem(LAST_PROVIDER_KEY, 'https://unknown-provider.example.com')
      render(<SolidProviderSelector {...defaultProps} />)
      expect(getPrimaryProviderName()).toBe('Inrupt PodSpaces')
    })
  })

  describe('saving last-used provider', () => {
    it('saves the selected provider issuer to localStorage', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      clickProvider('Inrupt PodSpaces')
      expect(localStorage.getItem(LAST_PROVIDER_KEY)).toBe('https://login.inrupt.com')
    })

    it('saves a different provider when selected from the expanded list', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /other providers/i }))
      clickProvider('solidcommunity.net')
      expect(localStorage.getItem(LAST_PROVIDER_KEY)).toBe('https://solidcommunity.net')
    })

    it('calls onSelect with the issuer', () => {
      const onSelect = vi.fn()
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      clickProvider('Inrupt PodSpaces')
      expect(onSelect).toHaveBeenCalledWith('https://login.inrupt.com')
    })
  })
})
