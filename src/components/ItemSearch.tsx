/**
 * Searching the questions page for an item.
 *
 * The page is a page of folded lists, and everything on it is addressed by
 * where it lives: which question, which answer, which section. That is exactly
 * what you don't know when the question in your head is "have I got sun cream in
 * here anywhere?" — so this finds the item and then *tells you where it lives*,
 * because the location is half the answer. The other half is being able to fix
 * it there and then, so a result is the same row as on the page, opening the
 * same inline editor, writing through the same handlers.
 *
 * Results are grouped by the trail that leads to them rather than listed flat.
 * A flat list repeats "Beach holiday? › Yes › Toiletries" against every row and
 * still leaves you to notice that three of the rows are the same place; the
 * group says it once, which is also what makes a near-duplicate ("Suncream"
 * under one answer, "Sun cream" under another) obvious at a glance.
 */
import { Fragment, useMemo, useState } from 'react'
import { ItemInlineEditor } from './ItemInlineEditor'
import { ItemRow } from './ItemRow'
import { MIN_QUERY_LENGTH, searchQuestionSetItems, sectionNamesItsList, type ItemSearchGroup, type ItemSearchMatch } from '../edit-questions/item-search'
import { sectionAccent } from '../edit-questions/section-accent'
import type { Item, PackingListQuestionSet, Person } from '../edit-questions/types'

export function ItemSearchBar({ value, onChange }: {
    value: string
    onChange: (value: string) => void
}) {
    const typed = value.trim().length
    return (
        <div>
            <div className="relative">
                <svg
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <input
                    // Not type="search": that draws a clear button of its own,
                    // beside the one below, and only in some browsers. The
                    // inputMode still asks a phone for the search keyboard.
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    aria-label="Search items"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    // Escape is the shortest way back to the page you were on,
                    // and the one people already expect from a search field.
                    onKeyDown={e => { if (e.key === 'Escape') onChange('') }}
                    placeholder="Search items — e.g. sun cream"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {typed > 0 && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        aria-label="Clear search"
                        title="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
            {/* One letter matches most of a question set, so the page keeps
                showing the set and says what it is waiting for. */}
            {typed > 0 && typed < MIN_QUERY_LENGTH && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Keep typing — search starts at {MIN_QUERY_LENGTH} letters
                </p>
            )}
        </div>
    )
}

/** Which row has its editor open, keyed by the item rather than its position. */
function openKeyFor(group: ItemSearchGroup, match: ItemSearchMatch): string {
    return `${group.key}#${match.item.id ?? match.index}`
}

export function ItemSearchResults({ questionSet, query, people, allItemNames, sectionNames, onOptionItemChange, onOptionItemDelete, onAlwaysItemChange, onAlwaysItemDelete }: {
    questionSet: PackingListQuestionSet
    query: string
    people: Person[]
    allItemNames: string[]
    sectionNames: string[]
    onOptionItemChange: (questionId: string, optionId: string, index: number, edited: Item) => void
    onOptionItemDelete: (questionId: string, optionId: string, index: number) => void
    onAlwaysItemChange: (index: number, edited: Item) => void
    onAlwaysItemDelete: (index: number) => void
}) {
    const [open, setOpen] = useState<{ key: string; itemId?: string } | null>(null)
    // A new search is a new question; whatever was open belonged to the old one.
    const [searched, setSearched] = useState(query)
    if (query !== searched) {
        setSearched(query)
        setOpen(null)
    }

    const needle = query.trim()
    const results = useMemo(
        () => searchQuestionSetItems(questionSet, needle, { pinnedItemId: open?.itemId }),
        [questionSet, needle, open?.itemId])

    const applyChange = (group: ItemSearchGroup, match: ItemSearchMatch, edited: Item) => {
        if (group.location.kind === 'always') onAlwaysItemChange(match.index, edited)
        else onOptionItemChange(group.location.questionId, group.location.optionId, match.index, edited)
    }

    // Closing first, for the same reason the page's own lists do: the row has
    // gone and every index below it has shifted up under the open panel.
    const applyDelete = (group: ItemSearchGroup, match: ItemSearchMatch) => {
        setOpen(null)
        if (group.location.kind === 'always') onAlwaysItemDelete(match.index)
        else onOptionItemDelete(group.location.questionId, group.location.optionId, match.index)
    }

    const found = results.total > 0

    return (
        <div data-testid="item-search-results" className="space-y-2">
            {found ? (
                <p data-testid="item-search-summary" role="status" className="text-sm text-gray-500 dark:text-gray-400">
                    {results.total} item{results.total === 1 ? '' : 's'} match{results.total === 1 ? 'es' : ''} “{needle}”
                    {results.shown < results.total && (
                        <span className="text-gray-400 dark:text-gray-500"> — showing the first {results.shown}. Try a longer search.</span>
                    )}
                </p>
            ) : (
                // The one line the count would have been, said inside the card
                // rather than above it — twice is once too often for "nothing".
                <div
                    data-testid="item-search-summary"
                    role="status"
                    className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-6 text-center"
                >
                    <p className="text-sm text-gray-500 dark:text-gray-400">No items match “{needle}”</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Search looks at item names — try part of a word, or check the spelling.
                    </p>
                </div>
            )}

            {results.groups.map(group => (
                <div
                    key={group.key}
                    data-testid="search-group"
                    className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                    <div className="flex items-center gap-2 rounded-t-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5">
                        <span
                            data-testid="search-group-crumbs"
                            className="flex items-baseline text-sm min-w-0 text-gray-700 dark:text-gray-300"
                        >
                            {group.crumbs.map((crumb, i) => (
                                <Fragment key={`${group.key}-crumb-${i}`}>
                                    {i > 0 && (
                                        <span aria-hidden="true" className="shrink-0 whitespace-pre text-gray-400 dark:text-gray-500">{' \u203a '}</span>
                                    )}
                                    {/* The answer is what holds the items and what
                                        tells two cards of the same question apart,
                                        so it is the crumb that keeps its room on a
                                        phone: the question above it gives way. */}
                                    <span className={i === group.crumbs.length - 1
                                        ? 'font-semibold shrink-0 max-w-[55%] truncate'
                                        : 'truncate'}>{crumb}</span>
                                </Fragment>
                            ))}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                            {group.count} match{group.count === 1 ? '' : 'es'}
                        </span>
                    </div>
                    <div className="p-1 space-y-1">
                        {group.sections.map(section => {
                            const accent = sectionAccent(section.label, section.isDefault)
                            return (
                                <div key={`${group.key}-${section.label}`}>
                                    {/* Named only where the name says something the
                                        trail above hasn't already — see
                                        `sectionNamesItsList`. */}
                                    {!sectionNamesItsList(group, section) && (
                                        <div data-testid="search-section-label" className="flex items-center gap-1.5 px-1.5 pb-0.5 pt-1">
                                            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${accent.rail}`} />
                                            <span className={`text-[11px] font-semibold uppercase tracking-wide ${accent.text}`}>
                                                {section.label}
                                            </span>
                                        </div>
                                    )}
                                    <div className="space-y-0.5">
                                        {section.matches.map(match => {
                                            const key = openKeyFor(group, match)
                                            const isOpen = open?.key === key
                                            return (
                                                <Fragment key={key}>
                                                    <ItemRow
                                                        item={match.item}
                                                        people={people}
                                                        index={match.index}
                                                        isOpen={isOpen}
                                                        highlight={match.matchStart >= 0
                                                            ? { start: match.matchStart, length: needle.length }
                                                            : undefined}
                                                        onOpen={() => setOpen(isOpen ? null : { key, itemId: match.item.id })}
                                                    />
                                                    {isOpen && (
                                                        <ItemInlineEditor
                                                            item={match.item}
                                                            people={people}
                                                            allItemNames={allItemNames}
                                                            sectionNames={sectionNames}
                                                            sectionDefaultLabel={group.defaultLabel}
                                                            onChange={edited => applyChange(group, match, edited)}
                                                            onDelete={() => applyDelete(group, match)}
                                                            onClose={() => setOpen(null)}
                                                        />
                                                    )}
                                                </Fragment>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
