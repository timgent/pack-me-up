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

/** True only when both dates are known and the trip would end before it began. */
export function tripDatesOutOfOrder(startDate: string | undefined, endDate: string | undefined): boolean {
    const start = parseTripDate(startDate)
    const end = parseTripDate(endDate)
    if (!start || !end) return false
    return end.getTime() < start.getTime()
}
