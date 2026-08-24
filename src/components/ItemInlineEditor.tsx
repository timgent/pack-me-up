/**
 * Editing panel for a single item, opened in place inside an otherwise
 * read-only list.
 *
 * The lists on the questions page are read-only on purpose — mounting an editor
 * for every item is what made large question sets slow on phones. This panel is
 * the exception that keeps that true: exactly one is mounted at a time, in the
 * row the user tapped, so changing one item never costs more than editing one
 * item.
 *
 * It is deliberately *controlled*, with no draft of its own. Every change goes
 * straight to the caller and on to storage, so an item being edited here is the
 * same item a pod sync five seconds later will update — a long-lived local draft
 * would either swallow that update or clobber it on close.
 */
import { memo, useCallback } from 'react'
import { CustomCreatableSelect } from './CreatableSelect'
import { PersonToggles, QuantityPanel } from './ItemEditorControls'
import type { Item, Person } from '../edit-questions/types'

const FIELD_LABEL = 'block text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1'

export const ItemInlineEditor = memo(function ItemInlineEditor({ item, people, allItemNames, sectionNames, sectionDefaultLabel, onChange, onDelete, onClose }: {
    item: Item
    people: Person[]
    allItemNames: string[]
    /** Section names already in use, offered so one section isn't spelled two ways. */
    sectionNames: string[]
    /** What the packing list calls items here that carry no category of their own. */
    sectionDefaultLabel: string
    onChange: (edited: Item) => void
    /**
     * Omit to leave the item undeletable. Closing afterwards is the caller's
     * job, not this panel's: it is the caller that knows the list has just lost
     * a row and that every index after this one has shifted up.
     */
    onDelete?: () => void
    onClose: () => void
}) {
    const setText = useCallback((text: string) => onChange({ ...item, text }), [item, onChange])

    const togglePerson = useCallback((personIdx: number) => {
        // Rebuilt against the current people rather than patched in place: an
        // item saved before someone joined the trip has a shorter array, and
        // writing straight to an index would leave a hole.
        const selections = people.map((person, i) => ({
            personId: person.id,
            selected: item.personSelections?.[i]?.selected ?? false,
        }))
        selections[personIdx] = { ...selections[personIdx], selected: !selections[personIdx].selected }
        onChange({ ...item, personSelections: selections })
    }, [item, people, onChange])

    const toggleCommunal = useCallback(
        () => onChange({ ...item, communal: item.communal ? undefined : true }),
        [item, onChange])

    const setPerNight = useCallback((perNight: number | undefined) => onChange({ ...item, perNight }), [item, onChange])
    const setPerNights = useCallback((perNights: number | undefined) => onChange({ ...item, perNights }), [item, onChange])
    const setMaxQuantity = useCallback((maxQuantity: number | undefined) => onChange({ ...item, maxQuantity }), [item, onChange])

    // The default section is offered by name, so "back to the main pile" is a
    // choice rather than the absence of one. Storing it clears the category —
    // see the note on applySectionLayout for why the default is never stamped.
    // The item's own section is included even if it is not among the offered
    // names, so an unrecognised one is never silently swapped for another.
    const sectionOptions = [...new Set([
        sectionDefaultLabel,
        ...(item.category ? [item.category] : []),
        ...sectionNames,
    ])]
    const setSection = useCallback((value: string) => {
        const category = value === '' || value === sectionDefaultLabel ? undefined : value
        onChange({ ...item, category })
    }, [item, sectionDefaultLabel, onChange])

    return (
        <div
            data-testid="item-inline-editor"
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            className="mt-1 mb-2 rounded-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-900 p-3 space-y-3 shadow-sm"
        >
            <div data-testid="item-name-field">
                <span className={FIELD_LABEL}>Item</span>
                <CustomCreatableSelect
                    value={item.text}
                    onChange={setText}
                    options={allItemNames}
                    placeholder="Item name"
                    menuPortalTarget={document.body}
                />
            </div>

            <div>
                <span className={FIELD_LABEL}>Who it’s for</span>
                <PersonToggles
                    item={item}
                    people={people}
                    layout="tiles"
                    onTogglePerson={togglePerson}
                    onToggleCommunal={toggleCommunal}
                />
                {item.communal && people.length > 1 && (
                    <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">
                        Packed once for the group — included when a highlighted person is going
                    </p>
                )}
            </div>

            <div>
                <span className={FIELD_LABEL}>How many</span>
                <QuantityPanel
                    item={item}
                    onPerNight={setPerNight}
                    onPerNights={setPerNights}
                    onMaxQuantity={setMaxQuantity}
                />
            </div>

            <div data-testid="item-section-field">
                <span className={FIELD_LABEL}>Section</span>
                {/* A choice among sections that exist, never a place to make a
                    new one. Free text here used to create a section, which is
                    the same gesture that renames one in the organise view — so
                    the identical action meant "move this item" in one place and
                    "rename this whole section" in the other. Creating is its own
                    button now, at the foot of the list. */}
                <select
                    aria-label="Section"
                    value={item.category ?? sectionDefaultLabel}
                    onChange={e => setSection(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                    {sectionOptions.map(label => (
                        <option key={label} value={label}>{label}</option>
                    ))}
                </select>
            </div>

            {/* Delete sits opposite Done, at the far end of the panel: it is the
                one action here that cannot be undone by typing something else,
                so it stays well away from the button people reach for to leave. */}
            <div className="flex items-center justify-between">
                {onDelete ? (
                    <button
                        type="button"
                        onClick={onDelete}
                        aria-label={item.text ? `Delete ${item.text}` : 'Delete item'}
                        className="px-2 py-1.5 text-sm font-medium text-gray-400 dark:text-gray-500 rounded-lg hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                        Delete
                    </button>
                ) : <span />}
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-1.5 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/40 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40"
                >
                    Done
                </button>
            </div>
        </div>
    )
})
