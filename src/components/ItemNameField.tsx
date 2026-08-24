/**
 * The "type an item name" field, with the collection's own names offered back
 * as you type.
 *
 * Shared by both add-an-item composers — the packing list's and the question
 * set's — because typing an item name is the same job on both pages and the
 * keyboard contract is the fiddly part: arrows move through the matches, Enter
 * takes a highlighted match or else submits what was typed, and Escape backs
 * out one layer at a time so dismissing the dropdown never loses the draft.
 *
 * The field owns the dropdown (which match is highlighted, whether it is
 * showing at all) and nothing else. The text belongs to the composer around it,
 * which is what has to clear it after an add and read it to decide whether
 * there is an item to file yet.
 */
import { useMemo, useState } from 'react'
import { suggestFor, type ItemSuggestion, type SuggestionIndex } from '../utils/itemSuggestions'
import { sectionHeading } from '../utils/sectionHeading'

/** A composer field, bar the focus ring — each page brings its own accent. */
export const FIELD_BASE = 'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2'
export const FIELD = `${FIELD_BASE} focus:ring-blue-500`

interface ItemNameFieldProps {
    value: string
    onChange: (text: string) => void
    suggestions: SuggestionIndex
    /** Whose existing names to leave out of the offers — see `buildIndexOf`. */
    ownerKey: string
    /** A suggestion was taken; its name is already in `value`. */
    onPick?: (suggestion: ItemSuggestion) => void
    onSubmit: () => void
    /** Escape with nothing left to dismiss — set by composers opened in place. */
    onClose?: () => void
    /**
     * The field's accessible name. Set by the composer rather than built here,
     * because a page with a ＋ per section heading has to keep the two apart:
     * a field and a button that both announce "add an item to Toiletries" are
     * indistinguishable to anyone listening.
     */
    label: string
    /** Distinct per mounted field: ties the input to its own listbox. */
    listboxId: string
    inputRef?: React.RefObject<HTMLInputElement | null>
    autoFocus?: boolean
    placeholder?: string
    /** Defaults to the packing list's accent; see `FIELD_BASE`. */
    inputClassName?: string
}

export function ItemNameField({
    value,
    onChange,
    suggestions,
    ownerKey,
    onPick,
    onSubmit,
    onClose,
    label,
    listboxId,
    inputRef,
    autoFocus,
    placeholder = 'Add new item...',
    inputClassName = FIELD,
}: ItemNameFieldProps) {
    const [highlighted, setHighlighted] = useState(-1)
    const [open, setOpen] = useState(true)

    const matches = useMemo(
        () => open ? suggestFor(suggestions, ownerKey, value) : [],
        [suggestions, ownerKey, value, open],
    )

    const applySuggestion = (suggestion: ItemSuggestion) => {
        onChange(suggestion.text)
        setOpen(false)
        setHighlighted(-1)
        onPick?.(suggestion)
        inputRef?.current?.focus()
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown' && matches.length > 0) {
            e.preventDefault()
            setHighlighted(prev => (prev + 1) % matches.length)
            return
        }
        if (e.key === 'ArrowUp' && matches.length > 0) {
            e.preventDefault()
            setHighlighted(prev => (prev <= 0 ? matches.length : prev) - 1)
            return
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            const picked = matches[highlighted]
            if (picked) applySuggestion(picked)
            else onSubmit()
            return
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            // Escape backs out one layer at a time: the suggestions first, then
            // the composer — so dismissing a dropdown never loses what was typed.
            if (matches.length > 0) {
                setOpen(false)
                setHighlighted(-1)
                return
            }
            onClose?.()
        }
    }

    // Leaving the field for anywhere else — including the composer's own
    // quantity box — puts the dropdown away. It hangs over whatever is below it,
    // so it has no business outliving the field it belongs to.
    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        if (e.currentTarget.contains(e.relatedTarget)) return
        setOpen(false)
    }

    return (
        <div className="relative w-full" onBlur={handleBlur}>
            <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={matches.length > 0}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-label={label}
                autoComplete="off"
                enterKeyHint="done"
                value={value}
                autoFocus={autoFocus}
                onChange={e => {
                    onChange(e.target.value)
                    setHighlighted(-1)
                    setOpen(true)
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={`w-full ${inputClassName}`}
            />
            {matches.length > 0 && (
                <ul
                    id={listboxId}
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-1 shadow-lg"
                >
                    {matches.map((suggestion, i) => (
                        <li key={suggestion.text}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={i === highlighted}
                                // Blur would close the list before the click landed.
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => applySuggestion(suggestion)}
                                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === highlighted ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                            >
                                <span className="truncate">{suggestion.text}</span>
                                {suggestion.category && (
                                    <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                        {sectionHeading(suggestion.category)}
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
