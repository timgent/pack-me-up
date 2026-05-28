import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { AddItemModal } from './add-item-modal'
import { Question, Person } from './types'

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

const mockPeople: Person[] = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
]

function renderModal(props: Partial<Parameters<typeof AddItemModal>[0]> = {}) {
    const defaults = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        questions: mockQuestions,
        people: mockPeople,
        existingItemNames: ['Passport', 'Sunscreen'],
    }
    return render(<AddItemModal {...defaults} {...props} />)
}

describe('AddItemModal — destination step', () => {
    it('does not render when isOpen is false', () => {
        renderModal({ isOpen: false })
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('renders destination step first', () => {
        renderModal()
        expect(screen.getByText(/where/i)).toBeTruthy()
    })

    it('renders "Always Needed Items" as a destination button', () => {
        renderModal()
        expect(screen.getByRole('button', { name: 'Always Needed Items' })).toBeTruthy()
    })

    it('renders question/option pairs as destination buttons', () => {
        renderModal()
        expect(screen.getByRole('button', { name: /Car/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Plane/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Hot/ })).toBeTruthy()
    })

    it('shows only "Always Needed Items" when questions array is empty', () => {
        renderModal({ questions: [] })
        expect(screen.getByRole('button', { name: 'Always Needed Items' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Car|Plane|Hot/ })).toBeNull()
    })
})

describe('AddItemModal — details step', () => {
    it('advances to details step when a destination is clicked', () => {
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: 'Always Needed Items' }))
        // header now shows destination label, destination list is gone
        expect(screen.getByRole('button', { name: /^add item$/i })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /plane/i })).toBeNull()
    })

    it('shows person pills in details step', () => {
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: 'Always Needed Items' }))
        expect(screen.getByRole('button', { name: /alice/i })).toBeTruthy()
        expect(screen.getByRole('button', { name: /bob/i })).toBeTruthy()
    })

    it('back chevron returns to destination step', () => {
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: 'Always Needed Items' }))
        fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
        expect(screen.getByRole('button', { name: 'Always Needed Items' })).toBeTruthy()
    })

    it('calls onClose when Close is clicked', () => {
        const onClose = vi.fn()
        renderModal({ onClose })
        fireEvent.click(screen.getByRole('button', { name: /close/i }))
        expect(onClose).toHaveBeenCalled()
    })

    it('shows people error when Add Item is clicked with no person selected', () => {
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: 'Always Needed Items' }))
        fireEvent.click(screen.getByRole('button', { name: /^add item$/i }))
        expect(screen.getByText(/please select at least one person/i)).toBeTruthy()
    })

    it('shows text error when Add Item is clicked with no text entered', () => {
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: 'Always Needed Items' }))
        fireEvent.click(screen.getByRole('button', { name: /^add item$/i }))
        expect(screen.getByText(/please enter an item name/i)).toBeTruthy()
    })

    it('clears people error once a person is selected', () => {
        renderModal()
        fireEvent.click(screen.getByRole('button', { name: 'Always Needed Items' }))
        fireEvent.click(screen.getByRole('button', { name: /^add item$/i }))
        expect(screen.getByText(/please select at least one person/i)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /alice/i }))
        expect(screen.queryByText(/please select at least one person/i)).toBeNull()
    })

    it('does not show people error when people array is empty', () => {
        renderModal({ people: [] })
        fireEvent.click(screen.getByRole('button', { name: 'Always Needed Items' }))
        fireEvent.click(screen.getByRole('button', { name: /^add item$/i }))
        expect(screen.queryByText(/please select at least one person/i)).toBeNull()
    })
})
