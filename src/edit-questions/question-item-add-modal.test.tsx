import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { QuestionItemAddModal } from './question-item-add-modal'

function renderModal(props: Partial<Parameters<typeof QuestionItemAddModal>[0]> = {}) {
    const defaults = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        existingItemNames: ['Passport', 'Wallet'],
    }
    return { ...render(<QuestionItemAddModal {...defaults} {...props} />), ...defaults, ...props }
}

describe('QuestionItemAddModal', () => {
    it('does not render when isOpen is false', () => {
        renderModal({ isOpen: false })
        expect(screen.queryByText('Add Item')).toBeNull()
    })

    it('renders with title when open', () => {
        renderModal()
        expect(screen.getByRole('heading', { name: /add item/i })).toBeTruthy()
    })

    it('renders Cancel button', () => {
        renderModal()
        expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy()
    })

    it('calls onClose when Cancel is clicked', () => {
        const onClose = vi.fn()
        renderModal({ onClose })
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
        expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when backdrop is clicked', () => {
        const onClose = vi.fn()
        renderModal({ onClose })
        // The backdrop is the fixed overlay div behind the dialog
        const backdrop = document.querySelector('.fixed.inset-0.bg-gray-500') as HTMLElement
        fireEvent.click(backdrop)
        expect(onClose).toHaveBeenCalled()
    })
})
