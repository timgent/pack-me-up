import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { AddItemComposer } from './AddItemComposer'
import { buildSuggestionIndex } from '../utils/itemSuggestions'
import type { PackingListItem } from '../create-packing-list/types'

const mk = (over: Partial<PackingListItem>): PackingListItem => ({
    id: Math.random().toString(36).slice(2),
    itemText: 'Item',
    personId: 'p1',
    personName: 'Alice',
    questionId: '',
    optionId: '',
    packed: false,
    ...over,
})

const emptyIndex = buildSuggestionIndex([])

function renderComposer(props: Partial<React.ComponentProps<typeof AddItemComposer>> = {}) {
    const onAdd = vi.fn()
    render(
        <AddItemComposer
            personName="Alice"
            personId="p1"
            suggestions={emptyIndex}
            targetLabel="Alice"
            onAdd={onAdd}
            {...props}
        />
    )
    return { onAdd, input: screen.getByPlaceholderText('Add new item...') as HTMLInputElement }
}

describe('AddItemComposer', () => {
    it('adds the typed item to its target on Enter', () => {
        const { onAdd, input } = renderComposer({ category: 'Toiletries' })
        fireEvent.change(input, { target: { value: 'Sun cream' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).toHaveBeenCalledWith(
            { personName: 'Alice', personId: 'p1', communal: undefined, category: 'Toiletries' },
            'Sun cream',
            undefined,
        )
    })

    it('adds on the Add button too', () => {
        const { onAdd, input } = renderComposer()
        fireEvent.change(input, { target: { value: 'Sun cream' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(onAdd).toHaveBeenCalled()
    })

    it('clears the field afterwards so the next item can be typed straight away', () => {
        const { input } = renderComposer()
        fireEvent.change(input, { target: { value: 'Sun cream' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(input.value).toBe('')
    })

    it('ignores an empty or blank name', () => {
        const { onAdd, input } = renderComposer()
        fireEvent.change(input, { target: { value: '   ' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).not.toHaveBeenCalled()
    })

    it('passes a quantity when one is given', () => {
        const { onAdd, input } = renderComposer()
        fireEvent.change(input, { target: { value: 'Socks' } })
        fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).toHaveBeenCalledWith(expect.anything(), 'Socks', 3)
    })

    it('marks communal items as shared', () => {
        const { onAdd, input } = renderComposer({ personName: '', personId: '', communal: true })
        fireEvent.change(input, { target: { value: 'Tent' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ communal: true, personName: '' }),
            'Tent',
            undefined,
        )
    })
})

describe('AddItemComposer: choosing a section', () => {
    const categoryOptions = ['Toiletries', 'Clothes', 'Other']

    it('has no section picker when the section is already decided', () => {
        const { input } = renderComposer({ category: 'Clothes' })
        fireEvent.change(input, { target: { value: 'Sun cream' } })
        expect(screen.queryByLabelText('Section')).toBeNull()
    })

    it('keeps out of the way until there is an item to file', () => {
        const { input } = renderComposer({ categoryOptions })
        expect(screen.queryByLabelText('Section')).toBeNull()
        expect(screen.queryByLabelText('Quantity')).toBeNull()
        fireEvent.change(input, { target: { value: 'S' } })
        expect(screen.getByLabelText('Section')).toBeTruthy()
        expect(screen.getByLabelText('Quantity')).toBeTruthy()
    })

    it('files the item under the chosen section', () => {
        const { onAdd, input } = renderComposer({ categoryOptions })
        fireEvent.change(input, { target: { value: 'Sun cream' } })
        fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Toiletries' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ category: 'Toiletries' }),
            'Sun cream',
            undefined,
        )
    })

    it('treats the catch-all section as no section at all', () => {
        const { onAdd, input } = renderComposer({ categoryOptions, category: 'Clothes' })
        fireEvent.change(input, { target: { value: 'Odds and ends' } })
        fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Other' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ category: undefined }),
            'Odds and ends',
            undefined,
        )
    })

    it('keeps the chosen section for the next item', () => {
        const { onAdd, input } = renderComposer({ categoryOptions })
        fireEvent.change(input, { target: { value: 'Sun cream' } })
        fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Toiletries' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        fireEvent.change(input, { target: { value: 'Shampoo' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).toHaveBeenLastCalledWith(
            expect.objectContaining({ category: 'Toiletries' }),
            'Shampoo',
            undefined,
        )
    })
})

describe('AddItemComposer: choosing who it is for', () => {
    const peopleOptions = [{ name: 'Alice', id: 'p1' }, { name: 'Bob', id: 'p2' }]

    it('has no person picker when there is only one place it can go', () => {
        const { input } = renderComposer()
        fireEvent.change(input, { target: { value: 'Sun cream' } })
        expect(screen.queryByLabelText('Who for')).toBeNull()
    })

    it('adds the item for the chosen person', () => {
        const { onAdd, input } = renderComposer({ peopleOptions })
        fireEvent.change(input, { target: { value: 'Sun cream' } })
        fireEvent.change(screen.getByLabelText('Who for'), { target: { value: 'Bob' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ personName: 'Bob', personId: 'p2' }),
            'Sun cream',
            undefined,
        )
    })
})

describe('AddItemComposer: suggestions', () => {
    const suggestions = buildSuggestionIndex([
        mk({ itemText: 'Sun cream', personName: 'Bob', category: 'Toiletries' }),
        mk({ itemText: 'Sunhat', personName: 'Bob', category: 'Clothes' }),
    ])

    it('offers matching names once something is typed', () => {
        const { input } = renderComposer({ suggestions })
        expect(screen.queryByRole('listbox')).toBeNull()
        fireEvent.change(input, { target: { value: 'sun' } })
        expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
            'Sun creamToiletries',
            'SunhatClothes',
        ])
    })

    it('fills in the name and its section when one is picked', () => {
        const { onAdd, input } = renderComposer({
            suggestions,
            categoryOptions: ['Toiletries', 'Clothes', 'Other'],
        })
        fireEvent.change(input, { target: { value: 'sunh' } })
        fireEvent.click(screen.getByRole('option', { name: /Sunhat/ }))
        expect(input.value).toBe('Sunhat')
        expect((screen.getByLabelText('Section') as HTMLSelectElement).value).toBe('Clothes')
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ category: 'Clothes' }),
            'Sunhat',
            undefined,
        )
    })

    it('adds a highlighted suggestion on Enter rather than the raw text', () => {
        const { onAdd, input } = renderComposer({ suggestions })
        fireEvent.change(input, { target: { value: 'sunh' } })
        fireEvent.keyDown(input, { key: 'ArrowDown' })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(input.value).toBe('Sunhat')
        expect(onAdd).not.toHaveBeenCalled()
    })

    it('writes a question-named section the way the card heading does', () => {
        // The badge names the section the suggestion would land in, and the
        // card it lands on is headed without the question mark — see
        // `sectionHeading`. The stored category is untouched, so the item
        // still joins the section it names.
        const questionSuggestions = buildSuggestionIndex([
            mk({ itemText: 'Pyjamas', personName: 'Bob', category: 'Will you be staying overnight?' }),
        ])
        const { onAdd, input } = renderComposer({
            suggestions: questionSuggestions,
            categoryOptions: ['Will you be staying overnight?', 'Other'],
        })
        fireEvent.change(input, { target: { value: 'pyj' } })

        expect(screen.getByRole('option', { name: /Pyjamas/ }).textContent)
            .toBe('PyjamasWill you be staying overnight')

        fireEvent.click(screen.getByRole('option', { name: /Pyjamas/ }))
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ category: 'Will you be staying overnight?' }),
            'Pyjamas',
            undefined,
        )
    })

    it('closes the suggestions on Escape without closing the composer', () => {
        const onClose = vi.fn()
        const { input } = renderComposer({ suggestions, onClose })
        fireEvent.change(input, { target: { value: 'sun' } })
        fireEvent.keyDown(input, { key: 'Escape' })
        expect(screen.queryByRole('listbox')).toBeNull()
        expect(onClose).not.toHaveBeenCalled()
    })
})

describe('AddItemComposer: opened in place', () => {
    it('closes on Escape when there is nothing to dismiss first', () => {
        const onClose = vi.fn()
        const { input } = renderComposer({ onClose })
        fireEvent.keyDown(input, { key: 'Escape' })
        expect(onClose).toHaveBeenCalled()
    })

    it('closes when focus leaves an empty composer', () => {
        const onClose = vi.fn()
        renderComposer({ onClose })
        fireEvent.blur(screen.getByTestId('add-item-composer'))
        expect(onClose).toHaveBeenCalled()
    })

    it('stays open when focus leaves a half-typed item', () => {
        const onClose = vi.fn()
        const { input } = renderComposer({ onClose })
        fireEvent.change(input, { target: { value: 'Sun cr' } })
        fireEvent.blur(screen.getByTestId('add-item-composer'))
        expect(onClose).not.toHaveBeenCalled()
    })
})
