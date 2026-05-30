import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { useForm } from 'react-hook-form'
import { AlwaysNeededItemsSection } from './always-needed-items-section'
import { PackingListQuestionSet, Person } from './types'

const mockPeople: Person[] = [{ id: '1', name: 'Me' }]

beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

function Wrapper({ defaultValues, triggerScrollToLast }: { defaultValues?: Partial<PackingListQuestionSet>; triggerScrollToLast?: number }) {
    const { control, register, setValue } = useForm<PackingListQuestionSet>({
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
            setValue={setValue}
            people={mockPeople}
            triggerScrollToLast={triggerScrollToLast}
            getAllItemNames={() => []}
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
        expect(screen.getByRole('button', { name: /^add item$/i })).toBeTruthy()
    })

    it('auto-expands when triggerScrollToLast becomes truthy', async () => {
        const { rerender } = render(<Wrapper />)
        expect(screen.queryByRole('button', { name: /^add item$/i })).toBeNull()
        rerender(<Wrapper triggerScrollToLast={1} />)
        await waitFor(() => expect(screen.getByRole('button', { name: /^add item$/i })).toBeTruthy())
    })
})
