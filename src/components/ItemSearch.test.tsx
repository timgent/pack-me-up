import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import { ItemSearchBar, ItemSearchResults } from './ItemSearch'
import type { Item, PackingListQuestionSet, Person, Question } from '../edit-questions/types'

const people: Person[] = [{ id: 'p1', name: 'Alice' }]

function item(text: string, overrides: Partial<Item> = {}): Item {
    return { id: text.toLowerCase(), text, personSelections: [{ personId: 'p1', selected: true }], ...overrides }
}

function question(overrides: Partial<Question> & { id: string; text: string }): Question {
    return { type: 'saved', order: 0, questionType: 'single-choice', options: [], ...overrides } as Question
}

function makeSet(overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet {
    return {
        people,
        alwaysNeededItems: [item('Passport'), item('Sun hat', { category: 'Clothes' })],
        questions: [question({
            id: 'q1', text: 'Beach holiday?', options: [{
                id: 'o1', order: 0, text: 'Yes', items: [
                    item('Bucket and spade'),
                    item('Sun cream', { category: 'Toiletries' }),
                ],
            }],
        })],
        ...overrides,
    }
}

function renderResults(query: string, set = makeSet()) {
    const handlers = {
        onOptionItemChange: vi.fn(),
        onOptionItemDelete: vi.fn(),
        onAlwaysItemChange: vi.fn(),
        onAlwaysItemDelete: vi.fn(),
    }
    const view = render(
        <ItemSearchResults
            questionSet={set}
            query={query}
            people={people}
            allItemNames={['Sun cream', 'Sun hat']}
            sectionNames={['Toiletries', 'Clothes']}
            {...handlers}
        />
    )
    return { ...handlers, rerenderWith: (next: PackingListQuestionSet) => view.rerender(
        <ItemSearchResults
            questionSet={next}
            query={query}
            people={people}
            allItemNames={['Sun cream', 'Sun hat']}
            sectionNames={['Toiletries', 'Clothes']}
            {...handlers}
        />
    ) }
}

describe('ItemSearchResults', () => {
    it('shows each match under the trail that leads to it', () => {
        renderResults('sun')
        const trails = screen.getAllByTestId('search-group-crumbs').map(c => c.textContent)
        expect(trails).toEqual(['Always Needed Items', 'Beach holiday? › Yes'])
        // The section is named inside the card, where a phone can still read it.
        expect(screen.getAllByTestId('search-section-label').map(s => s.textContent))
            .toEqual(['Clothes', 'Toiletries'])
        expect(screen.getAllByTestId('item-row').map(r => r.textContent?.trim())).toEqual(['Sun hat', 'Sun cream'])
    })

    it('marks the part of the name that matched', () => {
        const { container } = render(
            <ItemSearchResults
                questionSet={makeSet()}
                query="cream"
                people={people}
                allItemNames={[]}
                sectionNames={[]}
                onOptionItemChange={vi.fn()}
                onOptionItemDelete={vi.fn()}
                onAlwaysItemChange={vi.fn()}
                onAlwaysItemDelete={vi.fn()}
            />
        )
        expect(container.querySelector('mark')?.textContent).toBe('cream')
    })

    it('counts what it found', () => {
        renderResults('sun')
        expect(screen.getByTestId('item-search-summary').textContent).toContain('2 items')
    })

    it('says so when nothing matches', () => {
        renderResults('kayak')
        expect(screen.getByTestId('item-search-summary').textContent).toMatch(/No items match/i)
        expect(screen.queryByTestId('search-group')).toBeNull()
    })

    it('edits an option item in place, addressing its own list', () => {
        const { onOptionItemChange } = renderResults('cream')
        fireEvent.click(screen.getByTestId('item-row'))
        fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Clothes' } })
        expect(onOptionItemChange).toHaveBeenCalledWith('q1', 'o1', 1,
            expect.objectContaining({ text: 'Sun cream', category: 'Clothes' }))
    })

    it('edits an always-needed item by its position among the undeleted ones', () => {
        const set = makeSet({
            alwaysNeededItems: [
                item('Old passport', { deletedAt: '2024-01-01T00:00:00.000Z' }),
                item('Passport'),
                item('Sun hat', { category: 'Clothes' }),
            ],
        })
        const { onAlwaysItemChange } = renderResults('sun hat', set)
        fireEvent.click(screen.getByTestId('item-row'))
        fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Toiletries' } })
        expect(onAlwaysItemChange).toHaveBeenCalledWith(1, expect.objectContaining({ category: 'Toiletries' }))
    })

    it('closes the editor after a delete, since every index below it has moved', () => {
        const { onOptionItemDelete } = renderResults('cream')
        fireEvent.click(screen.getByTestId('item-row'))
        fireEvent.click(within(screen.getByTestId('item-inline-editor')).getByRole('button', { name: /Delete/ }))
        expect(onOptionItemDelete).toHaveBeenCalledWith('q1', 'o1', 1)
        expect(screen.queryByTestId('item-inline-editor')).toBeNull()
    })

    it('keeps the open editor when the rename it just made stops the item matching', () => {
        const { rerenderWith } = renderResults('cream')
        fireEvent.click(screen.getByTestId('item-row'))
        rerenderWith(makeSet({
            questions: [question({
                id: 'q1', text: 'Beach holiday?', options: [{
                    id: 'o1', order: 0, text: 'Yes', items: [
                        item('Bucket and spade'),
                        { ...item('Sunblock'), id: 'sun cream', category: 'Toiletries' },
                    ],
                }],
            })],
        }))
        expect(screen.getByTestId('item-inline-editor')).toBeTruthy()
        expect(screen.getByTestId('item-search-summary').textContent).toMatch(/No items match/i)
    })
})

describe('ItemSearchBar', () => {
    it('asks for more before it will search', () => {
        render(<ItemSearchBar value="s" onChange={vi.fn()} />)
        expect(screen.getByText(/Keep typing/i)).toBeTruthy()
    })

    it('clears the query', () => {
        const onChange = vi.fn()
        render(<ItemSearchBar value="sun" onChange={onChange} />)
        fireEvent.click(screen.getByRole('button', { name: /clear/i }))
        expect(onChange).toHaveBeenCalledWith('')
    })

    it('clears on Escape, so the page comes back without reaching for the mouse', () => {
        const onChange = vi.fn()
        render(<ItemSearchBar value="sun" onChange={onChange} />)
        fireEvent.keyDown(screen.getByLabelText('Search items'), { key: 'Escape' })
        expect(onChange).toHaveBeenCalledWith('')
    })
})
