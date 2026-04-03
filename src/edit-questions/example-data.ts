import { PackingListQuestionSet, Person, Item } from './types';
import { generateUUID } from '../utils/uuid';

export const ACTIVITY_OPTION_IDS = {
    swimming: 'activity-option-swimming',
    watersports: 'activity-option-watersports',
    cycling: 'activity-option-cycling',
    running: 'activity-option-running',
    climbing: 'activity-option-climbing',
    hiking: 'activity-option-hiking',
    formalOccasions: 'activity-option-formal-occasions',
} as const
import {
    getBabies,
    getToddlers,
    getChildren,
    getTeenagers,
    getAdults,
    getTeenagersAndAdults,
    getChildrenAndOlder,
    getToddlersAndOlder,
    getFemaleTeenagersAndAdults,
    getMaleTeenagersAndAdults,
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

export function createExampleData(people: Person[], selectedActivityIds: string[] = []): PackingListQuestionSet {
    const validActivityIds = Object.values(ACTIVITY_OPTION_IDS) as string[]
    const validSelectedIds = selectedActivityIds.filter(id => validActivityIds.includes(id))
    const activitiesQuestionId = generateUUID()

    const allActivityOptions = [
        {
            id: ACTIVITY_OPTION_IDS.swimming,
            text: "Swimming",
            order: 0,
            items: [
                item("Swimsuit", people, getToddlersAndOlder),
                item("Sports bra", people, getFemaleTeenagersAndAdults),
                item("Swim towel", people),
                item("Goggles", people, getChildrenAndOlder),
                item("Swim cap", people, getChildrenAndOlder),
                // Baby items
                item("Baby swim nappy", people, getBabies),
                item("Baby float/Swim seat", people, getBabies),
                item("Baby sun hat with neck protection", people, getBabies),
                item("Baby rash guard/Sun suit", people, getBabies),
                // Toddler items
                item("Swim nappy (if not potty trained)", people, getToddlers),
                item("Armbands/Floaties", people, getToddlers),
                item("Toddler sun hat", people, getToddlers),
                // Child items
                item("Swim aids (noodles, kickboard)", people, getChildren)
            ]
        },
        {
            id: ACTIVITY_OPTION_IDS.watersports,
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
            id: ACTIVITY_OPTION_IDS.cycling,
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
            id: ACTIVITY_OPTION_IDS.running,
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
            id: ACTIVITY_OPTION_IDS.climbing,
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
            id: ACTIVITY_OPTION_IDS.hiking,
            text: "Hiking",
            order: 5,
            items: [
                item("Hiking boots", people, getChildrenAndOlder),
                item("Daypack/Backpack", people, getTeenagersAndAdults),
                item("Walking poles", people, getAdults),
                item("Trail map", people, getAdults),
                item("First aid kit", people, getAdults),
                // Baby items
                item("Baby carrier/Sling", people, getBabies),
                // Toddler items
                item("Toddler reins/Backpack harness", people, getToddlers),
                item("Lightweight buggy/Stroller", people, getToddlers)
            ]
        },
        {
            id: ACTIVITY_OPTION_IDS.formalOccasions,
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

    const activityOptions = validSelectedIds.length > 0
        ? allActivityOptions.filter(opt => validSelectedIds.includes(opt.id))
        : allActivityOptions

    return {
        _id: "1",
        people,
        alwaysNeededItems: [
            item("Day bag / Backpack", people, getChildrenAndOlder),
            item("Snacks", people),
            item("Water bottle", people, getToddlersAndOlder),
            // Baby items
            item("Nappies (pack/supply)", people, getBabies),
            item("Baby wipes", people, getBabies),
            item("Nappy bags", people, getBabies),
            item("Change mat", people, getBabies),
            item("Bibs", people, getBabies),
            item("Muslins/Burp cloths", people, getBabies),
            item("Bottles (if bottle feeding)", people, getBabies),
            item("Formula/Baby food", people, getBabies),
            item("Dummy/Pacifier (if used)", people, getBabies),
            item("Spare clothes (×3-4 sets)", people, getBabies),
            // Toddler items
            item("Pull-ups/Toddler nappies", people, getToddlers),
            item("Potty (travel potty)", people, getToddlers),
            item("Wipes", people, getToddlers),
            item("Spare clothes (×2-3 sets)", people, getToddlers),
            item("Sippy cup/Toddler cup", people, getToddlers),
            item("Toddler snacks", people, getToddlers),
            item("Comfort item (teddy/blanket)", people, getToddlers),
            // Child items
            item("Entertainment (books/small toys)", people, getChildren),
            item("Playing cards/Travel games", people, getChildren),
            // Teenager items
            item("Headphones", people, getTeenagers),
            item("Phone charger", people, getTeenagers)
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
                            item("Menstrual products", people, getFemaleTeenagersAndAdults),
                            item("Shaving kit", people, getMaleTeenagersAndAdults),
                            item("Underwear", people, getToddlersAndOlder),
                            item("Socks", people),
                            item("T-shirt/Top", people),
                            item("Trousers/Shorts", people),
                            // Baby items
                            item("Baby monitor", people, getBabies),
                            item("Nightlight", people, getBabies),
                            item("Baby sleeping bag/Swaddle", people, getBabies),
                            item("Extra bedding/sheets", people, getBabies),
                            item("Bedtime bottle", people, getBabies),
                            // Toddler items
                            item("Bedtime books", people, getToddlers),
                            item("Night nappy/Pull-up", people, getToddlers),
                            // Child items
                            item("Favorite toy/Stuffed animal", people, getChildren),
                            item("Flashlight", people, getChildren),
                            // Teenager items
                            item("Personal care items (face wash, etc.)", people, getTeenagers)
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
                id: activitiesQuestionId,
                type: "saved",
                text: "What activities will you be doing?",
                order: 2,
                questionType: "multiple-choice",
                options: activityOptions
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
                            // Baby items
                            item("Baby sunscreen (SPF 50+)", people, getBabies),
                            item("Sun protective baby clothing", people, getBabies),
                            item("Shade cover/Parasol for pram", people, getBabies),
                            // Toddler items
                            item("Toddler sunscreen", people, getToddlers),
                            item("Sun protective clothing", people, getToddlers),
                            // Child items
                            item("Kids sunscreen", people, getChildren)
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
                            // Baby items
                            item("Baby snowsuit/Pramsuit", people, getBabies),
                            item("Baby mittens", people, getBabies),
                            item("Baby warm hat with ear coverage", people, getBabies),
                            item("Blanket for carrier/pram", people, getBabies),
                            // Toddler items
                            item("Toddler snowsuit/Winter coat", people, getToddlers),
                            item("Toddler mittens (not gloves - easier)", people, getToddlers),
                            item("Toddler warm hat", people, getToddlers)
                        ]
                    }
                ]
            }
        ]
    };
}
