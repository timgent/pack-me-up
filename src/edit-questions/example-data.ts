import { PackingListQuestionSet } from './types';
import { generateUUID } from '../utils/uuid';

function createExampleData(numPeople: number): PackingListQuestionSet {
    const people = Array.from({ length: numPeople }, (_, i) => ({
        id: generateUUID(),
        name: i === 0 ? "Me" : `Person ${i + 1}`
    }));

    return {
        _id: "1",
        people,
        alwaysNeededItems: [
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
            }
        ],
        questions: [
            {
                id: generateUUID(),
                type: "saved",
                text: "What type of trip is this?",
                order: 0,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Beach Vacation",
                        order: 0,
                        items: [
                            {
                                text: "Swimsuit",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Beach Towel",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Beach Bag",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "City Break",
                        order: 1,
                        items: [
                            {
                                text: "Comfortable Walking Shoes",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "City Map/Guide",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Mountain/Hiking Trip",
                        order: 2,
                        items: [
                            {
                                text: "Hiking Boots",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Hiking Poles",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Business Trip",
                        order: 3,
                        items: [
                            {
                                text: "Business Suit",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Business Cards",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Camping Trip",
                        order: 4,
                        items: [
                            {
                                text: "Tent",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Sleeping Bag",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Cruise",
                        order: 5,
                        items: [
                            {
                                text: "Formal Evening Wear",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Cruise Card Holder",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Road Trip",
                        order: 6,
                        items: [
                            {
                                text: "Car Phone Charger",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Road Atlas",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    }
                ]
            },
            {
                id: generateUUID(),
                type: "saved",
                text: "Will it be hot?",
                order: 1,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: [
                            {
                                text: "Lightweight, breathable clothing",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Sun hat",
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
                text: "Will it be cold?",
                order: 2,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: [
                            {
                                text: "Warm jacket",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Thermal underwear",
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
                text: "Will it rain?",
                order: 3,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: [
                            {
                                text: "Waterproof jacket",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Umbrella",
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
                text: "What type of accommodation?",
                order: 4,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Hotel",
                        order: 0,
                        items: []
                    },
                    {
                        id: generateUUID(),
                        text: "Hostel",
                        order: 1,
                        items: [
                            {
                                text: "Padlock for lockers",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Earplugs",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Airbnb/Apartment",
                        order: 2,
                        items: [
                            {
                                text: "Basic cooking utensils",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Groceries list",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Camping",
                        order: 3,
                        items: [
                            {
                                text: "Sleeping bag",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Camping stove",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    }
                ]
            },
            {
                id: generateUUID(),
                type: "saved",
                text: "Will you swim?",
                order: 5,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: [
                            {
                                text: "Swimwear",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Goggles",
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
                text: "Will you visit religious sites?",
                order: 6,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: [
                            {
                                text: "Modest clothing",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Head covering",
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
                text: "Will you go to fancy restaurants?",
                order: 7,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: [
                            {
                                text: "Dress shoes",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Formal attire",
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
                text: "What's your trip duration?",
                order: 8,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Weekend (1-3 days)",
                        order: 0,
                        items: [
                            {
                                text: "Small backpack",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Short Trip (4-7 days)",
                        order: 1,
                        items: [
                            {
                                text: "Medium suitcase",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Medium Trip (8-14 days)",
                        order: 2,
                        items: [
                            {
                                text: "Large suitcase",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Long Trip (15+ days)",
                        order: 3,
                        items: [
                            {
                                text: "Laundry supplies",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    }
                ]
            },
            {
                id: generateUUID(),
                type: "saved",
                text: "What's your travel style?",
                order: 9,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Backpacking/Budget",
                        order: 0,
                        items: [
                            {
                                text: "Money belt",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Quick-dry towel",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Standard",
                        order: 1,
                        items: []
                    },
                    {
                        id: generateUUID(),
                        text: "Luxury",
                        order: 2,
                        items: [
                            {
                                text: "Travel steamer",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "Luxury toiletries",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Minimalist",
                        order: 3,
                        items: [
                            {
                                text: "Compression packing cubes",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            }
                        ]
                    },
                    {
                        id: generateUUID(),
                        text: "Family-Friendly",
                        order: 4,
                        items: [
                            {
                                text: "Travel games",
                                personSelections: people.map(p => ({ personId: p.id, selected: true }))
                            },
                            {
                                text: "First aid kit",
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