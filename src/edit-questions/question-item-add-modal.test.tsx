import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { QuestionItemAddModal } from './question-item-add-modal'
import { Person } from './types'

const mockPeople: Person[] = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
]

function renderModal(props: Partial<Parameters<typeof QuestionItemAddModal>[0]> = {}) {
    const defaults = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        existingItemNames: ['Passport', 'Sunscreen'],
        people: mockPeople,
    }
    return render(<QuestionItemAddModal {...defaults} {...props} />)
}

describe('QuestionItemAddModal', () => {
    it('does not render when isOpen is false', () => {
        renderModal({ isOpen: false })
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('renders with title when open', () => {
        renderModal()
        expect(screen.getByRole('heading', { name: /add item/i })).toBeTruthy()
    })

    it('renders person pills', () => {
        renderModal()
        expect(screen.getByRole('button', { name: /alice/i })).toBeTruthy()
        expect(screen.getByRole('button', { name: /bob/i })).toBeTruthy()
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
        const backdrop = document.querySelector('.fixed.inset-0.bg-gray-500') as HTMLElement
        fireEvent.click(backdrop)
        expect(onClose).toHaveBeenCalled()
    })

    it('does not show person section when people array is empty', () => {
        renderModal({ people: [] })
        expect(screen.queryByText(/who needs it/i)).toBeNull()
    })
})
