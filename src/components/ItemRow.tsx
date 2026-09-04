import { UsersIcon } from '@heroicons/react/24/outline'
/**
 * One item as a row: the shape every list on the questions page is made of.
 *
 * Read-only by design — mounting an editor per item is what made large sets slow
 * on phones — but the whole row is the target that opens `ItemInlineEditor` for
 * it, so "change one word" is one tap on the word itself.
 *
 * Lives here rather than in the page because the search results are the same
 * rows: an item found by searching should look, and edit, exactly like the item
 * found by unfolding the list it lives in.
 */
import { memo } from 'react'
import { quantityTitle, rateLabel } from './ItemEditorControls'
import { PERSON_COLOR_OFF, personColorFor } from '../edit-questions/person-colors'
import type { Item, Person } from '../edit-questions/types'

export function PersonDot({ person, index, selected }: { person: Person; index: number; selected: boolean }) {
    return (
        <span
            title={person.name}
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold select-none shrink-0 ${selected ? personColorFor(person, index).avatar : PERSON_COLOR_OFF}`}
        >
            {person.name.charAt(0).toUpperCase()}
        </span>
    )
}

/** Part of the name to mark up — where a search matched it. */
export interface TextHighlight {
    start: number
    length: number
}

function ItemText({ text, highlight }: { text: string; highlight?: TextHighlight }) {
    // The parent span already styles an unnamed item; this only supplies words.
    if (!text) return <>no text</>
    if (!highlight || highlight.start < 0) return <>{text}</>
    const end = highlight.start + highlight.length
    return (
        <>
            {text.slice(0, highlight.start)}
            <mark className="bg-amber-200 dark:bg-amber-900/60 text-gray-900 dark:text-gray-100 rounded-sm px-0.5">{text.slice(highlight.start, end)}</mark>
            {text.slice(end)}
        </>
    )
}

export const ItemRow = memo(function ItemRow({ item, people, index, isOpen, highlight, onOpen }: {
    item: Item
    people: Person[]
    index: number
    isOpen?: boolean
    /** Where a search matched the name, so the row can show why it is here. */
    highlight?: TextHighlight
    onOpen?: (index: number) => void
}) {
    const showDots = people.length > 1
    const content = (
        <>
            <span className={`flex-1 min-w-0 text-left ${item.text ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500 italic'}`}>
                <ItemText text={item.text} highlight={highlight} />
            </span>
            {item.communal && (
                <span
                    title="Shared — packed once for the whole group"
                    className="inline-flex items-center justify-center h-5 rounded-full px-1.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 select-none shrink-0"
                >
                    <UsersIcon aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
            )}
            {item.perNight !== undefined && (
                <span
                    title={quantityTitle(item)}
                    className="inline-flex items-center justify-center h-5 rounded-full px-1.5 text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 select-none shrink-0"
                >
                    ×{rateLabel(item).replace(' per ', '/')}
                </span>
            )}
            {showDots && (
                <div className="flex gap-0.5 shrink-0">
                    {people.map((person, i) => (
                        <PersonDot
                            key={person.id}
                            person={person}
                            index={i}
                            selected={item.personSelections?.[i]?.selected ?? false}
                        />
                    ))}
                </div>
            )}
        </>
    )
    if (!onOpen) {
        return <div className="flex items-center gap-2 py-0.5 px-2 text-sm">{content}</div>
    }
    return (
        <button
            type="button"
            data-testid="item-row"
            onClick={() => onOpen(index)}
            aria-expanded={isOpen ?? false}
            title={`Edit ${item.text || 'item'}`}
            className={`group w-full flex items-center gap-2 py-1 px-2 text-sm rounded transition-colors ${isOpen ? 'bg-primary-50 dark:bg-primary-950/40' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        >
            {content}
            {/* Decorative, not a button of its own: the whole row is the target,
                and a second hit area inside it would only make the real one
                harder to hit. Sits last so it lines up down the right edge —
                a column of pencils is what says the rows are editable. */}
            <svg
                data-testid="item-edit-icon"
                aria-hidden="true"
                className={`w-3.5 h-3.5 shrink-0 transition-colors ${isOpen ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
        </button>
    )
})
