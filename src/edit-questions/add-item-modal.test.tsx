import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { AddItemModal, AddItemDestination } from './add-item-modal'
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

    it('renders "Always Needed Items" as an option', () => {
        renderModal()
        expect(screen.getByRole('option', { name: 'Always Needed Items' })).toBeTruthy()
    })

    it('renders question/option pairs as select options', () => {
        renderModal()
        expect(screen.getByRole('option', { name: 'Transport?: Car' })).toBeTruthy()
        expect(screen.getByRole('option', { name: 'Transport?: Plane' })).toBeTruthy()
        expect(screen.getByRole('option', { name: 'Climate?: Hot' })).toBeTruthy()
    })

    it('defaults to "Always Needed Items" selected on open', () => {
        renderModal()
        const select = screen.getByRole('combobox')
        expect((select as HTMLSelectElement).value).toBe('always')
    })

    it('calls onConfirm with { type: always } when confirmed with default selection', () => {
        const onConfirm = vi.fn()
        renderModal({ onConfirm })
        fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
        expect(onConfirm).toHaveBeenCalledWith({ type: 'always' })
    })

    it('calls onConfirm with option destination when an option row is selected', () => {
        const onConfirm = vi.fn()
        renderModal({ onConfirm })
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'q1::o2' } })
        fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
        expect(onConfirm).toHaveBeenCalledWith({ type: 'option', questionId: 'q1', optionId: 'o2' })
    })

    it('calls onClose when Cancel is clicked', () => {
        const onClose = vi.fn()
        renderModal({ onClose })
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
        expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when Confirm is clicked', () => {
        const onClose = vi.fn()
        renderModal({ onClose })
        fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
        expect(onClose).toHaveBeenCalled()
    })

    it('resets to "always" when re-opened after changing selection', () => {
        const { rerender } = renderModal({ isOpen: true })
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'q1::o1' } })
        expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('q1::o1')

        rerender(
            <AddItemModal
                isOpen={false}
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                questions={mockQuestions}
            />
        )
        rerender(
            <AddItemModal
                isOpen={true}
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                questions={mockQuestions}
            />
        )
        expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('always')
    })

    it('shows only "Always Needed Items" when questions array is empty', () => {
        renderModal({ questions: [] })
        const options = screen.getAllByRole('option')
        expect(options).toHaveLength(1)
        expect(options[0].textContent).toBe('Always Needed Items')
    })
})
