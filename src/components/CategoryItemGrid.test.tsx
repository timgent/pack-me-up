/**
 * The grid's layout rules, which a round of manual testing caught twice.
 *
 * Both faults were invisible to every other test: the chips still worked, the
 * right rows still showed, and the only thing wrong was where things sat. These
 * pin the arrangement itself.
 */
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { CategoryItemGrid } from './CategoryItemGrid'
import { buildCategoryRows, buildGridColumns } from '../utils/categoryItemGrid'
import { SHARED_FILTER_KEY } from '../utils/peopleFilter'
import { PERSON_COLORS } from '../edit-questions/person-colors'
import type { PackingListItem } from '../create-packing-list/types'

function item(over: Partial<PackingListItem> & { id: string; itemText: string }): PackingListItem {
    return { personId: '', personName: '', questionId: 'q1', optionId: 'o1', packed: false, ...over }
}

const people = [{ name: 'Alice', id: 'p1' }, { name: 'Bob', id: 'p2' }]
const items = [
    item({ id: 'a1', itemText: 'Sunhat', personName: 'Alice', personId: 'p1' }),
    item({ id: 'b1', itemText: 'Sunhat', personName: 'Bob', personId: 'p2' }),
    item({ id: 's1', itemText: 'Tent', communal: true }),
]
const columns = buildGridColumns(people, items)
const rows = buildCategoryRows(items, columns)

function renderGrid(visibleColumnKeys?: ReadonlySet<string>) {
    return render(
        <CategoryItemGrid
            columns={columns}
            visibleColumnKeys={visibleColumnKeys}
            rows={rows}
            personColor={() => PERSON_COLORS[0]}
            packedById={{}}
            hidePacked={false}
            flourish={null}
            onToggleItem={vi.fn()}
            registerCellRef={vi.fn()}
            onOpenRow={vi.fn()}
        />
    )
}

/** The chip block and the name span of the row carrying `label`. */
function partsOf(label: string) {
    const row = screen.getByRole('button', { name: `Edit ${label}` }).closest('[data-testid="grid-row"]')!
    const chips = within(row as HTMLElement).getByRole('group', { name: label })
    return { row: row as HTMLElement, chips, name: chips.parentElement!.querySelector('span')! }
}

describe('where the chips sit', () => {
    it('keeps the columns to the right of the name when the whole list is showing', () => {
        renderGrid()

        const { chips } = partsOf('Sunhat')
        expect(chips.className).not.toContain('order-first')
        // A fixed width is what holds a person in the same place down the card
        expect(chips.style.width).not.toBe('')
    })

    it('keeps them there for two people, where lining them up is still the point', () => {
        renderGrid(new Set(['Alice', 'Bob']))

        const { chips } = partsOf('Sunhat')
        expect(chips.className).not.toContain('order-first')
    })

    it('keeps them there for one person too — a row reads the same way round everywhere', () => {
        renderGrid(new Set(['Alice']))

        const { chips } = partsOf('Sunhat')
        expect(chips.className).not.toContain('order-first')
    })

    it('puts the name before the chip in the reading order', () => {
        renderGrid(new Set(['Alice']))

        const { row } = partsOf('Sunhat')
        const focusable = [...row.querySelectorAll('button, input')]
        expect(focusable[0]!.getAttribute('aria-label')).toBe('Edit Sunhat')
    })

    it('reads a shared row the same way round as the rows above it', () => {
        // One card that flips halfway down is worse than either order — and
        // the shared rows are rendered separately, so they can drift.
        renderGrid(new Set(['Alice']))
        fireEvent.click(screen.getByRole('button', { name: /Shared \(1\)/ }))

        expect(partsOf('Tent').chips.className).not.toContain('order-first')
        expect(partsOf('Sunhat').chips.className).not.toContain('order-first')
    })

    it('leaves a shared row alongside the rest when the columns are showing', () => {
        renderGrid()

        expect(partsOf('Tent').chips.className).not.toContain('order-first')
        expect(partsOf('Sunhat').chips.className).not.toContain('order-first')
    })
})

describe('what the filter leaves on the page', () => {
    it('drops a row nobody in the filter needs', () => {
        renderGrid(new Set(['Bob']))

        expect(screen.getByRole('checkbox', { name: 'Sunhat for Bob' })).toBeTruthy()
        expect(screen.queryByRole('checkbox', { name: 'Sunhat for Alice' })).toBeNull()
    })

    it('folds shared items away when the filter is people, and leaves them inline without one', () => {
        const { unmount } = renderGrid()
        expect(screen.getByRole('checkbox', { name: 'Tent for the whole group' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Shared \(1\)/ })).toBeNull()
        unmount()

        renderGrid(new Set(['Alice']))
        expect(screen.getByRole('button', { name: /Shared \(1\)/ })).toBeTruthy()
    })

    it('brings shared items back among the rest when the group is what was asked for', () => {
        renderGrid(new Set(['Alice', SHARED_FILTER_KEY]))

        expect(screen.getByRole('checkbox', { name: 'Tent for the whole group' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Shared \(1\)/ })).toBeNull()
    })

    it('shows the group alone when the group alone is selected', () => {
        renderGrid(new Set([SHARED_FILTER_KEY]))

        expect(screen.getByRole('checkbox', { name: 'Tent for the whole group' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Edit Sunhat' })).toBeNull()
    })
})
