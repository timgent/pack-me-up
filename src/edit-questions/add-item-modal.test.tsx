import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { AddItemModal } from './add-item-modal'
import { Question } from './types'

const mockQuestions: Question[] = [
    {
        id: 'q1',
        text: 'Transport?',
        options: [
            { id: 'o1', text: 'Car', items: [], order: 0 },
            { id: 'o2', text: 'Plane', items: [], order: 1 },
        ],
        order: 0,
        type: 'saved',
    },
    {
        id: 'q2',
        text: 'Climate?',
        options: [
            { id: 'o3', text: 'Hot', items: [], order: 0 },
        ],
        order: 1,
        type: 'saved',
    },
]

function renderModal(props: Partial<Parameters<typeof AddItemModal>[0]> = {}) {
    const defaults = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        questions: mockQuestions,
    }
    return render(<AddItemModal {...defaults} {...props} />)
}

describe('AddItemModal', () => {
    it('does not render when isOpen is false', () => {
        renderModal({ isOpen: false })
        expect(screen.queryByText('Add Item')).toBeNull()
    })

    it('renders when isOpen is true', () => {
        renderModal()
        expect(screen.getByText('Add Item')).toBeTruthy()
    })

    it('renders "Always Needed Items" as a button', () => {
        renderModal()
        expect(screen.getByRole('button', { name: 'Always Needed Items' })).toBeTruthy()
    })

    it('renders question/option pairs as buttons', () => {
        renderModal()
        expect(screen.getByRole('button', { name: /Car/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Plane/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Hot/ })).toBeTruthy()
    })

    it('calls onConfirm with { type: always } when "Always Needed Items" clicked', () => {
        const onConfirm = vi.fn()
        renderModal({ onConfirm })
        fireEvent.click(screen.getByRole('button', { name: 'Always Needed Items' }))
        expect(onConfirm).toHaveBeenCalledWith({ type: 'always' })
    })

    it('calls onConfirm with option destination when an option button clicked', () => {
        const onConfirm = vi.fn()
        renderModal({ onConfirm })
        fireEvent.click(screen.getByRole('button', { name: /Plane/ }))
        expect(onConfirm).toHaveBeenCalledWith({ type: 'option', questionId: 'q1', optionId: 'o2' })
    })

    it('calls onClose when a destination button is clicked', () => {
        const onClose = vi.fn()
        renderModal({ onClose })
        fireEvent.click(screen.getByRole('button', { name: 'Always Needed Items' }))
        expect(onClose).toHaveBeenCalled()
    })

    it('shows only "Always Needed Items" button when questions array is empty', () => {
        renderModal({ questions: [] })
        expect(screen.getByRole('button', { name: 'Always Needed Items' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Car|Plane|Hot/ })).toBeNull()
    })
})
