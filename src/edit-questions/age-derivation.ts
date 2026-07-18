import { AgeRange, Person } from './types'

/**
 * Whole years between a YYYY-MM-DD date of birth and `today`, or null when
 * the date is unparseable or in the future. Calendar-based (not ms-based) so
 * brackets flip exactly on birthdays; a Feb 29 birthday counts from Mar 1 in
 * non-leap years.
 */
function ageInYears(dateOfBirth: string, today: Date): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth.trim())
    if (!match) return null
    const [, y, m, d] = match.map(Number)
    if (m < 1 || m > 12 || d < 1 || d > 31) return null

    let age = today.getUTCFullYear() - y
    const birthdayPassed =
        today.getUTCMonth() + 1 > m ||
        (today.getUTCMonth() + 1 === m && today.getUTCDate() >= d)
    if (!birthdayPassed) age--
    return age < 0 ? null : age
}

/**
 * Map a date of birth to the app's age brackets (Baby 0-1, Toddler 1-3,
 * Child 3-12, Teenager 12-18, Adult 18+). Returns undefined for invalid or
 * future dates so a bad entry never triggers a transition.
 */
export function deriveAgeRange(dateOfBirth: string, today: Date = new Date()): AgeRange | undefined {
    const age = ageInYears(dateOfBirth, today)
    if (age === null) return undefined
    if (age < 1) return 'Baby'
    if (age < 3) return 'Toddler'
    if (age < 12) return 'Child'
    if (age < 18) return 'Teenager'
    return 'Adult'
}

/**
 * The person's effective bracket right now: derived from dateOfBirth when
 * available, otherwise the stored ageRange.
 */
export function currentAgeRange(person: Person, today: Date = new Date()): AgeRange | undefined {
    if (person.dateOfBirth) {
        const derived = deriveAgeRange(person.dateOfBirth, today)
        if (derived) return derived
    }
    return person.ageRange
}

export interface AgeTransition {
    person: Person
    from: AgeRange | undefined
    to: AgeRange
}

/**
 * People whose derived bracket no longer matches the stored one — i.e. they
 * have aged into a new bracket since the user last acknowledged it. Pets and
 * deleted people never transition.
 */
export function detectAgeTransitions(people: Person[], today: Date = new Date()): AgeTransition[] {
    const transitions: AgeTransition[] = []
    for (const person of people) {
        if (person.species || person.deletedAt || !person.dateOfBirth) continue
        const derived = deriveAgeRange(person.dateOfBirth, today)
        if (derived && derived !== person.ageRange) {
            transitions.push({ person, from: person.ageRange, to: derived })
        }
    }
    return transitions
}
