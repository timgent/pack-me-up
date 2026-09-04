import { CakeIcon } from '@heroicons/react/24/outline'
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
    /**
     * Bracket changes the user just made by hand (e.g. promoting a kid
     * early). Shown alongside birthday-driven transitions so they get the
     * same item review; never dismissed via localStorage since they're
     * one-shot.
     */
    manualTransitions?: AgeTransition[]
    /** Called when manual transitions have been applied or dismissed */
    onManualHandled?: () => void
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
export function AgePromotionCard({ questionSet, onApply, manualTransitions, onManualHandled, today }: AgePromotionCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isApplying, setIsApplying] = useState(false)
    const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
    const [dismissedTick, setDismissedTick] = useState(0)

    const transitions = useMemo(
        () => {
            const manual = manualTransitions ?? []
            const manualIds = new Set(manual.map(t => t.person.id))
            const auto = detectAgeTransitions(questionSet.people ?? [], today)
                .filter(t => !isDismissed(t) && !manualIds.has(t.person.id))
            return [...manual, ...auto]
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [questionSet, manualTransitions, today, dismissedTick]
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
        const manualIds = new Set((manualTransitions ?? []).map(t => t.person.id))
        try {
            // Manual transitions are one-shot state, not a recurring detection,
            // so they don't need a localStorage marker.
            for (const t of transitions) {
                if (!manualIds.has(t.person.id)) {
                    localStorage.setItem(`${DISMISSED_KEY_PREFIX}${t.person.id}`, t.to)
                }
            }
        } catch {
            // localStorage unavailable — banner just reappears next visit
        }
        setDismissedTick(n => n + 1)
        onManualHandled?.()
    }

    const handleApply = async () => {
        setIsApplying(true)
        try {
            const accepted = suggestions.filter(s => !unchecked.has(s.key))
            await onApply(applyAgePromotions(questionSet, transitions, accepted))
            setIsExpanded(false)
            onManualHandled?.()
        } finally {
            setIsApplying(false)
        }
    }

    const summary = transitions
        .map(t => `${t.person.name} is now ${t.to === 'Adult' ? 'an adult' : `a ${t.to.toLowerCase()}`}`)
        .join(', ')

    const renderSuggestion = (s: PromotionSuggestion) => (
        <label key={s.key} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded border border-violet-200 dark:border-violet-800 px-3 py-2">
            <input
                type="checkbox"
                checked={!unchecked.has(s.key)}
                onChange={() => toggleChecked(s.key)}
                className="mt-0.5 h-4 w-4 text-violet-600 dark:text-violet-400 rounded focus:ring-2 focus:ring-violet-500"
            />
            <span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{s.itemText}</span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{s.contextLabel}</span>
            </span>
        </label>
    )

    return (
        <div className="bg-violet-50 dark:bg-violet-950/40 rounded-lg border border-violet-200 dark:border-violet-800 p-4">
            <div className="flex items-start justify-between gap-4">
                <p className="flex items-start gap-2 text-violet-900 dark:text-violet-200 font-medium">
                    <CakeIcon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>Time flies — {summary}! Want to update their packing items?</span>
                </p>
                <button
                    type="button"
                    aria-label="Dismiss age update"
                    title="Don't ask again for this age change"
                    onClick={handleDismiss}
                    className="text-violet-600 dark:text-violet-400 hover:text-violet-900 dark:hover:text-violet-200 text-xl leading-none flex-shrink-0"
                >
                    ×
                </button>
            </div>
            {!isExpanded ? (
                <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="mt-2 text-sm text-violet-700 dark:text-violet-300 underline"
                >
                    Review changes
                </button>
            ) : (
                <div className="mt-4 space-y-5">
                    {byPerson.map(({ transition, ageOut, ageIn }) => (
                        <div key={transition.person.id}>
                            <p className="text-sm text-violet-800 dark:text-violet-200 font-semibold">
                                {transition.person.name}: {bracketLabel(transition.from)} → {bracketLabel(transition.to)}
                            </p>
                            {ageOut.length === 0 && ageIn.length === 0 && (
                                <p className="mt-1 text-sm text-violet-700 dark:text-violet-300">No item changes suggested — we'll just remember the new age bracket.</p>
                            )}
                            {ageOut.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs uppercase tracking-wide text-violet-600 dark:text-violet-400 font-semibold mb-1">Outgrown — untick to keep</p>
                                    <div className="space-y-1.5">{ageOut.map(renderSuggestion)}</div>
                                </div>
                            )}
                            {ageIn.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs uppercase tracking-wide text-violet-600 dark:text-violet-400 font-semibold mb-1">Suggested for their new age</p>
                                    <div className="space-y-1.5">{ageIn.map(renderSuggestion)}</div>
                                </div>
                            )}
                        </div>
                    ))}
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/40"
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
