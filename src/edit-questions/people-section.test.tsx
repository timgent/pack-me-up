import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { Control, UseFormRegister } from 'react-hook-form'
import { PeopleSection } from './people-section'
import { PackingListQuestionSet, Person } from './types'

const mockRegister = vi.fn().mockReturnValue({
    name: 'people.0.name',
    ref: vi.fn(),
    onChange: vi.fn(),
    onBlur: vi.fn(),
}) as unknown as UseFormRegister<PackingListQuestionSet>

const mockPeople: Person[] = [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
]

function renderPeopleSection(fields: Person[] = mockPeople) {
    return render(
        <PeopleSection
            control={null as unknown as Control<PackingListQuestionSet>}
            register={mockRegister}
            fields={fields}
            append={vi.fn()}
            remove={vi.fn()}
        />
    )
}

describe('PeopleSection', () => {
    it('starts collapsed by default', () => {
        renderPeopleSection()
        expect(screen.queryByPlaceholderText('Enter person name')).toBeNull()
    })

    it('shows person count in header', () => {
        renderPeopleSection(mockPeople)
        expect(screen.getByText(/2 people/i)).toBeTruthy()
    })

    it('shows singular "person" when there is 1 person', () => {
        renderPeopleSection([{ id: '1', name: 'Me' }])
        expect(screen.getByText(/1 person/i)).toBeTruthy()
    })

    it('expands and shows person inputs when header is clicked', () => {
        renderPeopleSection()
        const header = screen.getByRole('button', { name: /people/i })
        fireEvent.click(header)
        expect(screen.getAllByPlaceholderText('Enter person name').length).toBeGreaterThan(0)
    })

    it('shows a subtitle describing the section purpose', () => {
        renderPeopleSection()
        expect(screen.getByText(/who you are packing for/i)).toBeTruthy()
    })
})
