import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'
import { ActiveSelect } from './CreatableSelect'

describe('ActiveSelect', () => {
    it('shows the existing value as editable text so the user can edit in place', () => {
        const { container } = render(
            <ActiveSelect
                value="Entertainment (books/small toys)"
                onChange={vi.fn()}
                options={['Entertainment (books/small toys)', 'Playing cards/Travel games']}
            />
        )

        const input = container.querySelector('input') as HTMLInputElement
        expect(input.value).toBe('Entertainment (books/small toys)')
    })

    it('starts blank when there is no existing value', () => {
        const { container } = render(
            <ActiveSelect value="" onChange={vi.fn()} options={[]} />
        )

        const input = container.querySelector('input') as HTMLInputElement
        expect(input.value).toBe('')
    })

    it('commits an in-place edit of the existing text on blur', () => {
        const onChange = vi.fn()
        const { container } = render(
            <ActiveSelect value="Entertainment" onChange={onChange} options={[]} />
        )

        const input = container.querySelector('input') as HTMLInputElement
        // Simulate inserting text mid-string rather than clearing and retyping.
        fireEvent.change(input, { target: { value: 'Entertainment & Travel games' } })
        fireEvent.blur(input)

        expect(onChange).toHaveBeenCalledWith('Entertainment & Travel games')
    })
})
