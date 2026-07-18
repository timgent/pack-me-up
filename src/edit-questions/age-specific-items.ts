import { Person, AgeRange, Gender } from './types'

/**
 * Helper function to filter people by multiple age ranges
 */
function filterByAgeRanges(people: Person[], ageRanges: AgeRange[]): Person[] {
    return people.filter(p => p.ageRange && ageRanges.includes(p.ageRange))
}

/**
 * A people filter that carries the brackets it selects, so items built from
 * it can be tagged with `ageRanges` and revisited when someone ages up.
 * Gender-constrained filters deliberately do NOT carry the tag — bracket
 * membership alone doesn't decide those items.
 */
export interface AgeRangeFilter {
    (people: Person[]): Person[]
    ageRanges: AgeRange[]
}

function ageRangeFilter(ageRanges: AgeRange[]): AgeRangeFilter {
    const fn = ((people: Person[]) => filterByAgeRanges(people, ageRanges)) as AgeRangeFilter
    fn.ageRanges = ageRanges
    return fn
}

export const getAdults = ageRangeFilter(['Adult'])
export const getTeenagers = ageRangeFilter(['Teenager'])
export const getChildren = ageRangeFilter(['Child'])
export const getToddlers = ageRangeFilter(['Toddler'])
export const getBabies = ageRangeFilter(['Baby'])
export const getTeenagersAndAdults = ageRangeFilter(['Teenager', 'Adult'])
export const getChildrenAndOlder = ageRangeFilter(['Child', 'Teenager', 'Adult'])
export const getToddlersAndOlder = ageRangeFilter(['Toddler', 'Child', 'Teenager', 'Adult'])

/**
 * Helper to filter people by gender
 */
function filterByGender(people: Person[], gender: Gender): Person[] {
    return people.filter(p => p.gender === gender)
}

/**
 * Get all female people
 */
export function getFemale(people: Person[]): Person[] {
    return filterByGender(people, 'female')
}

/**
 * Get all male people
 */
export function getMale(people: Person[]): Person[] {
    return filterByGender(people, 'male')
}

/**
 * Get female teenagers and adults
 */
export function getFemaleTeenagersAndAdults(people: Person[]): Person[] {
    return filterByGender(filterByAgeRanges(people, ['Teenager', 'Adult']), 'female')
}

/**
 * Get male teenagers and adults
 */
export function getMaleTeenagersAndAdults(people: Person[]): Person[] {
    return filterByGender(filterByAgeRanges(people, ['Teenager', 'Adult']), 'male')
}
