import { useId, useState, type ReactNode } from 'react'

interface PastTripsSectionProps {
    /** How many trips are folded away — shown in the label so the count is visible while closed. */
    count: number
    /**
     * Whether every folded trip is one whose dates have passed. An undated list
     * can be folded for going quiet rather than for being over, and calling
     * that a past trip would be telling the reader something untrue.
     */
    allPastFinished: boolean
    children: ReactNode
}

/**
 * The trips folded away below the main list, behind a disclosure that starts
 * closed. They are worth keeping, but they are not what somebody opening the
 * page came to see.
 */
export function PastTripsSection({ count, allPastFinished, children }: PastTripsSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const panelId = useId()
    const label = allPastFinished ? 'Past trips' : 'Older trips'

    return (
        <div className="mt-8">
            {/* Understated next to the list cards — it is not a trip — but still
                a row that looks pressable, since it is the only thing on the
                page that reveals anything. */}
            <button
                type="button"
                onClick={() => setIsExpanded(expanded => !expanded)}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                className="flex items-center gap-2 w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white/60 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-400 transition-colors"
            >
                <span className="shrink-0 text-sm text-gray-400 dark:text-gray-500">{isExpanded ? '▼' : '▶'}</span>
                <span className="text-lg font-semibold">{label} ({count})</span>
            </button>
            {/* Unmounted rather than hidden: a closed section shouldn't put its
                cards in the tab order or read them out to a screen reader. */}
            {isExpanded && (
                <div id={panelId} className="mt-2 space-y-4">
                    {children}
                </div>
            )}
        </div>
    )
}
