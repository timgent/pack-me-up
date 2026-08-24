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
