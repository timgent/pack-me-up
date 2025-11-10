import { PackingListQuestionSet, Person, Item } from './types';
import { generateUUID } from '../utils/uuid';
import {
    generateAlwaysNeededAgeSpecificItems,
    generateOvernightAgeSpecificItems,
    generateSwimmingAgeSpecificItems,
    generateHotWeatherAgeSpecificItems,
    generateColdWeatherAgeSpecificItems,
    generateHikingAgeSpecificItems,
    getAdults,
    getTeenagersAndAdults,
    getChildrenAndOlder,
    getToddlersAndOlder
} from './age-specific-items';

/**
 * Helper function to create an item with age-appropriate person selections
 * @param text - The item text/name
 * @param people - All people in the group
 * @param ageFilter - Optional function to filter people by age range (defaults to everyone)
 */
function item(text: string, people: Person[], ageFilter?: (p: Person[]) => Person[]): Item {
    const selectedPeople = ageFilter ? ageFilter(people) : people;
    return {
        text,
        personSelections: people.map(p => ({
            personId: p.id,
            selected: selectedPeople.some(sp => sp.id === p.id)
        }))
    };
}

export function createExampleData(people: Person[]): PackingListQuestionSet {

    return {
        _id: "1",
        people,
        alwaysNeededItems: [
            item("Day bag / Backpack", people, getChildrenAndOlder),
            item("Snacks", people),
            item("Water bottle", people, getToddlersAndOlder),
            ...generateAlwaysNeededAgeSpecificItems(people)
        ],
        questions: [
            {
                id: generateUUID(),
                type: "saved",
                text: "Will you be staying overnight?",
                order: 0,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: [
                            item("Toothbrush", people, getToddlersAndOlder),
                            item("Toothpaste", people, getAdults),
                            item("Deodorant", people, getTeenagersAndAdults),
                            item("Phone Charger", people, getTeenagersAndAdults),
                            item("Passport/ID", people, getAdults),
                            item("Pajamas", people),
                            item("Toiletries bag", people, getTeenagersAndAdults),
                            item("Underwear", people, getToddlersAndOlder),
                            item("Socks", people),
                            item("T-shirt/Top", people),
                            item("Trousers/Shorts", people),
                            ...generateOvernightAgeSpecificItems(people)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "No",
                        order: 1,
                        items: []
                    }
                ]
            },
            {
                id: generateUUID(),
                type: "saved",
                text: "Are you self-catering?",
                order: 1,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: [
                            item("Dish soap and sponge", people, getAdults),
                            item("Dishwasher tablets", people, getAdults),
                            item("Tea towels", people, getAdults),
                            item("Shopping bags", people, getAdults)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "No",
                        order: 1,
                        items: []
                    }
                ]
            },
            {
                id: generateUUID(),
                type: "saved",
                text: "What activities will you be doing?",
                order: 2,
                questionType: "multiple-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Swimming",
                        order: 0,
                        items: [
                            item("Swimsuit", people, getToddlersAndOlder),
                            item("Swim towel", people),
                            item("Goggles", people, getChildrenAndOlder),
                            item("Swim cap", people, getChildrenAndOlder),
                            ...generateSwimmingAgeSpecificItems(people)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Watersports",
                        order: 1,
                        items: [
                            item("Wetsuit", people, getTeenagersAndAdults),
                            item("Water shoes", people, getTeenagersAndAdults),
                            item("Waterproof bag", people, getTeenagersAndAdults),
                            item("Rash guard", people, getTeenagersAndAdults)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Cycling",
                        order: 2,
                        items: [
                            item("Cycling shorts", people, getTeenagersAndAdults),
                            item("Helmet", people, getTeenagersAndAdults),
                            item("Water bottle", people, getTeenagersAndAdults),
                            item("Bike repair kit", people, getTeenagersAndAdults),
                            item("Cycling gloves", people, getTeenagersAndAdults)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Running",
                        order: 3,
                        items: [
                            item("Running shoes", people, getTeenagersAndAdults),
                            item("Running clothes", people, getTeenagersAndAdults),
                            item("Sports watch", people, getTeenagersAndAdults),
                            item("Running socks", people, getTeenagersAndAdults)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Climbing",
                        order: 4,
                        items: [
                            item("Climbing shoes", people, getTeenagersAndAdults),
                            item("Chalk bag", people, getTeenagersAndAdults),
                            item("Harness", people, getTeenagersAndAdults),
                            item("Climbing gloves", people, getTeenagersAndAdults),
                            item("Belay device", people, getTeenagersAndAdults)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Hiking",
                        order: 5,
                        items: [
                            item("Hiking boots", people, getChildrenAndOlder),
                            item("Daypack/Backpack", people, getTeenagersAndAdults),
                            item("Walking poles", people, getAdults),
                            item("Trail map", people, getAdults),
                            item("First aid kit", people, getAdults),
                            ...generateHikingAgeSpecificItems(people)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Formal occasions",
                        order: 6,
                        items: [
                            item("Formal outfit", people),
                            item("Dress shoes", people, getToddlersAndOlder),
                            item("Accessories (watch, jewelry, etc.)", people, getTeenagersAndAdults),
                            item("Evening bag/Clutch", people, getTeenagersAndAdults)
                        ]
                    }
                ]
            },
            {
                id: generateUUID(),
                type: "saved",
                text: "What weather do you expect?",
                order: 3,
                questionType: "multiple-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Hot",
                        order: 0,
                        items: [
                            item("Sunscreen", people),
                            item("Sun hat", people),
                            item("Sunglasses", people, getChildrenAndOlder),
                            item("Light, breathable clothing", people),
                            item("Sandals", people, getToddlersAndOlder),
                            ...generateHotWeatherAgeSpecificItems(people)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Rain",
                        order: 1,
                        items: [
                            item("Raincoat", people),
                            item("Umbrella", people),
                            item("Waterproof shoes/boots", people),
                            item("Waterproof bag cover", people)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Warm",
                        order: 2,
                        items: [
                            item("Light jacket", people),
                            item("Comfortable layers", people),
                            item("Long-sleeved shirts", people),
                            item("Comfortable walking shoes", people)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Cold",
                        order: 3,
                        items: [
                            item("Winter coat", people),
                            item("Gloves", people),
                            item("Scarf", people),
                            item("Warm hat/Beanie", people),
                            item("Thermal underwear", people),
                            item("Warm boots", people),
                            ...generateColdWeatherAgeSpecificItems(people)
                        ]
                    }
                ]
            }
        ]
    };
}

// Helper function to create people for examples
function createExamplePeople(count: number): Person[] {
    return Array.from({ length: count }, (_, i) => ({
        id: generateUUID(),
        name: i === 0 ? "Me" : `Person ${i + 1}`,
        ageRange: undefined
    }));
}

export const exampleData = {
    "Basic packing list for 1": createExampleData(createExamplePeople(1)),
    "Basic packing list for 2": createExampleData(createExamplePeople(2)),
    "Basic packing list for 3": createExampleData(createExamplePeople(3)),
    "Basic packing list for 4": createExampleData(createExamplePeople(4)),
    "Basic packing list for 5": createExampleData(createExamplePeople(5)),
}; 