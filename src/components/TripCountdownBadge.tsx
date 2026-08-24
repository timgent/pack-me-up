import { URGENT_SLEEPS } from '../create-packing-list/tripDetails'
import type { TripCountdown, TripCountdownStatus } from '../create-packing-list/tripDetails'

interface TripCountdownBadgeProps {
    /** Built by `formatTripCountdown`; null when there is nothing to count down to. */
    countdown: TripCountdown | null
    className?: string
}

/**
 * How each state looks. Anticipation warms as the trip approaches — a distant
 * trip is calm primary, the last few days are accent, the day itself is loud —
 * then cools once there is nothing left to pack for.
 */
const TONES: Record<TripCountdownStatus | 'urgent', string> = {
    upcoming: 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 border-primary-200 dark:border-primary-800',
    urgent: 'bg-accent-100 dark:bg-accent-900/40 text-accent-800 dark:text-accent-200 border-accent-200 dark:border-accent-800',
    today: 'bg-accent-500 dark:bg-accent-600 text-white border-accent-600 dark:border-accent-500',
    'in-progress': 'bg-success-100 dark:bg-success-900/40 text-success-800 dark:text-success-200 border-success-200 dark:border-success-800',
    past: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
}

const ICONS: Record<TripCountdownStatus, string> = {
    upcoming: '🌙',
    today: '🎉',
    'in-progress': '🧳',
    past: '🏡',
}

/**
 * The "3 sleeps until Cornwall" badge. Renders nothing at all — not an empty
 * pill, not a gap — for a list with no dates to count towards, so undated lists
 * look exactly as they did before.
 */
export function TripCountdownBadge({ countdown, className = '' }: TripCountdownBadgeProps) {
    if (!countdown) return null

    const urgent = countdown.status === 'upcoming' && (countdown.sleeps ?? Infinity) <= URGENT_SLEEPS
    const tone = TONES[urgent ? 'urgent' : countdown.status]

    return (
        <span
            data-testid="trip-countdown"
            data-countdown-status={countdown.status}
            className={`inline-flex items-center gap-1 text-sm font-semibold border px-2.5 py-1 rounded-full max-w-full ${tone} ${className}`}
        >
            <span aria-hidden="true">{ICONS[countdown.status]}</span>
            {countdown.label}
        </span>
    )
}
