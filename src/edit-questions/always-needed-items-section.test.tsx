import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { useForm } from 'react-hook-form'
import { AlwaysNeededItemsSection } from './always-needed-items-section'
import { PackingListQuestionSet, Person } from './types'

const mockPeople: Person[] = [{ id: '1', name: 'Me' }]

function Wrapper({ defaultValues, triggerAddItem }: { defaultValues?: Partial<PackingListQuestionSet>; triggerAddItem?: number }) {
    const { control, register, watch, setValue } = useForm<PackingListQuestionSet>({
        defaultValues: {
            questions: [],
            people: mockPeople,
            alwaysNeededItems: [],
            ...defaultValues,
        },
    })
    return (
        <AlwaysNeededItemsSection
            control={control}
            register={register}
            watch={watch}
            setValue={setValue}
            people={mockPeople}
            triggerAddItem={triggerAddItem}
        />
    )
}

describe('AlwaysNeededItemsSection', () => {
    it('starts collapsed by default', () => {
        render(<Wrapper />)
        expect(screen.queryByText('Add Item')).toBeNull()
    })

    it('shows item count in header when there are items', () => {
        render(<Wrapper defaultValues={{ alwaysNeededItems: [{ text: 'Passport', personSelections: [] }, { text: 'Wallet', personSelections: [] }] }} />)
        expect(screen.getByText(/2 items/i)).toBeTruthy()
    })

    it('shows "0 items" count in header when empty', () => {
        render(<Wrapper />)
        expect(screen.getByText(/0 items/i)).toBeTruthy()
    })

    it('expands and shows "Add Item" button when header is clicked', () => {
        render(<Wrapper />)
        const header = screen.getByRole('button', { name: /always needed items/i })
        fireEvent.click(header)
        expect(screen.getByText('Add Item')).toBeTruthy()
    })

    it('expands and appends an item when triggerAddItem increments from 0 to 1', () => {
        const { rerender } = render(<Wrapper triggerAddItem={0} />)
        // Collapsed — no Add Item button visible
        expect(screen.queryByRole('button', { name: /^add item$/i })).toBeNull()

        rerender(<Wrapper triggerAddItem={1} />)

        // Should expand and show the Add Item button
        expect(screen.getByRole('button', { name: /^add item$/i })).toBeTruthy()
    })
})
