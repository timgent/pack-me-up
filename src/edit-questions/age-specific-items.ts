import { Person, AgeRange } from './types'

/**
 * Helper function to filter people by age range
 */
function filterByAgeRange(people: Person[], ageRange: AgeRange): Person[] {
    return people.filter(p => p.ageRange === ageRange)
}

/**
 * Helper function to filter people by multiple age ranges
 */
function filterByAgeRanges(people: Person[], ageRanges: AgeRange[]): Person[] {
    return people.filter(p => p.ageRange && ageRanges.includes(p.ageRange))
}

/**
 * Get adults only
 */
export function getAdults(people: Person[]): Person[] {
    return filterByAgeRange(people, 'Adult')
}

/**
 * Get teenagers only
 */
export function getTeenagers(people: Person[]): Person[] {
    return filterByAgeRange(people, 'Teenager')
}

/**
 * Get children only
 */
export function getChildren(people: Person[]): Person[] {
    return filterByAgeRange(people, 'Child')
}

/**
 * Get toddlers only
 */
export function getToddlers(people: Person[]): Person[] {
    return filterByAgeRange(people, 'Toddler')
}

/**
 * Get babies only
 */
export function getBabies(people: Person[]): Person[] {
    return filterByAgeRange(people, 'Baby')
}

/**
 * Get teenagers and adults
 */
export function getTeenagersAndAdults(people: Person[]): Person[] {
    return filterByAgeRanges(people, ['Teenager', 'Adult'])
}

/**
 * Get children and older (Child, Teenager, Adult)
 */
export function getChildrenAndOlder(people: Person[]): Person[] {
    return filterByAgeRanges(people, ['Child', 'Teenager', 'Adult'])
}

/**
 * Get toddlers and older (Toddler, Child, Teenager, Adult)
 */
export function getToddlersAndOlder(people: Person[]): Person[] {
    return filterByAgeRanges(people, ['Toddler', 'Child', 'Teenager', 'Adult'])
}
