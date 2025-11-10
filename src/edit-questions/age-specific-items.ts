import { Person, Item, PersonSelection, AgeRange } from './types'

/**
 * Helper function to create person selections for specific people
 */
function createPersonSelections(people: Person[], selectedPeople: Person[]): PersonSelection[] {
    return people.map(p => ({
        personId: p.id,
        selected: selectedPeople.some(sp => sp.id === p.id)
    }))
}

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

/**
 * Get everyone (all people regardless of age range)
 */
export function getEveryone(people: Person[]): Person[] {
    return people
}

/**
 * Generate age-specific items for "Always Needed Items" section
 */
export function generateAlwaysNeededAgeSpecificItems(people: Person[]): Item[] {
    const items: Item[] = []

    // Baby (0-1 years) items
    const babies = filterByAgeRange(people, 'Baby')
    if (babies.length > 0) {
        items.push(
            { text: 'Nappies (pack/supply)', personSelections: createPersonSelections(people, babies) },
            { text: 'Baby wipes', personSelections: createPersonSelections(people, babies) },
            { text: 'Nappy bags', personSelections: createPersonSelections(people, babies) },
            { text: 'Change mat', personSelections: createPersonSelections(people, babies) },
            { text: 'Bibs', personSelections: createPersonSelections(people, babies) },
            { text: 'Muslins/Burp cloths', personSelections: createPersonSelections(people, babies) },
            { text: 'Bottles (if bottle feeding)', personSelections: createPersonSelections(people, babies) },
            { text: 'Formula/Baby food', personSelections: createPersonSelections(people, babies) },
            { text: 'Dummy/Pacifier (if used)', personSelections: createPersonSelections(people, babies) },
            { text: 'Spare clothes (×3-4 sets)', personSelections: createPersonSelections(people, babies) }
        )
    }

    // Toddler (1-3 years) items
    const toddlers = filterByAgeRange(people, 'Toddler')
    if (toddlers.length > 0) {
        items.push(
            { text: 'Pull-ups/Toddler nappies', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Potty (travel potty)', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Wipes', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Spare clothes (×2-3 sets)', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Sippy cup/Toddler cup', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Toddler snacks', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Comfort item (teddy/blanket)', personSelections: createPersonSelections(people, toddlers) }
        )
    }

    // Child (3-12 years) items
    const children = filterByAgeRange(people, 'Child')
    if (children.length > 0) {
        items.push(
            { text: 'Entertainment (books/small toys)', personSelections: createPersonSelections(people, children) },
            { text: 'Playing cards/Travel games', personSelections: createPersonSelections(people, children) }
        )
    }

    // Teenager (12-17 years) items
    const teenagers = filterByAgeRange(people, 'Teenager')
    if (teenagers.length > 0) {
        items.push(
            { text: 'Headphones', personSelections: createPersonSelections(people, teenagers) },
            { text: 'Phone charger', personSelections: createPersonSelections(people, teenagers) }
        )
    }

    return items
}

/**
 * Generate age-specific items for overnight stays
 */
export function generateOvernightAgeSpecificItems(people: Person[]): Item[] {
    const items: Item[] = []

    // Baby (0-1 years) items
    const babies = filterByAgeRange(people, 'Baby')
    if (babies.length > 0) {
        items.push(
            { text: 'Baby monitor', personSelections: createPersonSelections(people, babies) },
            { text: 'Nightlight', personSelections: createPersonSelections(people, babies) },
            { text: 'Baby sleeping bag/Swaddle', personSelections: createPersonSelections(people, babies) },
            { text: 'Extra bedding/sheets', personSelections: createPersonSelections(people, babies) },
            { text: 'Bedtime bottle', personSelections: createPersonSelections(people, babies) }
        )
    }

    // Toddler (1-3 years) items
    const toddlers = filterByAgeRange(people, 'Toddler')
    if (toddlers.length > 0) {
        items.push(
            { text: 'Bedtime books', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Night nappy/Pull-up', personSelections: createPersonSelections(people, toddlers) }
        )
    }

    // Child (3-12 years) items
    const children = filterByAgeRange(people, 'Child')
    if (children.length > 0) {
        items.push(
            { text: 'Favorite toy/Stuffed animal', personSelections: createPersonSelections(people, children) },
            { text: 'Flashlight', personSelections: createPersonSelections(people, children) }
        )
    }

    // Teenager (12-17 years) items
    const teenagers = filterByAgeRange(people, 'Teenager')
    if (teenagers.length > 0) {
        items.push(
            { text: 'Personal care items (face wash, etc.)', personSelections: createPersonSelections(people, teenagers) }
        )
    }

    return items
}

/**
 * Generate age-specific items for swimming activities
 */
export function generateSwimmingAgeSpecificItems(people: Person[]): Item[] {
    const items: Item[] = []

    // Baby (0-1 years) items
    const babies = filterByAgeRange(people, 'Baby')
    if (babies.length > 0) {
        items.push(
            { text: 'Baby swim nappy', personSelections: createPersonSelections(people, babies) },
            { text: 'Baby float/Swim seat', personSelections: createPersonSelections(people, babies) },
            { text: 'Baby sun hat with neck protection', personSelections: createPersonSelections(people, babies) },
            { text: 'Baby rash guard/Sun suit', personSelections: createPersonSelections(people, babies) }
        )
    }

    // Toddler (1-3 years) items
    const toddlers = filterByAgeRange(people, 'Toddler')
    if (toddlers.length > 0) {
        items.push(
            { text: 'Swim nappy (if not potty trained)', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Armbands/Floaties', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Toddler sun hat', personSelections: createPersonSelections(people, toddlers) }
        )
    }

    // Child (3-12 years) items
    const children = filterByAgeRange(people, 'Child')
    if (children.length > 0) {
        items.push(
            { text: 'Swim aids (noodles, kickboard)', personSelections: createPersonSelections(people, children) }
        )
    }

    return items
}

/**
 * Generate age-specific items for hot weather
 */
export function generateHotWeatherAgeSpecificItems(people: Person[]): Item[] {
    const items: Item[] = []

    // Baby (0-1 years) items
    const babies = filterByAgeRange(people, 'Baby')
    if (babies.length > 0) {
        items.push(
            { text: 'Baby sunscreen (SPF 50+)', personSelections: createPersonSelections(people, babies) },
            { text: 'Sun protective baby clothing', personSelections: createPersonSelections(people, babies) },
            { text: 'Shade cover/Parasol for pram', personSelections: createPersonSelections(people, babies) }
        )
    }

    // Toddler (1-3 years) items
    const toddlers = filterByAgeRange(people, 'Toddler')
    if (toddlers.length > 0) {
        items.push(
            { text: 'Toddler sunscreen', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Sun protective clothing', personSelections: createPersonSelections(people, toddlers) }
        )
    }

    // Child (3-12 years) items
    const children = filterByAgeRange(people, 'Child')
    if (children.length > 0) {
        items.push(
            { text: 'Kids sunscreen', personSelections: createPersonSelections(people, children) }
        )
    }

    return items
}

/**
 * Generate age-specific items for cold weather
 */
export function generateColdWeatherAgeSpecificItems(people: Person[]): Item[] {
    const items: Item[] = []

    // Baby (0-1 years) items
    const babies = filterByAgeRange(people, 'Baby')
    if (babies.length > 0) {
        items.push(
            { text: 'Baby snowsuit/Pramsuit', personSelections: createPersonSelections(people, babies) },
            { text: 'Baby mittens', personSelections: createPersonSelections(people, babies) },
            { text: 'Baby warm hat with ear coverage', personSelections: createPersonSelections(people, babies) },
            { text: 'Blanket for carrier/pram', personSelections: createPersonSelections(people, babies) }
        )
    }

    // Toddler (1-3 years) items
    const toddlers = filterByAgeRange(people, 'Toddler')
    if (toddlers.length > 0) {
        items.push(
            { text: 'Toddler snowsuit/Winter coat', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Toddler mittens (not gloves - easier)', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Toddler warm hat', personSelections: createPersonSelections(people, toddlers) }
        )
    }

    return items
}

/**
 * Generate age-specific items for hiking
 */
export function generateHikingAgeSpecificItems(people: Person[]): Item[] {
    const items: Item[] = []

    // Baby (0-1 years) items
    const babies = filterByAgeRange(people, 'Baby')
    if (babies.length > 0) {
        items.push(
            { text: 'Baby carrier/Sling', personSelections: createPersonSelections(people, babies) }
        )
    }

    // Toddler (1-3 years) items
    const toddlers = filterByAgeRange(people, 'Toddler')
    if (toddlers.length > 0) {
        items.push(
            { text: 'Toddler reins/Backpack harness', personSelections: createPersonSelections(people, toddlers) },
            { text: 'Lightweight buggy/Stroller', personSelections: createPersonSelections(people, toddlers) }
        )
    }

    return items
}
