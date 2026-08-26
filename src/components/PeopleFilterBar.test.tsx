/**
 * The strip drops the names on a phone, so the ways of getting them back are
 * the part worth pinning.
 */
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PeopleFilterBar } from './PeopleFilterBar'
import { buildGridColumns } from '../utils/categoryItemGrid'
import { SHARED_FILTER_KEY } from '../utils/peopleFilter'
import { PERSON_COLORS } from '../edit-questions/person-colors'

const columns = buildGridColumns([{ name: 'Alice', id: 'p1' }, { name: 'Amy', id: 'p2' }], [])
const totals = new Map([['Alice', { packed: 1, total: 2 }], ['Amy', { packed: 2, total: 2 }]])

function renderBar(selected: ReadonlySet<string> = new Set(), onToggle = vi.fn()) {
    render(
        <PeopleFilterBar
            columns={columns}
            selected={selected}
            totals={totals}
            personIdentity={() => ({ color: PERSON_COLORS[0] })}
            onToggle={onToggle}
            controlsId="sections"
        />
    )
    return onToggle
}

const chip = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })

describe('getting a name back off a face', () => {
    it('gives a pointer the full name to hover', () => {
        renderBar()

        expect(chip('Alice').getAttribute('title')).toBe('Alice')
    })

    it('gives a finger the name on a long press, and does not also pick them', () => {
        vi.useFakeTimers()
        const onToggle = renderBar()

        fireEvent.touchStart(chip('Amy'))
        act(() => { vi.advanceTimersByTime(500) })
        expect(screen.getByTestId('chip-name-reveal').textContent).toBe('Amy')

        // The press asked who it was; it did not choose them
        fireEvent.touchEnd(chip('Amy'))
        fireEvent.click(chip('Amy'))
        expect(onToggle).not.toHaveBeenCalled()

        vi.useRealTimers()
    })

    it('picks the person on an ordinary tap', () => {
        vi.useFakeTimers()
        const onToggle = renderBar()

        fireEvent.touchStart(chip('Amy'))
        act(() => { vi.advanceTimersByTime(100) })
        fireEvent.touchEnd(chip('Amy'))
        fireEvent.click(chip('Amy'))

        expect(onToggle).toHaveBeenCalledWith('Amy')
        vi.useRealTimers()
    })

    it('lets go of the name again', () => {
        vi.useFakeTimers()
        renderBar()

        fireEvent.touchStart(chip('Alice'))
        act(() => { vi.advanceTimersByTime(500) })
        expect(screen.getByTestId('chip-name-reveal')).toBeTruthy()

        act(() => { vi.advanceTimersByTime(2000) })
        expect(screen.queryByTestId('chip-name-reveal')).toBeNull()

        vi.useRealTimers()
    })
})

describe('fitting the group in', () => {
    it('wraps rather than scrolling, so a chip past the edge is never a person the strip hides', () => {
        renderBar()

        const group = screen.getByRole('group', { name: 'Filter by person' })
        expect(group.className).toContain('flex-wrap')
        expect(group.className).not.toContain('overflow-x-auto')
    })
})

describe('what a chip says without being asked', () => {
    it('tells two people who share a first letter apart', () => {
        renderBar()

        expect(chip('Alice').textContent).toContain('Al')
        expect(chip('Amy').textContent).toContain('Am')
    })

    it('marks somebody finished without filling the chip, which means pressed', () => {
        renderBar(new Set(['Alice']))

        // Amy is done but not selected: no fill
        expect(chip('Amy').className).toContain('bg-white')
        expect(chip('Amy').className).not.toContain('bg-emerald')
        // Alice is selected: filled
        expect(chip('Alice').className).toContain('bg-blue-600')
    })

    it('offers the group its own chip when the list has shared items', () => {
        render(
            <PeopleFilterBar
                columns={columns}
                selected={new Set([SHARED_FILTER_KEY])}
                totals={totals}
                personIdentity={() => ({ color: PERSON_COLORS[0] })}
                onToggle={vi.fn()}
                sharedStat={{ packed: 0, total: 3 }}
                controlsId="sections"
            />
        )

        expect(screen.getByRole('button', { name: /^Shared/ }).getAttribute('aria-pressed')).toBe('true')
    })
})

describe('adding somebody to the strip', () => {
    function renderWithAdd(
        onAddGuest = vi.fn(),
        people: { name: string; id: string }[] = [{ name: 'Alice', id: 'p1' }, { name: 'Amy', id: 'p2' }],
    ) {
        render(
            <PeopleFilterBar
                columns={buildGridColumns(people, [])}
                selected={new Set()}
                totals={totals}
                personIdentity={() => ({ color: PERSON_COLORS[0] })}
                onToggle={vi.fn()}
                onAddGuest={onAddGuest}
                controlsId="sections"
            />
        )
        return onAddGuest
    }

    const addChip = () => screen.getByRole('button', { name: /add guest/i })

    it('offers the plus where the people already are, not in the page header', () => {
        renderWithAdd()

        // Inside the group the chips live in: "add another one of these" is a
        // sentence about the strip, and it should be read off the strip.
        const group = screen.getByRole('group', { name: 'Filter by person' })
        expect(group.contains(addChip())).toBe(true)
    })

    it('leaves the strip alone on a list nobody can be added to', () => {
        render(
            <PeopleFilterBar
                columns={columns}
                selected={new Set()}
                totals={totals}
                personIdentity={() => ({ color: PERSON_COLORS[0] })}
                onToggle={vi.fn()}
                controlsId="sections"
            />
        )

        expect(screen.queryByRole('button', { name: /add guest/i })).toBeNull()
    })

    it('opens the name field next to the plus that opened it', () => {
        renderWithAdd()
        fireEvent.click(addChip())

        const field = screen.getByPlaceholderText(/guest name/i)
        expect(field).toBeTruthy()
        expect(document.activeElement).toBe(field)
    })

    it('hands the trimmed name back and closes', async () => {
        const onAddGuest = renderWithAdd()
        fireEvent.click(addChip())

        fireEvent.change(screen.getByPlaceholderText(/guest name/i), { target: { value: '  Dan  ' } })
        fireEvent.click(screen.getByRole('button', { name: /^Add guest$/i }))

        expect(onAddGuest).toHaveBeenCalledWith('Dan')
        expect(screen.queryByPlaceholderText(/guest name/i)).toBeNull()
    })

    it('takes Enter as the submit, because a name is one field', () => {
        const onAddGuest = renderWithAdd()
        fireEvent.click(addChip())

        const field = screen.getByPlaceholderText(/guest name/i)
        fireEvent.change(field, { target: { value: 'Dan' } })
        fireEvent.keyDown(field, { key: 'Enter' })

        expect(onAddGuest).toHaveBeenCalledWith('Dan')
    })

    it('asks for nobody when the name is blank', () => {
        const onAddGuest = renderWithAdd()
        fireEvent.click(addChip())

        fireEvent.change(screen.getByPlaceholderText(/guest name/i), { target: { value: '   ' } })
        fireEvent.click(screen.getByRole('button', { name: /^Add guest$/i }))

        expect(onAddGuest).not.toHaveBeenCalled()
    })

    it('backs out on Escape without adding anybody', () => {
        const onAddGuest = renderWithAdd()
        fireEvent.click(addChip())

        const field = screen.getByPlaceholderText(/guest name/i)
        fireEvent.change(field, { target: { value: 'Dan' } })
        fireEvent.keyDown(field, { key: 'Escape' })

        expect(onAddGuest).not.toHaveBeenCalled()
        expect(screen.queryByPlaceholderText(/guest name/i)).toBeNull()
    })

    /*
     * The strip used to hide itself when there was nobody to choose between,
     * which is right for a filter and wrong for the only way of adding the
     * second person. It stays, minus the choice.
     */
    it('still shows the plus on a list with only one person', () => {
        renderWithAdd(vi.fn(), [{ name: 'Alice', id: 'p1' }])

        expect(addChip()).toBeTruthy()
    })

    it('names that one person without offering a filter that filters nothing', () => {
        renderWithAdd(vi.fn(), [{ name: 'Alice', id: 'p1' }])

        expect(screen.getByTestId('sole-person').textContent).toContain('Alice')
        expect(screen.queryByRole('button', { name: /^Alice/ })).toBeNull()
    })
})
