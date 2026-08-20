/**
 * The one way items get added to a packing list.
 *
 * Three things made adding an item harder than it should be, and this component
 * exists to fix all three:
 *
 *  - *Where it lands.* A typed item used to fall into "Other" whatever card you
 *    typed it into, so adding to a particular section was impossible. Here the
 *    section is either fixed by where the composer was opened (a section's own
 *    ＋ button) or picked from a dropdown, and it is stamped onto the item.
 *  - *How much typing.* The list is its own dictionary — see `itemSuggestions` —
 *    so a match carries its section across and the quantity is set here rather
 *    than in a second trip through the item editor.
 *  - *What it costs to type.* The draft lives in this component. The page used
 *    to hold every add-input's text in one page-level object, so a keystroke in
 *    any of them re-rendered every card and every row of the list. Memoised and
 *    self-contained, a keystroke now re-renders one composer.
 *
 * Adding keeps the composer open, focused and cleared, with the section and
 * person still selected, because people add items in runs rather than one at a
 * time.
 */
import { memo, useRef, useState } from 'react'
import { ItemNameField, FIELD } from './ItemNameField'
import { ownerKeyFor, type ItemSuggestion, type SuggestionIndex } from '../utils/itemSuggestions'

/** What the packing list calls the section for items with no category. */
export const UNCATEGORISED_LABEL = 'Other'

export interface AddItemTarget {
    personName: string
    personId: string
    communal?: boolean
    /** undefined = the catch-all section */
    category?: string
    /** Packed on the way out of the door, so it belongs in the last minute card. */
    lastMinute?: boolean
}

export interface PersonOption {
    name: string
    id: string
    /** An option standing for the whole group rather than a person. */
    communal?: boolean
}

interface AddItemComposerProps {
    /** Who the item is for, unless `peopleOptions` offers a choice. */
    personName: string
    personId: string
    communal?: boolean
    /** Section the item lands in, and the initial value of the section picker. */
    category?: string
    /** Set on the last minute card's composers: what they add is last minute too. */
    lastMinute?: boolean
    /** Providing these turns on the section picker. */
    categoryOptions?: readonly string[]
    /** Providing these turns on the person picker. */
    peopleOptions?: readonly PersonOption[]
    suggestions: SuggestionIndex
    /** Names the composer for screen readers, e.g. "Alice" or "Toiletries for Alice". */
    targetLabel: string
    onAdd: (target: AddItemTarget, text: string, quantity?: number) => void
    /** Set on composers opened in place, which dismiss on Escape or empty blur. */
    onClose?: () => void
    autoFocus?: boolean
    placeholder?: string
}

export const AddItemComposer = memo(function AddItemComposer({
    personName,
    personId,
    communal,
    category,
    lastMinute,
    categoryOptions,
    peopleOptions,
    suggestions,
    targetLabel,
    onAdd,
    onClose,
    autoFocus,
    placeholder = 'Add new item...',
}: AddItemComposerProps) {
    const [text, setText] = useState('')
    const [quantity, setQuantity] = useState('')
    const [chosenCategory, setChosenCategory] = useState(category ?? UNCATEGORISED_LABEL)
    // Held by name, not id: custom items carry no person id, so a name is the
    // only thing that identifies a person on every list.
    const [chosenPersonName, setChosenPersonName] = useState(personName)
    const inputRef = useRef<HTMLInputElement>(null)

    const person: PersonOption = peopleOptions?.find(p => p.name === chosenPersonName)
        ?? peopleOptions?.[0]
        ?? { name: personName, id: personId }

    // Either the composer belongs to a shared card, or the picker was pointed at
    // the whole group — the item is the group's, and nobody's, both ways round.
    const isCommunal = communal || person.communal === true

    const target: AddItemTarget = {
        personName: isCommunal ? '' : person.name,
        personId: isCommunal ? '' : person.id,
        communal: isCommunal ? true : communal,
        category: categoryOptions
            ? (chosenCategory === UNCATEGORISED_LABEL ? undefined : chosenCategory)
            : category,
        ...(lastMinute ? { lastMinute: true } : {}),
    }

    const ownerKey = ownerKeyFor(target)

    const applySuggestion = (suggestion: ItemSuggestion) => {
        // A suggestion knows where it belongs; taking its section is the whole
        // point of offering it. Only meaningful when a section can be chosen —
        // an in-place composer already has one.
        if (categoryOptions && suggestion.category && categoryOptions.includes(suggestion.category)) {
            setChosenCategory(suggestion.category)
        }
    }

    const submit = () => {
        const trimmed = text.trim()
        if (!trimmed) return
        const parsed = parseInt(quantity, 10)
        onAdd(target, trimmed, Number.isFinite(parsed) && parsed > 1 ? parsed : undefined)
        setText('')
        setQuantity('')
        inputRef.current?.focus()
    }

    // An in-place composer that has been left empty has served its purpose; one
    // with half an item in it has not, and must not take the draft with it.
    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        if (e.currentTarget.contains(e.relatedTarget)) return
        if (!text.trim()) onClose?.()
    }

    const listboxId = `add-item-suggestions-${personId || 'shared'}-${category ?? 'any'}`

    // At rest a composer is a single field, exactly as light as the plain input
    // it replaces — there is one on every card, and a card is mostly items. The
    // quantity and the pickers earn their space only once there is an item to
    // apply them to, which is also the first moment they can be answered.
    const expanded = text.trim().length > 0

    return (
        <div
            data-testid="add-item-composer"
            onBlur={handleBlur}
            className="flex flex-wrap items-center gap-2"
        >
            {/* At rest the name shares its line with Add, so a card carries no
                more furniture than the plain input it replaces. Once the
                quantity and pickers are in play the name takes the line to
                itself and they wrap underneath — three fields abreast is
                unusable on a phone, and it is where the suggestions drop. */}
            <div className={`min-w-[8rem] ${expanded ? 'basis-full' : 'flex-1 basis-40'}`}>
                <ItemNameField
                    value={text}
                    onChange={setText}
                    suggestions={suggestions}
                    ownerKey={ownerKey}
                    onPick={applySuggestion}
                    onSubmit={submit}
                    onClose={onClose}
                    label={`Add an item to ${targetLabel}`}
                    listboxId={listboxId}
                    inputRef={inputRef}
                    autoFocus={autoFocus}
                    placeholder={placeholder}
                />
            </div>

            {expanded && <input
                type="number"
                min={1}
                inputMode="numeric"
                aria-label="Quantity"
                title="How many to pack (leave blank for one)"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
                placeholder="Qty"
                className={`w-16 shrink-0 ${FIELD}`}
            />}

            {expanded && categoryOptions && (
                <select
                    aria-label="Section"
                    value={chosenCategory}
                    onChange={e => setChosenCategory(e.target.value)}
                    className={`min-w-0 flex-1 sm:flex-none sm:max-w-[11rem] ${FIELD}`}
                >
                    {categoryOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                    ))}
                </select>
            )}

            {expanded && peopleOptions && peopleOptions.length > 0 && (
                <select
                    aria-label="Who for"
                    value={person.name}
                    onChange={e => setChosenPersonName(e.target.value)}
                    className={`min-w-0 flex-1 sm:flex-none sm:max-w-[9rem] ${FIELD}`}
                >
                    {peopleOptions.map(option => (
                        <option key={option.name} value={option.name}>{option.name}</option>
                    ))}
                </select>
            )}

            <button
                type="button"
                onClick={submit}
                className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
                Add
            </button>
        </div>
    )
})
