import { PackingListQuestionSet, Person } from './types';
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

export function createExampleData(people: Person[]): PackingListQuestionSet {

    return {
        _id: "1",
        people,
        alwaysNeededItems: [
            {
                text: "Day bag / Backpack",
                personSelections: people.map(p => ({ personId: p.id, selected: getChildrenAndOlder(people).some(person => person.id === p.id) }))
            },
            {
                text: "Snacks",
                personSelections: people.map(p => ({ personId: p.id, selected: true }))
            },
            {
                text: "Water bottle",
                personSelections: people.map(p => ({ personId: p.id, selected: getToddlersAndOlder(people).some(person => person.id === p.id) }))
            },
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
                            {
                                text: "Toothbrush",
                                personSelections: people.map(p => ({ personId: p.id, selected: getToddlersAndOlder(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Toothpaste",
                                personSelections: people.map(p => ({ personId: p.id, selected: getAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Deodorant",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Phone Charger",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Passport/ID",
                                personSelections: people.map(p => ({ personId: p.id, selected: getAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Pajamas",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Toiletries bag",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Underwear",
                                personSelections: people.map(p => ({ personId: p.id, selected: getToddlersAndOlder(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Socks",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "T-shirt/Top",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Trousers/Shorts",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
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
                            {
                                text: "Dish soap and sponge",
                                personSelections: people.map(p => ({ personId: p.id, selected: getAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Dishwasher tablets",
                                personSelections: people.map(p => ({ personId: p.id, selected: getAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Tea towels",
                                personSelections: people.map(p => ({ personId: p.id, selected: getAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Shopping bags",
                                personSelections: people.map(p => ({ personId: p.id, selected: getAdults(people).some(person => person.id === p.id) }))
                            }
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
                            {
                                text: "Swimsuit",
                                personSelections: people.map(p => ({ personId: p.id, selected: getToddlersAndOlder(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Swim towel",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Goggles",
                                personSelections: people.map(p => ({ personId: p.id, selected: getChildrenAndOlder(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Swim cap",
                                personSelections: people.map(p => ({ personId: p.id, selected: getChildrenAndOlder(people).some(person => person.id === p.id) }))
                            },
                            ...generateSwimmingAgeSpecificItems(people)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Watersports",
                        order: 1,
                        items: [
                            {
                                text: "Wetsuit",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Water shoes",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Waterproof bag",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Rash guard",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Cycling",
                        order: 2,
                        items: [
                            {
                                text: "Cycling shorts",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Helmet",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Water bottle",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Bike repair kit",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Cycling gloves",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Running",
                        order: 3,
                        items: [
                            {
                                text: "Running shoes",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Running clothes",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Sports watch",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Running socks",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Climbing",
                        order: 4,
                        items: [
                            {
                                text: "Climbing shoes",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Chalk bag",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Harness",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Climbing gloves",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Belay device",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Hiking",
                        order: 5,
                        items: [
                            {
                                text: "Hiking boots",
                                personSelections: people.map(p => ({ personId: p.id, selected: getChildrenAndOlder(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Daypack/Backpack",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Walking poles",
                                personSelections: people.map(p => ({ personId: p.id, selected: getAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Trail map",
                                personSelections: people.map(p => ({ personId: p.id, selected: getAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "First aid kit",
                                personSelections: people.map(p => ({ personId: p.id, selected: getAdults(people).some(person => person.id === p.id) }))
                            },
                            ...generateHikingAgeSpecificItems(people)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Formal occasions",
                        order: 6,
                        items: [
                            {
                                text: "Formal outfit",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Dress shoes",
                                personSelections: people.map(p => ({ personId: p.id, selected: getToddlersAndOlder(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Accessories (watch, jewelry, etc.)",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Evening bag/Clutch",
                                personSelections: people.map(p => ({ personId: p.id, selected: getTeenagersAndAdults(people).some(person => person.id === p.id) }))
                            }
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
                            {
                                text: "Sunscreen",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Sun hat",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Sunglasses",
                                personSelections: people.map(p => ({ personId: p.id, selected: getChildrenAndOlder(people).some(person => person.id === p.id) }))
                            },
                            {
                                text: "Light, breathable clothing",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Sandals",
                                personSelections: people.map(p => ({ personId: p.id, selected: getToddlersAndOlder(people).some(person => person.id === p.id) }))
                            },
                            ...generateHotWeatherAgeSpecificItems(people)
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Rain",
                        order: 1,
                        items: [
                            {
                                text: "Raincoat",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Umbrella",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Waterproof shoes/boots",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Waterproof bag cover",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Warm",
                        order: 2,
                        items: [
                            {
                                text: "Light jacket",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Comfortable layers",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Long-sleeved shirts",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Comfortable walking shoes",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Cold",
                        order: 3,
                        items: [
                            {
                                text: "Winter coat",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Gloves",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Scarf",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Warm hat/Beanie",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Thermal underwear",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Warm boots",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
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