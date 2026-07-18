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
    religiousSites: 'activity-option-religious-sites',
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
    AgeRangeFilter,
} from './age-specific-items';
import { getDogs, getCats, getPets, getHumans } from './pet-specific-items';

/**
 * Helper function to create an item with age-appropriate person selections
 * @param text - The item text/name
 * @param people - All people in the group
 * @param ageFilter - Optional function to filter people (defaults to all humans).
 *   Defaulting to humans (rather than everyone) keeps pets from inheriting
 *   human items; it's a no-op for groups with no pets.
 */
function item(text: string, people: Person[], ageFilter?: (p: Person[]) => Person[]): Item {
    const selectedPeople = ageFilter ? ageFilter(people) : getHumans(people);
    const ageRanges = ageFilter && 'ageRanges' in ageFilter
        ? [...(ageFilter as AgeRangeFilter).ageRanges]
        : undefined;
    return {
        text,
        ...(ageRanges ? { ageRanges } : {}),
        personSelections: people.map(p => ({
            personId: p.id,
            selected: selectedPeople.some(sp => sp.id === p.id)
        }))
    };
}

/**
 * Like `item`, but packed once for the whole group. The person selections
 * become a trigger: the item is included when at least one selected person
 * is on the trip (e.g. a litter tray only when the cat is coming).
 */
function communalItem(text: string, people: Person[], ageFilter?: (p: Person[]) => Person[]): Item {
    return { ...item(text, people, ageFilter), communal: true };
}

function items(...args: Item[]): Item[] {
    return args.filter(i => i.personSelections.some(ps => ps.selected));
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
            items: items(
                item("Swimsuit", people, getToddlersAndOlder),
                item("Swim towel", people),
                item("Goggles", people, getChildrenAndOlder),
                item("Swim cap", people, getChildrenAndOlder),
                item("Baby swim nappy", people, getBabies),
                item("Baby float/Swim seat", people, getBabies),
                item("Baby sun hat with neck protection", people, getBabies),
                item("Baby rash guard/Sun suit", people, getBabies),
                item("Swim nappy (if not potty trained)", people, getToddlers),
                item("Armbands/Floaties", people, getToddlers),
                item("Toddler sun hat", people, getToddlers),
                item("Swim aids (noodles, kickboard)", people, getChildren),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.watersports,
            text: "Watersports",
            order: 1,
            items: items(
                item("Wetsuit", people, getTeenagersAndAdults),
                item("Water shoes", people, getTeenagersAndAdults),
                item("Waterproof bag", people, getTeenagersAndAdults),
                item("Rash guard", people, getTeenagersAndAdults),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.cycling,
            text: "Cycling",
            order: 2,
            items: items(
                item("Cycling shorts", people, getTeenagersAndAdults),
                item("Sports bra", people, getFemaleTeenagersAndAdults),
                item("Helmet", people, getTeenagersAndAdults),
                item("Water bottle", people, getTeenagersAndAdults),
                item("Bike repair kit", people, getTeenagersAndAdults),
                item("Cycling gloves", people, getTeenagersAndAdults),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.running,
            text: "Running",
            order: 3,
            items: items(
                item("Running shoes", people, getTeenagersAndAdults),
                item("Running clothes", people, getTeenagersAndAdults),
                item("Sports bra", people, getFemaleTeenagersAndAdults),
                item("Sports watch", people, getTeenagersAndAdults),
                item("Running socks", people, getTeenagersAndAdults),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.climbing,
            text: "Climbing",
            order: 4,
            items: items(
                item("Climbing shoes", people, getTeenagersAndAdults),
                item("Sports bra", people, getFemaleTeenagersAndAdults),
                item("Chalk bag", people, getTeenagersAndAdults),
                item("Harness", people, getTeenagersAndAdults),
                item("Climbing gloves", people, getTeenagersAndAdults),
                item("Belay device", people, getTeenagersAndAdults),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.hiking,
            text: "Hiking",
            order: 5,
            items: items(
                item("Hiking boots", people, getChildrenAndOlder),
                item("Sports bra", people, getFemaleTeenagersAndAdults),
                item("Daypack/Backpack", people, getTeenagersAndAdults),
                item("Walking poles", people, getAdults),
                item("Trail map", people, getAdults),
                communalItem("First aid kit", people, getAdults),
                item("Baby carrier/Sling", people, getBabies),
                item("Toddler reins/Backpack harness", people, getToddlers),
                item("Lightweight buggy/Stroller", people, getToddlers),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.formalOccasions,
            text: "Formal occasions",
            order: 6,
            items: items(
                item("Formal outfit", people),
                item("Dress shoes", people, getToddlersAndOlder),
                item("Accessories (watch, jewelry, etc.)", people, getTeenagersAndAdults),
                item("Evening bag/Clutch", people, getTeenagersAndAdults),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.religiousSites,
            text: "Visiting religious/sacred sites",
            order: 7,
            items: items(
                item("Scarf/shawl (for covering shoulders/head)", people, getChildrenAndOlder),
                item("Top with sleeves (covers shoulders)", people, getChildrenAndOlder),
                item("Long trousers/skirt (knee-length or longer)", people, getChildrenAndOlder),
                item("Easy-to-remove shoes", people, getToddlersAndOlder),
                item("Socks (for bare-shoe areas)", people, getToddlersAndOlder),
            )
        }
    ]

    const activityOptions = validSelectedIds.length > 0
        ? allActivityOptions.filter(opt => validSelectedIds.includes(opt.id))
        : allActivityOptions

    return {
        _id: "1",
        people,
        alwaysNeededItems: items(
            item("Day bag / Backpack", people, getChildrenAndOlder),
            item("Snacks", people),
            item("Water bottle", people, getToddlersAndOlder),
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
            item("Pull-ups/Toddler nappies", people, getToddlers),
            item("Potty (travel potty)", people, getToddlers),
            item("Wipes", people, getToddlers),
            item("Spare clothes (×2-3 sets)", people, getToddlers),
            item("Sippy cup/Toddler cup", people, getToddlers),
            item("Toddler snacks", people, getToddlers),
            item("Comfort item (teddy/blanket)", people, getToddlers),
            item("Entertainment (books/small toys)", people, getChildren),
            communalItem("Playing cards/Travel games", people, getChildren),
            item("Headphones", people, getTeenagers),
            item("Phone charger", people, getTeenagers),
            communalItem("First aid kit", people),
            communalItem("Plasters / Band-aids", people),
            communalItem("Pain relief (paracetamol / ibuprofen)", people, getAdults),
            // Pet items — only appear when a matching pet is in the group
            communalItem("Pet food", people, getPets),
            communalItem("Food & water bowls", people, getPets),
            item("Pet bed/blanket", people, getPets),
            item("Pet medication", people, getPets),
            item("Vaccination/health records", people, getPets),
            item("Lead/Leash", people, getDogs),
            item("Collar & ID tag", people, getDogs),
            item("Poop bags", people, getDogs),
            item("Dog toy", people, getDogs),
            communalItem("Litter tray & litter", people, getCats),
            item("Cat carrier", people, getCats),
            item("Scratching pad", people, getCats),
        ),
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
                        items: items(
                            item("Toothbrush", people, getToddlersAndOlder),
                            communalItem("Toothpaste", people, getAdults),
                            item("Deodorant", people, getTeenagersAndAdults),
                            item("Phone Charger", people, getTeenagersAndAdults),
                            item("Passport/ID", people, getAdults),
                            item("Pyjamas", people),
                            item("Toiletries bag", people, getTeenagersAndAdults),
                            item("Menstrual products", people, getFemaleTeenagersAndAdults),
                            item("Bra", people, getFemaleTeenagersAndAdults),
                            item("Shaving kit", people, getMaleTeenagersAndAdults),
                            item("Underwear", people, getToddlersAndOlder),
                            item("Socks", people),
                            item("T-shirt/Top", people),
                            item("Trousers/Shorts", people),
                            item("Jumper", people),
                            item("Baby monitor", people, getBabies),
                            item("Nightlight", people, getBabies),
                            item("Baby sleeping bag/Swaddle", people, getBabies),
                            item("Extra bedding/sheets", people, getBabies),
                            item("Bedtime bottle", people, getBabies),
                            item("Bedtime books", people, getToddlers),
                            item("Night nappy/Pull-up", people, getToddlers),
                            item("Favorite toy/Stuffed animal", people, getChildren),
                            item("Flashlight", people, getChildren),
                            item("Personal care items (face wash, etc.)", people, getTeenagers),
                        )
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
                text: "Are you travelling abroad?",
                order: 1,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: items(
                            item("Passport", people),
                            communalItem("Travel insurance documents", people, getAdults),
                            item("Visa", people, getAdults),
                            item("Local currency", people, getAdults),
                            communalItem("Travel adapter", people, getAdults),
                            item("Copies of important documents", people, getAdults),
                            item("EHIC/GHIC card", people, getAdults),
                            item("Pet passport/Animal health certificate", people, getPets),
                        )
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
                order: 2,
                questionType: "single-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Yes",
                        order: 0,
                        items: items(
                            item("Dish soap and sponge", people, getAdults),
                            item("Dishwasher tablets", people, getAdults),
                            item("Tea towels", people, getAdults),
                            item("Shopping bags", people, getAdults),
                        )
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
                order: 3,
                questionType: "multiple-choice",
                options: activityOptions
            },
            {
                id: generateUUID(),
                type: "saved",
                text: "What weather do you expect?",
                order: 4,
                questionType: "multiple-choice",
                options: [
                    {
                        id: generateUUID(),
                        text: "Hot",
                        order: 0,
                        items: items(
                            item("Sunscreen", people),
                            item("Sun hat", people),
                            item("Sunglasses", people, getChildrenAndOlder),
                            item("Light, breathable clothing", people),
                            item("Sandals", people, getToddlersAndOlder),
                            item("Baby sunscreen (SPF 50+)", people, getBabies),
                            item("Sun protective baby clothing", people, getBabies),
                            item("Shade cover/Parasol for pram", people, getBabies),
                            item("Toddler sunscreen", people, getToddlers),
                            item("Sun protective clothing", people, getToddlers),
                            item("Kids sunscreen", people, getChildren),
                        )
                    },
                    {
                        id: generateUUID(),
                        text: "Rain",
                        order: 1,
                        items: items(
                            item("Raincoat", people),
                            item("Umbrella", people),
                            item("Waterproof shoes/boots", people),
                            item("Waterproof bag cover", people),
                        )
                    },
                    {
                        id: generateUUID(),
                        text: "Warm",
                        order: 2,
                        items: items(
                            item("Light jacket", people),
                            item("Comfortable layers", people),
                            item("Long-sleeved shirts", people),
                            item("Comfortable walking shoes", people),
                        )
                    },
                    {
                        id: generateUUID(),
                        text: "Cold",
                        order: 3,
                        items: items(
                            item("Winter coat", people),
                            item("Gloves", people),
                            item("Scarf", people),
                            item("Warm hat/Beanie", people),
                            item("Thermal underwear", people),
                            item("Warm boots", people),
                            item("Baby snowsuit/Pramsuit", people, getBabies),
                            item("Baby mittens", people, getBabies),
                            item("Baby warm hat with ear coverage", people, getBabies),
                            item("Blanket for carrier/pram", people, getBabies),
                            item("Toddler snowsuit/Winter coat", people, getToddlers),
                            item("Toddler mittens (not gloves - easier)", people, getToddlers),
                            item("Toddler warm hat", people, getToddlers),
                        )
                    }
                ]
            }
        ]
    };
}
