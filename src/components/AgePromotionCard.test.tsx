import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { AgePromotionCard } from './AgePromotionCard'
import { PackingListQuestionSet, Person, Item } from '../edit-questions/types'

const TODAY = new Date('2026-07-18T12:00:00Z')

const mum: Person = { id: 'mum', name: 'Mum', ageRange: 'Adult', gender: 'female' }
// Turned 3 in June 2026, still stored as Toddler
const kid: Person = { id: 'kid', name: 'Neve', ageRange: 'Toddler', dateOfBirth: '2023-06-01' }

function makeItem(text: string, overrides: Partial<Item> = {}): Item {
    return {
        text,
        personSelections: [
            { personId: 'mum', selected: true },
            { personId: 'kid', selected: false },
        ],
        ...overrides,
    }
}

function makeQuestionSet(people: Person[] = [mum, kid], items: Item[] = []): PackingListQuestionSet {
    return { _id: '1', people, questions: [], alwaysNeededItems: items }
}

describe('AgePromotionCard', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('renders nothing when nobody has crossed a bracket', () => {
        const qs = makeQuestionSet([mum, { ...kid, ageRange: 'Child' }])
        const { container } = render(<AgePromotionCard questionSet={qs} onApply={vi.fn()} today={TODAY} />)
        expect(container.firstChild).toBeNull()
    })

    it('shows a banner naming the person and their new bracket', () => {
        render(<AgePromotionCard questionSet={makeQuestionSet()} onApply={vi.fn()} today={TODAY} />)
        expect(screen.getByText(/Neve is now a child/i)).toBeTruthy()
    })

    it('uses "an adult" phrasing for the Adult bracket', () => {
        const almostAdult: Person = { id: 'kid2', name: 'Sam', ageRange: 'Teenager', dateOfBirth: '2008-01-01' }
        render(<AgePromotionCard questionSet={makeQuestionSet([mum, almostAdult])} onApply={vi.fn()} today={TODAY} />)
        expect(screen.getByText(/Sam is now an adult!/)).toBeTruthy()
    })

    it('applies checked suggestions and acknowledges the new bracket', async () => {
        const potty = makeItem('Travel potty', {
            ageRanges: ['Toddler'],
            personSelections: [
                { personId: 'mum', selected: false },
                { personId: 'kid', selected: true },
            ],
        })
        const onApply = vi.fn()
        render(<AgePromotionCard questionSet={makeQuestionSet([mum, kid], [potty])} onApply={onApply} today={TODAY} />)

        fireEvent.click(screen.getByText('Review changes'))
        expect(screen.getByText('Travel potty')).toBeTruthy()

        fireEvent.click(screen.getByText('Apply updates'))
        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))

        const updated: PackingListQuestionSet = onApply.mock.calls[0][0]
        expect(updated.people.find(p => p.id === 'kid')!.ageRange).toBe('Child')
        expect(
            updated.alwaysNeededItems.find(i => i.text === 'Travel potty')!
                .personSelections.find(ps => ps.personId === 'kid')!.selected
        ).toBe(false)
    })

    it('leaves unticked suggestions alone', async () => {
        const potty = makeItem('Travel potty', {
            ageRanges: ['Toddler'],
            personSelections: [
                { personId: 'mum', selected: false },
                { personId: 'kid', selected: true },
            ],
        })
        const onApply = vi.fn()
        render(<AgePromotionCard questionSet={makeQuestionSet([mum, kid], [potty])} onApply={onApply} today={TODAY} />)

        fireEvent.click(screen.getByText('Review changes'))
        const pottyCheckbox = screen.getByText('Travel potty').closest('label')!.querySelector('input')!
        fireEvent.click(pottyCheckbox)
        fireEvent.click(screen.getByText('Apply updates'))
        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))

        const updated: PackingListQuestionSet = onApply.mock.calls[0][0]
        expect(updated.people.find(p => p.id === 'kid')!.ageRange).toBe('Child')
        expect(
            updated.alwaysNeededItems.find(i => i.text === 'Travel potty')!
                .personSelections.find(ps => ps.personId === 'kid')!.selected
        ).toBe(true)
    })

    it('dismissing hides the banner and remembers the person + bracket', () => {
        render(<AgePromotionCard questionSet={makeQuestionSet()} onApply={vi.fn()} today={TODAY} />)
        fireEvent.click(screen.getByLabelText('Dismiss age update'))
        expect(screen.queryByText(/Neve is now/i)).toBeNull()
        expect(localStorage.getItem('age-promotion-dismissed:kid')).toBe('Child')
    })

    it('a dismissed transition stays hidden on re-render but a later bracket shows again', () => {
        localStorage.setItem('age-promotion-dismissed:kid', 'Child')
        const { rerender, container } = render(
            <AgePromotionCard questionSet={makeQuestionSet()} onApply={vi.fn()} today={TODAY} />
        )
        expect(container.firstChild).toBeNull()

        // Years later the same kid becomes a teenager — prompt again
        rerender(
            <AgePromotionCard
                questionSet={makeQuestionSet()}
                onApply={vi.fn()}
                today={new Date('2036-07-18T12:00:00Z')}
            />
        )
        expect(screen.getByText(/Neve is now a teenager/i)).toBeTruthy()
    })
})
