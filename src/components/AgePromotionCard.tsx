import { useMemo, useState } from 'react'
import { PackingListQuestionSet } from '../edit-questions/types'
import { AGE_RANGE_OPTIONS } from '../edit-questions/types'
import { detectAgeTransitions, AgeTransition } from '../edit-questions/age-derivation'
import { buildPromotionSuggestions, applyAgePromotions, PromotionSuggestion } from '../edit-questions/age-promotion'

const DISMISSED_KEY_PREFIX = 'age-promotion-dismissed:'

function bracketLabel(value: string | undefined): string {
    if (!value) return 'no age set'
    return AGE_RANGE_OPTIONS.find(o => o.value === value)?.label ?? value
}

function isDismissed(t: AgeTransition): boolean {
    try {
        return localStorage.getItem(`${DISMISSED_KEY_PREFIX}${t.person.id}`) === t.to
    } catch {
        return false
    }
}

interface AgePromotionCardProps {
    questionSet: PackingListQuestionSet
    onApply: (updated: PackingListQuestionSet) => Promise<void> | void
    /** Injectable clock for tests */
    today?: Date
}

/**
 * Banner shown when someone with a date of birth has aged into a new
 * bracket. Expands into a per-person review of suggested item changes;
 * applying updates the stored bracket (so the prompt stops) and only the
 * changes the user left ticked. Dismissing remembers the person+bracket in
 * localStorage so the same transition isn't offered again on this device.
 */
export function AgePromotionCard({ questionSet, onApply, today }: AgePromotionCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isApplying, setIsApplying] = useState(false)
    const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
    const [dismissedTick, setDismissedTick] = useState(0)

    const transitions = useMemo(
        () => detectAgeTransitions(questionSet.people ?? [], today).filter(t => !isDismissed(t)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [questionSet, today, dismissedTick]
    )

    const suggestions = useMemo(
        () => buildPromotionSuggestions(questionSet, transitions),
        [questionSet, transitions]
    )

    if (transitions.length === 0) return null

    const byPerson = transitions.map(t => ({
        transition: t,
        ageOut: suggestions.filter(s => s.personId === t.person.id && s.direction === 'ageOut'),
        ageIn: suggestions.filter(s => s.personId === t.person.id && s.direction !== 'ageOut'),
    }))

    const toggleChecked = (key: string) => {
        setUnchecked(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const handleDismiss = () => {
        try {
            for (const t of transitions) {
                localStorage.setItem(`${DISMISSED_KEY_PREFIX}${t.person.id}`, t.to)
            }
        } catch {
            // localStorage unavailable — banner just reappears next visit
        }
        setDismissedTick(n => n + 1)
    }

    const handleApply = async () => {
        setIsApplying(true)
        try {
            const accepted = suggestions.filter(s => !unchecked.has(s.key))
            await onApply(applyAgePromotions(questionSet, transitions, accepted))
            setIsExpanded(false)
        } finally {
            setIsApplying(false)
        }
    }

    const summary = transitions
        .map(t => `${t.person.name} is now ${t.to === 'Adult' ? 'an adult' : `a ${t.to.toLowerCase()}`}`)
        .join(', ')

    const renderSuggestion = (s: PromotionSuggestion) => (
        <label key={s.key} className="flex items-start gap-2 text-sm text-gray-700 bg-white rounded border border-violet-200 px-3 py-2">
            <input
                type="checkbox"
                checked={!unchecked.has(s.key)}
                onChange={() => toggleChecked(s.key)}
                className="mt-0.5 h-4 w-4 text-violet-600 rounded focus:ring-2 focus:ring-violet-500"
            />
            <span>
                <span className="font-medium text-gray-900">{s.itemText}</span>
                <span className="ml-2 text-xs text-gray-500">{s.contextLabel}</span>
            </span>
        </label>
    )

    return (
        <div className="bg-violet-50 rounded-lg border border-violet-200 p-4">
            <div className="flex items-start justify-between gap-4">
                <p className="text-violet-900 font-medium">🎂 Time flies — {summary}! Want to update their packing items?</p>
                <button
                    type="button"
                    aria-label="Dismiss age update"
                    title="Don't ask again for this age change"
                    onClick={handleDismiss}
                    className="text-violet-600 hover:text-violet-900 text-xl leading-none flex-shrink-0"
                >
                    ×
                </button>
            </div>
            {!isExpanded ? (
                <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="mt-2 text-sm text-violet-700 underline"
                >
                    Review changes
                </button>
            ) : (
                <div className="mt-4 space-y-5">
                    {byPerson.map(({ transition, ageOut, ageIn }) => (
                        <div key={transition.person.id}>
                            <p className="text-sm text-violet-800 font-semibold">
                                {transition.person.name}: {bracketLabel(transition.from)} → {bracketLabel(transition.to)}
                            </p>
                            {ageOut.length === 0 && ageIn.length === 0 && (
                                <p className="mt-1 text-sm text-violet-700">No item changes suggested — we'll just remember the new age bracket.</p>
                            )}
                            {ageOut.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs uppercase tracking-wide text-violet-600 font-semibold mb-1">Outgrown — untick to keep</p>
                                    <div className="space-y-1.5">{ageOut.map(renderSuggestion)}</div>
                                </div>
                            )}
                            {ageIn.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs uppercase tracking-wide text-violet-600 font-semibold mb-1">Suggested for their new age</p>
                                    <div className="space-y-1.5">{ageIn.map(renderSuggestion)}</div>
                                </div>
                            )}
                        </div>
                    ))}
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-violet-100"
                        >
                            Not now
                        </button>
                        <button
                            type="button"
                            disabled={isApplying}
                            onClick={handleApply}
                            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                        >
                            {isApplying ? 'Updating…' : 'Apply updates'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
