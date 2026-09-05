import { SparklesIcon } from '@heroicons/react/24/outline'
import { useMemo, useState } from 'react'
import { PackingListQuestionSet } from '../edit-questions/types'
import { WIZARD_TEMPLATE_VERSION } from '../edit-questions/example-data'
import {
    buildTemplateUpdateSuggestions,
    applyTemplateUpdates,
    TemplateUpdateSuggestion,
} from '../edit-questions/template-updates'

interface TemplateUpdatesCardProps {
    questionSet: PackingListQuestionSet
    onApply: (updated: PackingListQuestionSet) => Promise<void> | void
}

const KIND_HINT: Record<TemplateUpdateSuggestion['kind'], string | null> = {
    addItem: null,
    addOption: 'new option',
    addQuestion: 'new question',
    setCategories: 'organises existing items',
}

/**
 * Non-destructive prompt shown on My Questions & Items when the wizard template
 * has gained content since the user set up. Lists the additive suggestions
 * (new items, options, questions) grouped by where they'd land, all ticked by
 * default. Adding or dismissing stamps the set to the current template version
 * so the card stays hidden until the next real template change — the stamp
 * lives in the synced data, so the decision carries across devices.
 */
export function TemplateUpdatesCard({ questionSet, onApply }: TemplateUpdatesCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isApplying, setIsApplying] = useState(false)
    const [unchecked, setUnchecked] = useState<Set<string>>(new Set())

    const isBehind = (questionSet.templateVersion ?? 0) < WIZARD_TEMPLATE_VERSION
    const suggestions = useMemo(
        () => (isBehind ? buildTemplateUpdateSuggestions(questionSet) : []),
        [questionSet, isBehind],
    )

    if (!isBehind || suggestions.length === 0) return null

    // Preserve first-seen order of locations for stable grouping.
    const groups: { label: string; items: TemplateUpdateSuggestion[] }[] = []
    for (const s of suggestions) {
        let group = groups.find(g => g.label === s.contextLabel)
        if (!group) {
            group = { label: s.contextLabel, items: [] }
            groups.push(group)
        }
        group.items.push(s)
    }

    const toggleChecked = (key: string) => {
        setUnchecked(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const applyAccepted = async (accepted: TemplateUpdateSuggestion[]) => {
        setIsApplying(true)
        try {
            await onApply(applyTemplateUpdates(questionSet, accepted))
            setIsExpanded(false)
        } finally {
            setIsApplying(false)
        }
    }

    const handleAddSelected = () => applyAccepted(suggestions.filter(s => !unchecked.has(s.key)))
    // Dismiss records the decision by stamping the version with no additions.
    const handleDismiss = () => applyAccepted([])

    const count = suggestions.length

    return (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800 p-4">
            <div className="flex items-start justify-between gap-4">
                <p className="flex items-start gap-2 text-emerald-900 dark:text-emerald-200 font-medium">
                    <SparklesIcon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>We've added to the starter suggestions since you set up — {count} new suggestion{count === 1 ? '' : 's'} available.</span>
                </p>
                <button
                    type="button"
                    aria-label="Dismiss suggestions"
                    title="No thanks — don't show these again"
                    disabled={isApplying}
                    onClick={handleDismiss}
                    className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 text-xl leading-none flex-shrink-0 disabled:opacity-50"
                >
                    ×
                </button>
            </div>

            {!isExpanded ? (
                <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="mt-2 text-sm text-emerald-700 dark:text-emerald-300 underline"
                >
                    Review suggestions
                </button>
            ) : (
                <div className="mt-4 space-y-4">
                    {groups.map(group => (
                        <div key={group.label}>
                            <p className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-400 font-semibold mb-1">{group.label}</p>
                            <div className="space-y-1.5">
                                {group.items.map(s => (
                                    <label
                                        key={s.key}
                                        className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded border border-emerald-200 dark:border-emerald-800 px-3 py-2"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!unchecked.has(s.key)}
                                            onChange={() => toggleChecked(s.key)}
                                            className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400 rounded focus:ring-2 focus:ring-emerald-500"
                                        />
                                        <span>
                                            <span className="font-medium text-gray-900 dark:text-gray-100">{s.label}</span>
                                            {KIND_HINT[s.kind] && (
                                                <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">{KIND_HINT[s.kind]}</span>
                                            )}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                        >
                            Not now
                        </button>
                        <button
                            type="button"
                            disabled={isApplying}
                            onClick={handleAddSelected}
                            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {isApplying ? 'Adding…' : 'Add selected'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
