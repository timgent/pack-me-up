import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { TemplateUpdatesCard } from './TemplateUpdatesCard'
import { createExampleData, WIZARD_TEMPLATE_VERSION, TEMPLATE_QUESTION_IDS } from '../edit-questions/example-data'
import { PackingListQuestionSet, Person } from '../edit-questions/types'

const adult: Person = { id: 'a1', name: 'Alice', ageRange: 'Adult', gender: 'female' }

function set(templateVersion: number | undefined, mutate?: (s: PackingListQuestionSet) => void): PackingListQuestionSet {
    const s = JSON.parse(JSON.stringify(createExampleData([adult], []))) as PackingListQuestionSet
    s._id = '1'
    if (templateVersion !== undefined) s.templateVersion = templateVersion
    mutate?.(s)
    return s
}

function removeSunscreen(s: PackingListQuestionSet) {
    const hot = s.questions.find(q => q.id === TEMPLATE_QUESTION_IDS.weather)!.options.find(o => o.text === 'Hot')!
    hot.items = hot.items.filter(i => i.text !== 'Sunscreen')
}

describe('TemplateUpdatesCard', () => {
    it('renders nothing when the set is already at the current version', () => {
        const { container } = render(
            <TemplateUpdatesCard questionSet={set(WIZARD_TEMPLATE_VERSION, removeSunscreen)} onApply={vi.fn()} />
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders nothing when there are no new suggestions', () => {
        const { container } = render(
            <TemplateUpdatesCard questionSet={set(0)} onApply={vi.fn()} />
        )
        expect(container.firstChild).toBeNull()
    })

    it('shows how many new suggestions are available', () => {
        render(<TemplateUpdatesCard questionSet={set(0, removeSunscreen)} onApply={vi.fn()} />)
        expect(screen.getByText(/1 new suggestion/i)).toBeTruthy()
    })

    it('applies checked suggestions and stamps the version', async () => {
        const onApply = vi.fn()
        render(<TemplateUpdatesCard questionSet={set(0, removeSunscreen)} onApply={onApply} />)

        fireEvent.click(screen.getByText(/Review/i))
        expect(screen.getByText('Sunscreen')).toBeTruthy()
        fireEvent.click(screen.getByText(/Add selected/i))

        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
        const updated: PackingListQuestionSet = onApply.mock.calls[0][0]
        expect(updated.templateVersion).toBe(WIZARD_TEMPLATE_VERSION)
        const hot = updated.questions.find(q => q.id === TEMPLATE_QUESTION_IDS.weather)!.options.find(o => o.text === 'Hot')!
        expect(hot.items.some(i => i.text === 'Sunscreen')).toBe(true)
    })

    it('excludes unticked suggestions but still stamps the version', async () => {
        const onApply = vi.fn()
        render(<TemplateUpdatesCard questionSet={set(0, removeSunscreen)} onApply={onApply} />)

        fireEvent.click(screen.getByText(/Review/i))
        const checkbox = screen.getByText('Sunscreen').closest('label')!.querySelector('input')!
        fireEvent.click(checkbox) // untick
        fireEvent.click(screen.getByText(/Add selected/i))

        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
        const updated: PackingListQuestionSet = onApply.mock.calls[0][0]
        expect(updated.templateVersion).toBe(WIZARD_TEMPLATE_VERSION)
        const hot = updated.questions.find(q => q.id === TEMPLATE_QUESTION_IDS.weather)!.options.find(o => o.text === 'Hot')!
        expect(hot.items.some(i => i.text === 'Sunscreen')).toBe(false)
    })

    it('dismissing stamps the version without adding anything', async () => {
        const base = set(0, removeSunscreen)
        const onApply = vi.fn()
        render(<TemplateUpdatesCard questionSet={base} onApply={onApply} />)

        fireEvent.click(screen.getByLabelText(/Dismiss/i))
        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
        const updated: PackingListQuestionSet = onApply.mock.calls[0][0]
        expect(updated.templateVersion).toBe(WIZARD_TEMPLATE_VERSION)
        const hot = updated.questions.find(q => q.id === TEMPLATE_QUESTION_IDS.weather)!.options.find(o => o.text === 'Hot')!
        expect(hot.items.some(i => i.text === 'Sunscreen')).toBe(false)
    })
})
