// Trip dates are stored as plain YYYY-MM-DD strings (like a person's date of
// birth) rather than timestamps: a trip that starts on the 12th starts on the
// 12th wherever the list is opened, so there is no timezone to drift across.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parses a YYYY-MM-DD string into a Date at local midnight. `new Date(str)`
 * would read it as UTC midnight, which renders as the previous day for anyone
 * west of Greenwich.
 */
export function parseTripDate(value: string | undefined): Date | null {
    if (!value) return null
    const match = ISO_DATE.exec(value)
    if (!match) return null
    const [, year, month, day] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(date.getTime()) ? null : date
}

/** A single trip date in the viewer's locale, or null if it can't be read. */
export function formatTripDate(value: string | undefined): string | null {
    return parseTripDate(value)?.toLocaleDateString() ?? null
}

/**
 * The trip's dates as one human-readable label — a range where both ends are
 * known, an open-ended "From"/"Until" where only one is, and null when the list
 * has no trip dates at all.
 */
export function formatTripDates(startDate: string | undefined, endDate: string | undefined): string | null {
    const start = formatTripDate(startDate)
    const end = formatTripDate(endDate)

    if (start && end) return start === end ? start : `${start} – ${end}`
    if (start) return `From ${start}`
    if (end) return `Until ${end}`
    return null
}

/**
 * True when the trip's last known date is before today — the trip is over and
 * there is nothing left to pack for.
 *
 * The last date is the end date, falling back to the start date for an
 * open-ended trip. A list with no usable dates is never past: an undated list
 * is one somebody may still be planning, so it stays in view.
 */
export function tripIsPast(startDate: string | undefined, endDate: string | undefined): boolean {
    const lastDate = parseTripDate(endDate) ?? parseTripDate(startDate)
    if (!lastDate) return false

    // Compared as calendar days, so a trip ending today stays current until
    // tomorrow whatever the time of day.
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return lastDate.getTime() < today.getTime()
}

/** The fields of a packing list that decide where it belongs on the lists page. */
export interface TripSchedule {
    createdAt: string
    lastModified?: string
    startDate?: string
    endDate?: string
}

/**
 * How many undated lists stay in the main section.
 *
 * An undated list never says it is finished, so folding one away can only ever
 * be a guess. Rather than guess from age — which would fold a list made months
 * ago for a trip next week — only the few most recently worked on stay above
 * the fold, and the rest are a click away.
 */
export const MAX_UNDATED_CURRENT_TRIPS = 3

/** True when at least one of the trip's dates is a date we can read. */
function hasTripDates(list: TripSchedule): boolean {
    return parseTripDate(list.startDate) !== null || parseTripDate(list.endDate) !== null
}

/**
 * When the list was last worked on. `lastModified` is stamped on every save, so
 * it tracks real use; `createdAt` covers lists last touched before that field
 * existed. Unreadable timestamps sort oldest rather than throwing the order.
 */
function lastActivity(list: TripSchedule): number {
    const stamp = Date.parse(list.lastModified ?? list.createdAt)
    return Number.isNaN(stamp) ? 0 : stamp
}

/**
 * Splits lists into the ones worth showing now and the ones to fold away.
 *
 * A trip whose dates have passed is finished, so it folds. A trip whose dates
 * are still ahead always stays — capping those would hide a trip somebody has
 * booked. Undated lists have no such signal, so the most recently worked on
 * `MAX_UNDATED_CURRENT_TRIPS` stay and the rest fold.
 *
 * `allPastFinished` says whether everything folded is a genuinely finished
 * trip, so the section can avoid calling a list made last month a past trip.
 * Both sections keep the order they arrived in: which cards are shown is this
 * function's business, the order they are shown in is the caller's.
 */
export function splitCurrentAndPastTrips<T extends TripSchedule>(lists: T[]): {
    current: T[]
    past: T[]
    allPastFinished: boolean
} {
    const undatedToKeep = new Set(
        lists
            .filter(list => !hasTripDates(list))
            .sort((a, b) => lastActivity(b) - lastActivity(a))
            .slice(0, MAX_UNDATED_CURRENT_TRIPS)
    )

    const current: T[] = []
    const past: T[] = []
    let allPastFinished = true

    for (const list of lists) {
        if (tripIsPast(list.startDate, list.endDate)) {
            past.push(list)
        } else if (hasTripDates(list) || undatedToKeep.has(list)) {
            current.push(list)
        } else {
            past.push(list)
            allPastFinished = false
        }
    }

    return { current, past, allPastFinished }
}

/** True only when both dates are known and the trip would end before it began. */
export function tripDatesOutOfOrder(startDate: string | undefined, endDate: string | undefined): boolean {
    const start = parseTripDate(startDate)
    const end = parseTripDate(endDate)
    if (!start || !end) return false
    return end.getTime() < start.getTime()
}

/**
 * Where a trip sits relative to today. Each state gets copy of its own so a
 * trip that has started or finished never renders as a zero or negative
 * countdown.
 */
export type TripCountdownStatus = 'upcoming' | 'today' | 'in-progress' | 'past'

export interface TripCountdown {
    status: TripCountdownStatus
    /** Ready-to-render copy, e.g. "3 sleeps until Cornwall". */
    label: string
    /** Nights left before the trip starts; 0 on the day, absent once it has begun. */
    sleeps?: number
}

/** The fields of a packing list a countdown is built from. */
export interface TripCountdownInput {
    startDate?: string
    endDate?: string
    destination?: string
}

/**
 * How close a trip has to be before the countdown starts naming the items still
 * to pack. Further out than this it is anticipation, not a to-do list, and the
 * card already carries a packed count.
 */
export const URGENT_SLEEPS = 3

/** Local midnight today — the day boundary every comparison here is made against. */
function startOfToday(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * Whole calendar days from one local midnight to another. Rounding absorbs the
 * hour a daylight-saving change adds to or takes off the span.
 */
function calendarDaysBetween(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function pluralise(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * The trip's countdown as copy the traveller can read, or null when there is
 * nothing to count down to — no dates at all, unreadable dates, or an
 * open-ended trip that only says when it ends.
 *
 * `remainingItems` is folded in only for a trip within `URGENT_SLEEPS`, where
 * "2 sleeps until Cornwall, 18 items left" is the nudge a parent actually
 * needs; a trip under way or over is never nagged about packing.
 */
export function formatTripCountdown(
    { startDate, endDate, destination }: TripCountdownInput,
    remainingItems?: number
): TripCountdown | null {
    const start = parseTripDate(startDate)
    const end = parseTripDate(endDate)
    if (!start && !end) return null

    if (tripIsPast(startDate, endDate)) {
        return { status: 'past', label: destination ? `Back from ${destination}` : 'Trip finished' }
    }

    // Without a start date there is no moment to count towards. The trip is
    // still ahead of its end date, but saying so would be a guess.
    if (!start) return null

    const sleeps = calendarDaysBetween(startOfToday(), start)

    if (sleeps > 0) {
        const label = destination
            ? `${pluralise(sleeps, 'sleep')} until ${destination}`
            : `${pluralise(sleeps, 'sleep')} to go`
        return withRemaining({ status: 'upcoming', sleeps, label }, remainingItems)
    }

    if (sleeps === 0) {
        const label = destination ? `Off to ${destination} today!` : "Today's the day!"
        return withRemaining({ status: 'today', sleeps, label }, remainingItems)
    }

    return { status: 'in-progress', label: destination ? `In ${destination} now` : 'Trip in progress' }
}

/**
 * Appends the items still to pack to a countdown that is close enough to earn
 * it. Separated by a middot rather than a comma, which a destination can carry
 * one of already ("Lisbon, Portugal, 2 items left" reads as three things); an
 * exclamation closes the sentence, so there the count simply follows.
 */
function withRemaining(countdown: TripCountdown, remainingItems?: number): TripCountdown {
    if (!remainingItems || remainingItems <= 0) return countdown
    if (countdown.sleeps === undefined || countdown.sleeps > URGENT_SLEEPS) return countdown

    const left = `${pluralise(remainingItems, 'item')} left`
    const separator = countdown.label.endsWith('!') ? ' ' : ' · '
    return { ...countdown, label: `${countdown.label}${separator}${left}` }
}
