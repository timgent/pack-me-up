import { useMemo } from 'react'
import type { KnownPerson } from '../hooks/useKnownPeople'
import { normaliseWebIdInput } from '../services/webIdInput'

/**
 * The people this device already holds an address for, as one tap each.
 *
 * Getting somebody's address is the expensive half of sharing — it goes through
 * a different app, and both people have to be paying attention. Having paid
 * that once, nobody should pay it again: the second list shared with the same
 * friend, or sharing back with whoever shared with you, is a question the app
 * can answer out of `useKnownPeople`.
 *
 * Anyone who already has access is filtered out rather than shown as done,
 * because the row is a shortcut to an action and a chip that does nothing is
 * not one. When that empties the row, the whole thing goes: a heading over no
 * chips reads as something broken.
 */
export function PeopleSuggestions({ people, alreadyShared, onPick, label = 'Share with someone you already know' }: {
    people: readonly KnownPerson[]
    /** WebIDs that already have access here, in whatever shape they are stored. */
    alreadyShared: readonly string[]
    onPick: (webId: string) => void
    label?: string
}) {
    const suggestions = useMemo(() => {
        // Normalised on both sides: the ACL's spelling of somebody and the
        // People editor's need not match, and a chip that re-grants access
        // somebody already has is a confusing no-op.
        const excluded = new Set(
            alreadyShared.map(webId => normaliseWebIdInput(webId) ?? webId),
        )
        return people.filter(person => !excluded.has(person.webId))
    }, [people, alreadyShared])

    if (suggestions.length === 0) return null

    return (
        <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <div className="flex flex-wrap gap-1.5">
                {suggestions.map(person => (
                    <button
                        key={person.webId}
                        type="button"
                        onClick={() => onPick(person.webId)}
                        title={person.webId}
                        className="min-h-[36px] px-3 py-1.5 rounded-full text-sm font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 hover:bg-primary-200 dark:hover:bg-primary-900/60 transition-colors"
                    >
                        {person.name}
                    </button>
                ))}
            </div>
        </div>
    )
}
