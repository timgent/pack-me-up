import { PackingListQuestionSet } from './types';
import { generateUUID } from '../utils/uuid';

export function createExampleData(numPeople: number, names?: string[]): PackingListQuestionSet {
    const people = Array.from({ length: numPeople }, (_, i) => ({
        id: generateUUID(),
        name: names?.[i] || (i === 0 ? "Me" : `Person ${i + 1}`)
    }));

    return {
        _id: "1",
        people,
        alwaysNeededItems: [
            {
                text: "Day bag / Backpack",
                personSelections: people.map(p => ({ personId: p.id, selected: true }))
            },
            {
                text: "Snacks",
                personSelections: people.map(p => ({ personId: p.id, selected: true }))
            },
            {
                text: "Water bottle",
                personSelections: people.map(p => ({ personId: p.id, selected: true }))
            }
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
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Toothpaste",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Deodorant",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Phone Charger",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Passport/ID",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Pajamas",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Toiletries bag",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Underwear",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
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
                                text: "Food storage containers",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Dish soap and sponge",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Dishwasher tablets",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Tea towels",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Shopping bags",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
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
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Swim towel",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Goggles",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Swim cap",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Watersports",
                        order: 1,
                        items: [
                            {
                                text: "Wetsuit",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Water shoes",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Waterproof bag",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Rash guard",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
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
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Helmet",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Water bottle",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Bike repair kit",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Cycling gloves",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
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
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Running clothes",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Sports watch",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Running socks",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
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
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Chalk bag",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Harness",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Climbing gloves",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Belay device",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
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
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Daypack/Backpack",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Walking poles",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Trail map",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "First aid kit",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
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
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Accessories (watch, jewelry, etc.)",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Evening bag/Clutch",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
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
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Light, breathable clothing",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Sandals",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
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
                            }
                        ]
                    }
                ]
            }
        ]
    };
}

export const exampleData = {
    "Basic packing list for 1": createExampleData(1),
    "Basic packing list for 2": createExampleData(2),
    "Basic packing list for 3": createExampleData(3),
    "Basic packing list for 4": createExampleData(4),
    "Basic packing list for 5": createExampleData(5),
}; 