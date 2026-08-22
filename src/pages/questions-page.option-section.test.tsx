import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import React from 'react'
import { OptionSection } from './questions-page'
import { DEFAULT_SECTION_ACCENT, sectionAccent } from '../edit-questions/section-accent'
import type { Item, Option, Person } from '../edit-questions/types'
import { buildIndexOf } from '../utils/itemSuggestions'

vi.mock('../components/DatabaseContext', () => ({ useDatabase: vi.fn() }))
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: vi.fn() }))
vi.mock('../components/ForeignPodContext', () => ({ useForeignPod: vi.fn() }))

const people: Person[] = [{ id: 'p1', name: 'Alice' }]
const twoPeople: Person[] = [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }]

function makeOption(overrides: Partial<Option> = {}): Option {
    return { id: 'o1', order: 0, text: 'Yes', items: [], ...overrides }
}

function renderOption(option: Option, sectionDefaultLabel = 'Yes') {
    return render(
        <OptionSection
            option={option}
            people={people}
            sectionDefaultLabel={sectionDefaultLabel}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
        />
    )
}

/** The same section, with inline item editing switched on. */
function renderEditable(option: Option, sectionNames: string[] = []) {
    const onItemChange = vi.fn()
    render(
        <OptionSection
            option={option}
            people={twoPeople}
            sectionDefaultLabel="Yes"
            allItemNames={['Socks', 'Towel']}
            sectionNames={sectionNames}
            questionId="q1"
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            onItemChange={onItemChange}
        />
    )
    fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
    return { onItemChange }
}

function makeItem(text: string, overrides: Partial<Item> = {}): Item {
    return { text, personSelections: [{ personId: 'p1', selected: true }], ...overrides }
}

describe('OptionSection with no items', () => {
    it('shows an inline "No items" hint', () => {
        renderOption(makeOption())
        expect(screen.getByText('No items')).toBeTruthy()
    })

    it('is not expandable — no toggle button and no chevron', () => {
        const { container } = renderOption(makeOption())
        expect(screen.queryByRole('button', { name: /Yes/ })).toBeNull()
        expect(container.querySelector('[data-testid="option-expand-chevron"]')).toBeNull()
    })

    it('still offers edit and delete', () => {
        renderOption(makeOption())
        expect(screen.getByTitle('Edit option')).toBeTruthy()
        expect(screen.getByTitle('Delete option')).toBeTruthy()
    })
})

describe('OptionSection with items', () => {
    const withItems = () => makeOption({ items: [{ text: 'Toothbrush' }, { text: 'Towel' }] })

    it('shows the item count rather than the "No items" hint', () => {
        renderOption(withItems())
        expect(screen.getByText('2 items')).toBeTruthy()
        expect(screen.queryByText('No items')).toBeNull()
    })

    it('expands to reveal the items when clicked', () => {
        renderOption(withItems())
        const toggle = screen.getByRole('button', { name: /Yes/ })
        expect(screen.queryByText('Toothbrush')).toBeNull()
        fireEvent.click(toggle)
        expect(screen.getByText('Toothbrush')).toBeTruthy()
        expect(screen.getByText('Towel')).toBeTruthy()
    })

    it('shows no section headings when the items are all in the default section', () => {
        renderOption(withItems())
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        // 'Yes' appears as the option's own heading; it must not also appear as
        // a section heading when the list isn't actually split.
        expect(screen.queryByTestId('item-section-heading')).toBeNull()
    })

    it('wraps nothing in a section card when the list is not split', () => {
        // A single-section list has no grouping to show, so the cards would be
        // decoration around the whole thing.
        renderOption(withItems())
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        expect(screen.queryByTestId('item-section')).toBeNull()
    })
})

describe('OptionSection with sectioned items', () => {
    const sectioned = () => makeOption({
        items: [
            { text: 'Toothbrush', personSelections: [], category: 'Toiletries' },
            { text: 'Pyjamas', personSelections: [], category: 'Sleep' },
            { text: 'Socks', personSelections: [] },
        ],
    })

    it('groups the items under their section headings', () => {
        renderOption(sectioned())
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        const headings = screen.getAllByTestId('item-section-heading').map(h => h.textContent)
        // The default section leads, named as the generated list will name it.
        expect(headings).toEqual(['Yes', 'Toiletries', 'Sleep'])
    })

    it('names the default section after the question for single-choice questions', () => {
        renderOption(sectioned(), 'Staying overnight?')
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        expect(screen.getAllByTestId('item-section-heading')[0].textContent).toBe('Staying overnight?')
    })

    it('puts each section in its own card, with its items inside it', () => {
        // A heading with a hairline beside it left every item looking like it
        // belonged to the same undifferentiated list; the card is what makes
        // "these three items are the Toiletries" visible without reading.
        renderOption(sectioned())
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        const cards = screen.getAllByTestId('item-section')
        expect(cards).toHaveLength(3)
        expect(within(cards[1]).getByTestId('item-section-heading').textContent).toBe('Toiletries')
        expect(within(cards[1]).getByText('Toothbrush')).toBeTruthy()
        expect(within(cards[1]).queryByText('Socks')).toBeNull()
    })

    it('counts the items in each section', () => {
        renderOption(makeOption({
            items: [
                { text: 'Socks', personSelections: [] },
                { text: 'Toothbrush', personSelections: [], category: 'Toiletries' },
                { text: 'Toothpaste', personSelections: [], category: 'Toiletries' },
            ],
        }))
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        const counts = screen.getAllByTestId('item-section-count').map(c => c.textContent)
        expect(counts).toEqual(['1 item', '2 items'])
    })

    it('colours named sections and leaves the default one neutral', () => {
        // Colour is the cue that carries across options: the same section name
        // looks the same wherever it appears, and the main pile stays quiet.
        renderOption(sectioned())
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        const cards = screen.getAllByTestId('item-section')
        expect(cards[0].className).toContain(DEFAULT_SECTION_ACCENT.border)
        expect(cards[1].className).toContain(sectionAccent('Toiletries', false).border)
        expect(cards[2].className).toContain(sectionAccent('Sleep', false).border)
    })
})

describe('OptionSection inline item editing', () => {
    const withItems = () => makeOption({ items: [makeItem('Socks'), makeItem('Towel')] })

    it('leaves rows unclickable when no change handler is given', () => {
        // The read-only list is still the default: a section rendered without a
        // handler must not offer an editor it cannot save.
        renderOption(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        expect(screen.queryByTitle('Edit Socks')).toBeNull()
    })

    it('marks every row with an edit icon, since a bare row reads as read-only', () => {
        renderEditable(withItems())
        expect(screen.getAllByTestId('item-edit-icon')).toHaveLength(2)
    })

    it('keeps the icon decorative — the whole row stays the only target', () => {
        // A nested button would carve a second hit area out of the row and make
        // the real one harder to hit.
        renderEditable(withItems())
        const row = screen.getAllByTestId('item-row')[0]
        expect(within(row).queryByRole('button')).toBeNull()
        expect(within(row).getByTestId('item-edit-icon').getAttribute('aria-hidden')).toBe('true')
    })

    it('shows no edit icon on a read-only list', () => {
        renderOption(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        expect(screen.queryByTestId('item-edit-icon')).toBeNull()
    })

    it('opens the editor for the row that was tapped', () => {
        renderEditable(withItems())
        expect(screen.queryByTestId('item-inline-editor')).toBeNull()
        fireEvent.click(screen.getByTitle('Edit Socks'))
        const editor = screen.getByTestId('item-inline-editor')
        expect(within(editor).getByTestId('item-name-field').textContent).toContain('Socks')
    })

    it('keeps only one editor open at a time', () => {
        renderEditable(withItems())
        fireEvent.click(screen.getByTitle('Edit Socks'))
        fireEvent.click(screen.getByTitle('Edit Towel'))
        expect(screen.getAllByTestId('item-inline-editor')).toHaveLength(1)
        expect(screen.getByTestId('item-name-field').textContent).toContain('Towel')
    })

    it('closes when the same row is tapped again', () => {
        renderEditable(withItems())
        fireEvent.click(screen.getByTitle('Edit Socks'))
        fireEvent.click(screen.getByTitle('Edit Socks'))
        expect(screen.queryByTestId('item-inline-editor')).toBeNull()
    })

    it('closes on Done', () => {
        renderEditable(withItems())
        fireEvent.click(screen.getByTitle('Edit Socks'))
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(screen.queryByTestId('item-inline-editor')).toBeNull()
    })

    it('reports an edit against the option and question it belongs to', () => {
        const { onItemChange } = renderEditable(withItems())
        fireEvent.click(screen.getByTitle('Edit Towel'))
        // Scoped to the editor: the read-only rows carry the same person titles.
        fireEvent.click(within(screen.getByTestId('item-inline-editor')).getByTitle('Bob'))
        expect(onItemChange).toHaveBeenCalledWith('q1', 'o1', 1, expect.objectContaining({
            text: 'Towel',
            personSelections: [
                { personId: 'p1', selected: true },
                { personId: 'p2', selected: true },
            ],
        }))
    })

    it('addresses the item by its array index, not its position on screen', () => {
        // Sections group by category, so the third row down is the second item
        // in the array. Addressing the row by what the eye sees would edit the
        // wrong item.
        const { onItemChange } = renderEditable(makeOption({
            items: [
                makeItem('Socks'),
                makeItem('Toothbrush', { category: 'Toiletries' }),
                makeItem('Hat'),
            ],
        }))
        fireEvent.click(screen.getByTitle('Edit Toothbrush'))
        fireEvent.click(screen.getByLabelText(/Toggle shared/))
        expect(onItemChange).toHaveBeenCalledWith('q1', 'o1', 1, expect.objectContaining({
            text: 'Toothbrush',
            communal: true,
        }))
    })

    it('closes the editor when the edit moves the item to another section', () => {
        // The move shifts every index after it, so the open row no longer names
        // the item being edited — and the row has visibly gone somewhere else.
        const { onItemChange } = renderEditable(withItems(), ['Toiletries'])
        fireEvent.click(screen.getByTitle('Edit Socks'))
        fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Toiletries' } })
        expect(onItemChange).toHaveBeenCalledWith('q1', 'o1', 0, expect.objectContaining({
            category: 'Toiletries',
        }))
        expect(screen.queryByTestId('item-inline-editor')).toBeNull()
    })

    it('stays open for an edit that leaves the item where it is', () => {
        renderEditable(withItems())
        fireEvent.click(screen.getByTitle('Edit Socks'))
        fireEvent.click(within(screen.getByTestId('item-inline-editor')).getByTitle('Bob'))
        expect(screen.getByTestId('item-inline-editor')).toBeTruthy()
    })
})

describe('OptionSection adding items', () => {
    const suggestions = buildIndexOf([
        { text: 'Toothpaste', category: 'Toiletries', owner: 'q1:o2' },
        { text: 'Socks', owner: 'q1:o1' },
    ])

    /** The same section with adding switched on, expanded. */
    function renderAddable(option: Option, sectionNames: string[] = []) {
        const onItemAdd = vi.fn()
        render(
            <OptionSection
                option={option}
                people={twoPeople}
                sectionDefaultLabel="Yes"
                allItemNames={[]}
                sectionNames={sectionNames}
                questionId="q1"
                suggestions={suggestions}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onItemChange={vi.fn()}
                onItemAdd={onItemAdd}
            />
        )
        const toggle = screen.queryByRole('button', { name: /Yes/ })
        if (toggle) fireEvent.click(toggle)
        return { onItemAdd }
    }

    const sectioned = () => makeOption({
        items: [
            makeItem('Socks'),
            makeItem('Toothbrush', { category: 'Toiletries' }),
            makeItem('Pyjamas', { category: 'Sleep' }),
        ],
    })

    it('puts an add button on every section heading', () => {
        renderAddable(sectioned())
        expect(screen.getAllByTestId('add-to-section')).toHaveLength(3)
        expect(screen.getByLabelText('Add an item to Toiletries')).toBeTruthy()
    })

    it('offers no add buttons on a read-only list', () => {
        renderOption(sectioned())
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        expect(screen.queryByTestId('add-to-section')).toBeNull()
        expect(screen.queryByRole('button', { name: '+ Add item' })).toBeNull()
    })

    it('files an item under the section whose button was tapped', () => {
        // The whole point: the item lands where it was typed, with no second
        // trip through the row editor to move it there.
        const { onItemAdd } = renderAddable(sectioned())
        fireEvent.click(screen.getByLabelText('Add an item to Toiletries'))
        const input = screen.getByRole('combobox')
        fireEvent.change(input, { target: { value: 'Razor' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onItemAdd).toHaveBeenCalledWith('q1', 'o1', 'Razor', 'Toiletries')
    })

    it('stores no section for an item added to the default one', () => {
        const { onItemAdd } = renderAddable(sectioned())
        fireEvent.click(screen.getByLabelText('Add an item to Yes'))
        const input = screen.getByRole('combobox')
        fireEvent.change(input, { target: { value: 'Hat' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onItemAdd).toHaveBeenCalledWith('q1', 'o1', 'Hat', undefined)
    })

    it('opens the composer inside the section it belongs to', () => {
        renderAddable(sectioned())
        fireEvent.click(screen.getByLabelText('Add an item to Toiletries'))
        const cards = screen.getAllByTestId('item-section')
        expect(within(cards[1]).getByTestId('add-question-item')).toBeTruthy()
        expect(within(cards[0]).queryByTestId('add-question-item')).toBeNull()
    })

    it('keeps only one composer open at a time', () => {
        // One per heading would put an input in front of every section — the
        // cost the read-only rows exist to avoid.
        renderAddable(sectioned())
        fireEvent.click(screen.getByLabelText('Add an item to Toiletries'))
        fireEvent.click(screen.getByLabelText('Add an item to Sleep'))
        expect(screen.getAllByTestId('add-question-item')).toHaveLength(1)
    })

    it('closes when the same heading is tapped again', () => {
        renderAddable(sectioned())
        fireEvent.click(screen.getByLabelText('Add an item to Toiletries'))
        fireEvent.click(screen.getByLabelText('Add an item to Toiletries'))
        expect(screen.queryByTestId('add-question-item')).toBeNull()
    })

    it('stays open after an add, so items go in in runs', () => {
        const { onItemAdd } = renderAddable(sectioned())
        fireEvent.click(screen.getByLabelText('Add an item to Toiletries'))
        const input = screen.getByRole('combobox')
        fireEvent.change(input, { target: { value: 'Razor' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        fireEvent.change(input, { target: { value: 'Shampoo' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onItemAdd).toHaveBeenLastCalledWith('q1', 'o1', 'Shampoo', 'Toiletries')
    })

    it('has no section picker on a composer opened from a heading', () => {
        // The heading already answered that question.
        renderAddable(sectioned())
        fireEvent.click(screen.getByLabelText('Add an item to Toiletries'))
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Razor' } })
        expect(screen.queryByLabelText('Section')).toBeNull()
    })
})

describe('OptionSection adding from the foot of the list', () => {
    const suggestions = buildIndexOf([{ text: 'Toothpaste', category: 'Toiletries', owner: 'q1:o2' }])

    function renderAddable(option: Option, sectionNames: string[] = []) {
        const onItemAdd = vi.fn()
        render(
            <OptionSection
                option={option}
                people={twoPeople}
                sectionDefaultLabel="Yes"
                sectionNames={sectionNames}
                questionId="q1"
                suggestions={suggestions}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onItemAdd={onItemAdd}
            />
        )
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        return { onItemAdd }
    }

    it('offers an add row under an unsectioned list, which has no headings', () => {
        const { onItemAdd } = renderAddable(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add item' }))
        const input = screen.getByRole('combobox')
        fireEvent.change(input, { target: { value: 'Hat' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onItemAdd).toHaveBeenCalledWith('q1', 'o1', 'Hat', undefined)
    })

    it('asks which section, offering the list’s own and the set’s others', () => {
        renderAddable(
            makeOption({ items: [makeItem('Toothbrush', { category: 'Toiletries' })] }),
            ['Clothes'],
        )
        fireEvent.click(screen.getByRole('button', { name: '+ Add item' }))
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'H' } })
        const options = [...(screen.getByLabelText('Section') as HTMLSelectElement).options].map(o => o.value)
        expect(options).toEqual(['Yes', 'Toiletries', 'Clothes'])
    })

    it('files an item into a section this answer has never used', () => {
        // A section is only ever a name stamped on an item, so an answer can be
        // given its first Toiletries item without anything being created first.
        const { onItemAdd } = renderAddable(makeOption({ items: [makeItem('Socks')] }), ['Toiletries'])
        fireEvent.click(screen.getByRole('button', { name: '+ Add item' }))
        const input = screen.getByRole('combobox')
        fireEvent.change(input, { target: { value: 'Razor' } })
        fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Toiletries' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onItemAdd).toHaveBeenCalledWith('q1', 'o1', 'Razor', 'Toiletries')
    })

    it('replaces the add row with the composer rather than showing both', () => {
        renderAddable(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add item' }))
        expect(screen.queryByRole('button', { name: '+ Add item' })).toBeNull()
    })

    it('offers a name used elsewhere in the set, with the section it is filed under', () => {
        renderAddable(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add item' }))
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tooth' } })
        fireEvent.click(screen.getByRole('option', { name: /Toothpaste/ }))
        expect((screen.getByLabelText('Section') as HTMLSelectElement).value).toBe('Toiletries')
    })
})

describe('OptionSection with no items, once items can be added', () => {
    function renderEmpty() {
        const onItemAdd = vi.fn()
        render(
            <OptionSection
                option={makeOption()}
                people={people}
                sectionDefaultLabel="Yes"
                questionId="q1"
                suggestions={buildIndexOf([])}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onItemAdd={onItemAdd}
            />
        )
        return { onItemAdd }
    }

    it('becomes expandable, since it no longer opens onto nothing', () => {
        renderEmpty()
        expect(screen.getByTestId('option-expand-chevron')).toBeTruthy()
    })

    it('still says it has no items', () => {
        renderEmpty()
        expect(screen.getByText('No items')).toBeTruthy()
    })

    it('takes the first item, which it had no way to accept before', () => {
        const { onItemAdd } = renderEmpty()
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add item' }))
        const input = screen.getByRole('combobox')
        fireEvent.change(input, { target: { value: 'Socks' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onItemAdd).toHaveBeenCalledWith('q1', 'o1', 'Socks', undefined)
    })
})

describe('OptionSection: deleting an item', () => {
    const withItems = () => makeOption({ items: [makeItem('Socks'), makeItem('Towel')] })

    /** The section with inline editing *and* deleting switched on. */
    function renderDeletable(option: Option) {
        const onItemDelete = vi.fn()
        render(
            <OptionSection
                option={option}
                people={twoPeople}
                sectionDefaultLabel="Yes"
                allItemNames={['Socks', 'Towel']}
                questionId="q1"
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onItemChange={vi.fn()}
                onItemDelete={onItemDelete}
            />
        )
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        return { onItemDelete }
    }

    it('offers no delete when the page supplies no handler', () => {
        renderEditable(withItems())
        fireEvent.click(screen.getByTitle('Edit Socks'))
        // Scoped to the editor: the option's own "Delete option" button is a
        // different thing entirely and is always there.
        const editor = screen.getByTestId('item-inline-editor')
        expect(within(editor).queryByRole('button', { name: /^Delete/ })).toBeNull()
    })

    it('deletes the row the editor was opened on', () => {
        const { onItemDelete } = renderDeletable(withItems())
        fireEvent.click(screen.getByTitle('Edit Towel'))
        fireEvent.click(screen.getByRole('button', { name: 'Delete Towel' }))
        expect(onItemDelete).toHaveBeenCalledWith('q1', 'o1', 1)
    })

    it('closes the editor, whose row has gone and whose index now means another', () => {
        renderDeletable(withItems())
        fireEvent.click(screen.getByTitle('Edit Socks'))
        fireEvent.click(screen.getByRole('button', { name: 'Delete Socks' }))
        expect(screen.queryByTestId('item-inline-editor')).toBeNull()
    })
})

describe('OptionSection: a section with nothing in it yet', () => {
    function renderWithEmptySection(option: Option) {
        render(
            <OptionSection
                option={option}
                people={people}
                sectionDefaultLabel="Yes"
                questionId="q1"
                suggestions={buildIndexOf([])}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onItemChange={vi.fn()}
                onItemAdd={vi.fn()}
            />
        )
    }

    it('can be opened even though the option has no items', () => {
        renderWithEmptySection(makeOption({ items: [], emptySections: ['Toiletries'] }))
        expect(screen.getByTestId('option-expand-chevron')).toBeTruthy()
    })

    it('draws the section, so a section you just made is actually there', () => {
        renderWithEmptySection(makeOption({ items: [], emptySections: ['Toiletries'] }))
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        expect(screen.getByText('Toiletries')).toBeTruthy()
    })

    it('says it is empty rather than drawing a blank card', () => {
        renderWithEmptySection(makeOption({ items: [], emptySections: ['Toiletries'] }))
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        expect(screen.getByText(/Nothing here yet/)).toBeTruthy()
    })

    it('carries its own ＋, so the first item goes straight into it', () => {
        renderWithEmptySection(makeOption({ items: [], emptySections: ['Toiletries'] }))
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        expect(screen.getByRole('button', { name: 'Add an item to Toiletries' })).toBeTruthy()
    })
})

describe('OptionSection: creating a section', () => {
    function renderAddable(option: Option, onSectionAdd = vi.fn()) {
        render(
            <OptionSection
                option={option}
                people={people}
                sectionDefaultLabel="Yes"
                sectionNames={['Toiletries']}
                questionId="q1"
                suggestions={buildIndexOf([])}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onItemChange={vi.fn()}
                onItemAdd={vi.fn()}
                onSectionAdd={onSectionAdd}
            />
        )
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        return { onSectionAdd }
    }

    it('offers no "+ Add section" when the page supplies no handler', () => {
        renderEditable(makeOption({ items: [makeItem('Socks')] }))
        expect(screen.queryByRole('button', { name: '+ Add section' })).toBeNull()
    })

    it('names the new section and creates it', () => {
        const { onSectionAdd } = renderAddable(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add section' }))
        fireEvent.change(screen.getByLabelText('New section name'), { target: { value: 'Beach kit' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(onSectionAdd).toHaveBeenCalledWith('q1', 'o1', 'Beach kit')
    })

    it('creates on Enter, so naming several in a row needs no mouse', () => {
        const { onSectionAdd } = renderAddable(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add section' }))
        const input = screen.getByLabelText('New section name')
        fireEvent.change(input, { target: { value: 'Beach kit' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onSectionAdd).toHaveBeenCalledWith('q1', 'o1', 'Beach kit')
    })

    it('creates nothing on an empty name', () => {
        const { onSectionAdd } = renderAddable(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add section' }))
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(onSectionAdd).not.toHaveBeenCalled()
        expect(screen.queryByTestId('add-section')).toBeNull()
    })

    it('abandons the name on Escape', () => {
        const { onSectionAdd } = renderAddable(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add section' }))
        fireEvent.keyDown(screen.getByLabelText('New section name'), { key: 'Escape' })
        expect(screen.queryByTestId('add-section')).toBeNull()
        expect(onSectionAdd).not.toHaveBeenCalled()
    })

    it('suggests names already used elsewhere, so one section is not spelled two ways', () => {
        renderAddable(makeOption({ items: [makeItem('Socks')] }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add section' }))
        const listId = screen.getByLabelText('New section name').getAttribute('list')
        const options = [...document.querySelectorAll(`#${CSS.escape(listId!)} option`)].map(o => o.getAttribute('value'))
        expect(options).toContain('Toiletries')
    })
})

describe('OptionSection: deleting a section', () => {
    function renderRemovable(option: Option, onSectionRemove: ReturnType<typeof vi.fn> = vi.fn()) {
        render(
            <OptionSection
                option={option}
                people={people}
                sectionDefaultLabel="Yes"
                questionId="q1"
                suggestions={buildIndexOf([])}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onItemChange={vi.fn()}
                onItemAdd={vi.fn()}
                onSectionRemove={onSectionRemove}
            />
        )
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        return { onSectionRemove }
    }

    const withSection = () => makeOption({
        items: [makeItem('Socks'), makeItem('Soap', { category: 'Toiletries' })],
    })

    it('carries a bin on every section heading it can remove', () => {
        renderRemovable(withSection())
        expect(screen.getByRole('button', { name: 'Delete section Toiletries' })).toBeTruthy()
    })

    it('offers no bin on the default section, which cannot be removed', () => {
        renderRemovable(withSection())
        expect(screen.queryByRole('button', { name: 'Delete section Yes' })).toBeNull()
    })

    it('offers no bin at all when the page supplies no handler', () => {
        renderEditable(makeOption({ items: [makeItem('Soap', { category: 'Toiletries' })] }))
        expect(screen.queryByRole('button', { name: 'Delete section Toiletries' })).toBeNull()
    })

    it('removes an empty section on the spot — there is nothing to lose', () => {
        const { onSectionRemove } = renderRemovable(
            makeOption({ items: [makeItem('Socks')], emptySections: ['Toiletries'] }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete section Toiletries' }))
        expect(onSectionRemove).toHaveBeenCalledWith('q1', 'o1', 'Toiletries')
        expect(screen.queryByRole('heading', { name: 'Delete “Toiletries”?' })).toBeNull()
    })

    it('asks first when the section holds items, and says where they go', () => {
        const { onSectionRemove } = renderRemovable(withSection())
        fireEvent.click(screen.getByRole('button', { name: 'Delete section Toiletries' }))
        expect(onSectionRemove).not.toHaveBeenCalled()
        expect(screen.getByRole('heading', { name: 'Delete “Toiletries”?' })).toBeTruthy()
        expect(screen.getByText(/Its 1 item will move to “Yes” — nothing is deleted/)).toBeTruthy()
    })

    it('removes the section once confirmed', () => {
        const { onSectionRemove } = renderRemovable(withSection())
        fireEvent.click(screen.getByRole('button', { name: 'Delete section Toiletries' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete section' }))
        expect(onSectionRemove).toHaveBeenCalledWith('q1', 'o1', 'Toiletries')
    })

    it('keeps the section when the confirmation is cancelled', () => {
        const { onSectionRemove } = renderRemovable(withSection())
        fireEvent.click(screen.getByRole('button', { name: 'Delete section Toiletries' }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(onSectionRemove).not.toHaveBeenCalled()
        expect(screen.queryByRole('heading', { name: 'Delete “Toiletries”?' })).toBeNull()
    })
})

describe('OptionSection: organising', () => {
    const withItems = () => makeOption({ items: [makeItem('Socks'), makeItem('Towel')] })

    function renderOrganisable(option: Option, onReorder = vi.fn()) {
        const view = render(
            <OptionSection
                option={option}
                people={people}
                sectionDefaultLabel="Yes"
                questionId="q1"
                suggestions={buildIndexOf([])}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onItemChange={vi.fn()}
                onItemAdd={vi.fn()}
                onReorder={onReorder}
            />
        )
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        return { onReorder, unmount: view.unmount }
    }

    it('offers organising without opening anything', () => {
        renderOrganisable(withItems())
        expect(screen.getByRole('button', { name: 'Organise items' })).toBeTruthy()
    })

    it('offers nothing to organise with a single item', () => {
        renderOrganisable(makeOption({ items: [makeItem('Socks')] }))
        expect(screen.queryByRole('button', { name: 'Organise items' })).toBeNull()
    })

    it('offers no organising when the page cannot save the result', () => {
        renderEditable(withItems())
        expect(screen.queryByRole('button', { name: 'Organise items' })).toBeNull()
    })

    it('opens onto the whole screen, which is what the drag needs', () => {
        // Tried nested in the page first: a scroll area inside a scroll area,
        // with neither in charge of the gesture.
        renderOrganisable(withItems())
        fireEvent.click(screen.getByRole('button', { name: 'Organise items' }))
        const dialog = screen.getByRole('dialog', { name: 'Organise Yes items' })
        expect(within(dialog).getAllByRole('button', { name: /^Drag / })).toHaveLength(2)
    })

    it('closes back to the list', () => {
        renderOrganisable(withItems())
        fireEvent.click(screen.getByRole('button', { name: 'Organise items' }))
        fireEvent.click(screen.getByRole('button', { name: 'Finish organising' }))
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.getAllByTestId('item-row')).toHaveLength(2)
    })

    it('closes on Escape', () => {
        renderOrganisable(withItems())
        fireEvent.click(screen.getByRole('button', { name: 'Organise items' }))
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    function moveTowelToTop() {
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Move Towel' }), { button: 0 })
        fireEvent.click(within(screen.getByRole('menu')).getByText('Move to top of section'))
    }

    it('shows the move at once, without waiting for it to be written', () => {
        const { onReorder } = renderOrganisable(withItems())
        fireEvent.click(screen.getByRole('button', { name: 'Organise items' }))
        moveTowelToTop()
        // On screen immediately...
        const rows = [...document.querySelectorAll('[data-reorder-row]')]
        expect(rows.map(r => r.textContent)).toEqual([
            expect.stringContaining('Towel'),
            expect.stringContaining('Socks'),
        ])
        // ...and not yet written, so a run of drags costs one save, not one each.
        expect(onReorder).not.toHaveBeenCalled()
    })

    it('writes the move once the dragging stops', async () => {
        vi.useFakeTimers()
        try {
            const { onReorder } = renderOrganisable(withItems())
            fireEvent.click(screen.getByRole('button', { name: 'Organise items' }))
            moveTowelToTop()
            await act(async () => { vi.advanceTimersByTime(1000) })
            expect(onReorder).toHaveBeenCalledWith('q1', 'o1', [
                expect.objectContaining({ text: 'Towel' }),
                expect.objectContaining({ text: 'Socks' }),
            ], undefined)
        } finally {
            vi.useRealTimers()
        }
    })

    it('writes what is still in hand when the dialog is closed', () => {
        const { onReorder } = renderOrganisable(withItems())
        fireEvent.click(screen.getByRole('button', { name: 'Organise items' }))
        moveTowelToTop()
        fireEvent.click(screen.getByRole('button', { name: 'Finish organising' }))
        expect(onReorder).toHaveBeenCalledWith('q1', 'o1', [
            expect.objectContaining({ text: 'Towel' }),
            expect.objectContaining({ text: 'Socks' }),
        ], undefined)
    })

    it('writes what is still in hand when the list goes away underneath it', () => {
        const { onReorder, unmount } = renderOrganisable(withItems())
        fireEvent.click(screen.getByRole('button', { name: 'Organise items' }))
        moveTowelToTop()
        unmount()
        expect(onReorder).toHaveBeenCalledTimes(1)
    })

    it('collapses a run of moves into a single write', async () => {
        vi.useFakeTimers()
        try {
            const { onReorder } = renderOrganisable(withItems())
            fireEvent.click(screen.getByRole('button', { name: 'Organise items' }))
            moveTowelToTop()
            fireEvent.pointerDown(screen.getByRole('button', { name: 'Move Socks' }), { button: 0 })
            fireEvent.click(within(screen.getByRole('menu')).getByText('Move to top of section'))
            await act(async () => { vi.advanceTimersByTime(1000) })
            expect(onReorder).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })
})
