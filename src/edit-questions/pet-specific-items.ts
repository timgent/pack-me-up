import { Person, PetSpecies } from './types'

/**
 * Helper to filter people by pet species
 */
function filterBySpecies(people: Person[], species: PetSpecies): Person[] {
    return people.filter(p => p.species === species)
}

/**
 * Get dogs only
 */
export function getDogs(people: Person[]): Person[] {
    return filterBySpecies(people, 'dog')
}

/**
 * Get cats only
 */
export function getCats(people: Person[]): Person[] {
    return filterBySpecies(people, 'cat')
}

/**
 * Get all pets (anyone with a species set, regardless of which)
 */
export function getPets(people: Person[]): Person[] {
    return people.filter(p => p.species != null)
}

/**
 * Get all humans (anyone without a species). Used as the default audience for
 * items that aren't otherwise filtered, so pets don't inherit human items.
 */
export function getHumans(people: Person[]): Person[] {
    return people.filter(p => p.species == null)
}
