import { PackingListQuestionSet, Person, Item } from './types';
import { generateUUID } from '../utils/uuid';

export const ACTIVITY_OPTION_IDS = {
    swimming: 'activity-option-swimming',
    beach: 'activity-option-beach',
    watersports: 'activity-option-watersports',
    cycling: 'activity-option-cycling',
    running: 'activity-option-running',
    climbing: 'activity-option-climbing',
    hiking: 'activity-option-hiking',
    sightseeing: 'activity-option-sightseeing',
    skiing: 'activity-option-skiing',
    themePark: 'activity-option-theme-park',
    formalOccasions: 'activity-option-formal-occasions',
    festival: 'activity-option-festival',
} as const

// Stable IDs for the options of the other multiple-choice questions. Like the
// activity IDs, these let template-update matching find an option by id even
// after the user has renamed it — text matching is only the fallback.
export const WEATHER_OPTION_IDS = {
    hot: 'weather-option-hot',
    strongSun: 'weather-option-strong-sun',
    mild: 'weather-option-mild',
    rain: 'weather-option-rain',
    cold: 'weather-option-cold',
    snow: 'weather-option-snow',
} as const

export const TRANSPORT_OPTION_IDS = {
    flying: 'transport-option-flying',
    driving: 'transport-option-driving',
    train: 'transport-option-train',
    ferry: 'transport-option-ferry',
} as const

export const ACCOMMODATION_OPTION_IDS = {
    hotel: 'accommodation-option-hotel',
    selfCatering: 'accommodation-option-self-catering',
    someoneElsesHome: 'accommodation-option-someone-elses-home',
    camping: 'accommodation-option-camping',
    caravan: 'accommodation-option-caravan',
    cruise: 'accommodation-option-cruise',
} as const

// Stable IDs for the built-in wizard questions. Using fixed IDs (rather than
// fresh UUIDs) lets template-update detection match a user's saved question
// back to its template origin exactly, even after the question text is edited.
export const TEMPLATE_QUESTION_IDS = {
    overnight: 'template-question-overnight',
    abroad: 'template-question-abroad',
    weather: 'template-question-weather',
    transport: 'template-question-transport',
    accommodation: 'template-question-accommodation',
    activities: 'template-question-activities',
} as const

// Version of the wizard template content. Bump this whenever `createExampleData`
// changes in a way existing users should be offered (new items, options, or
// questions). A saved question set stamped with an older version triggers the
// "new suggestions" review card on My Questions & Items; the stamp is updated
// once the user reviews (applies or dismisses) the suggestions. Purely
// additive detection — bumping never removes or rewrites a user's own edits.
//
// Note: only *additions* are deliverable this way. Changes that rewrite an
// existing item (a corrected age filter, a new quantity rate, flipping an item
// to communal) reach new users only; `buildTemplateUpdateSuggestions` matches
// on item text and never rewrites what the user already has.
export const WIZARD_TEMPLATE_VERSION = 3
import {
    getBabies,
    getToddlers,
    getChildren,
    getTeenagers,
    getAdults,
    getTeenagersAndAdults,
    getChildrenAndOlder,
    getToddlersAndOlder,
    getBabiesAndToddlers,
    getUnderTeenagers,
    getFemaleTeenagersAndAdults,
    AgeRangeFilter,
} from './age-specific-items';
import { getDogs, getCats, getPets, getHumans } from './pet-specific-items';
import { CATEGORIES as C } from './item-sections';

/**
 * Helper function to create an item with age-appropriate person selections
 * @param text - The item text/name
 * @param people - All people in the group
 * @param ageFilter - Optional function to filter people (defaults to all humans).
 *   Defaulting to humans (rather than everyone) keeps pets from inheriting
 *   human items; it's a no-op for groups with no pets.
 * @param quantity - Optional rate for suggested quantities: pack `perNight`
 *   per `perNights` nights (default 1), capped at `maxQuantity`
 */
function item(
    text: string,
    people: Person[],
    ageFilter?: (p: Person[]) => Person[],
    quantity?: { perNight: number; perNights?: number; maxQuantity?: number }
): Item {
    const selectedPeople = ageFilter ? ageFilter(people) : getHumans(people);
    const ageRanges = ageFilter && 'ageRanges' in ageFilter
        ? [...(ageFilter as AgeRangeFilter).ageRanges]
        : undefined;
    return {
        text,
        ...(ageRanges ? { ageRanges } : {}),
        ...(quantity ? {
            perNight: quantity.perNight,
            ...(quantity.perNights !== undefined ? { perNights: quantity.perNights } : {}),
            ...(quantity.maxQuantity !== undefined ? { maxQuantity: quantity.maxQuantity } : {}),
        } : {}),
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
 *
 * Take care combining this with a narrow age filter: `items()` below drops any
 * item nobody is selected for, so a communal item filtered to `getAdults`
 * disappears from the question set entirely for an adult-free group. Only
 * narrow a communal item when the filter is a genuine trigger (pets, babies),
 * not when it is a guess at who packs it.
 */
function communalItem(text: string, people: Person[], ageFilter?: (p: Person[]) => Person[]): Item {
    return { ...item(text, people, ageFilter), communal: true };
}

/**
 * Stamp a category on a run of items, so one item list shows as several sections
 * on the generated packing list. Without this every item falls back to the
 * option text — or, for single-choice questions, the *question* text, which is
 * how the overnight list ended up as one 70-row card headed
 * "Will you be staying overnight?".
 *
 * For anything appearing in more than one option: use byte-identical text, which
 * is what lets `deduplicateItems` recognise the copies as one item, and give it
 * the same category in every copy — the surviving row keeps the first copy's
 * category, and there is no "larger" of two sections for the generator to pick.
 * Quantities need no such care: dedup takes the largest of the copies.
 */
function section(category: string, ...args: Item[]): Item[] {
    return args.map(i => ({ ...i, category }));
}

function items(...args: (Item | Item[])[]): Item[] {
    return args.flat().filter(i => i.personSelections.some(ps => ps.selected));
}

export function createExampleData(people: Person[], selectedActivityIds: string[] = []): PackingListQuestionSet {
    const validActivityIds = Object.values(ACTIVITY_OPTION_IDS) as string[]
    const validSelectedIds = selectedActivityIds.filter(id => validActivityIds.includes(id))
    const activitiesQuestionId = TEMPLATE_QUESTION_IDS.activities

    const allActivityOptions = [
        {
            id: ACTIVITY_OPTION_IDS.swimming,
            text: "Swimming",
            order: 0,
            items: items(
                section(C.clothes,
                    item("Swimsuit", people, getToddlersAndOlder, { perNight: 1, perNights: 4, maxQuantity: 2 }),
                    item("Baby sun hat with neck protection", people, getBabies),
                    item("Baby rash guard/Sun suit", people, getBabies),
                    item("Toddler sun hat", people, getToddlers),
                ),
                section(C.nappies,
                    item("Baby swim nappy", people, getBabies),
                    item("Swim nappy (if not potty trained)", people, getToddlers),
                ),
                section(C.kit,
                    item("Swim towel", people),
                    item("Goggles", people, getChildrenAndOlder),
                    communalItem("Wet bag", people),
                    item("Baby float/Swim seat", people, getBabies),
                    item("Armbands", people, getToddlers),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.beach,
            text: "Beach",
            order: 1,
            items: items(
                section(C.toiletries,
                    communalItem("After-sun", people),
                ),
                section(C.clothes,
                    item("Flip-flops", people, getToddlersAndOlder),
                ),
                section(C.food,
                    communalItem("Cool bag", people),
                ),
                section(C.kit,
                    item("Beach towel", people),
                    communalItem("Bucket and spade", people, getUnderTeenagers),
                    communalItem("Beach shade or windbreak", people),
                    communalItem("Beach bag", people),
                    item("Snorkel and mask", people, getChildrenAndOlder),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.watersports,
            text: "Watersports",
            order: 2,
            items: items(
                section(C.clothes,
                    item("Water shoes", people, getChildrenAndOlder),
                ),
                section(C.kit,
                    item("Wetsuit", people, getChildrenAndOlder),
                    item("Rash guard", people, getChildrenAndOlder),
                    item("Waterproof bag", people, getChildrenAndOlder),
                    item("Buoyancy aid", people, getUnderTeenagers),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.cycling,
            text: "Cycling",
            order: 3,
            items: items(
                section(C.clothes,
                    item("Cycling shorts", people, getChildrenAndOlder),
                    item("Sports bra", people, getFemaleTeenagersAndAdults),
                ),
                section(C.kit,
                    item("Helmet", people, getChildrenAndOlder),
                    communalItem("Bike repair kit", people, getTeenagersAndAdults),
                    item("Cycling gloves", people, getChildrenAndOlder),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.running,
            text: "Running",
            order: 4,
            items: items(
                section(C.kit,
                    item("Sports watch", people, getTeenagersAndAdults),
                ),
                section(C.clothes,
                    item("Running shoes", people, getChildrenAndOlder),
                    item("Running clothes", people, getChildrenAndOlder),
                    item("Sports bra", people, getFemaleTeenagersAndAdults),
                    item("Running socks", people, getChildrenAndOlder),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.climbing,
            text: "Climbing",
            order: 5,
            items: items(
                section(C.clothes,
                    item("Climbing shoes", people, getChildrenAndOlder),
                    item("Sports bra", people, getFemaleTeenagersAndAdults),
                ),
                section(C.kit,
                    item("Chalk bag", people, getChildrenAndOlder),
                    item("Harness", people, getChildrenAndOlder),
                    item("Belay device", people, getTeenagersAndAdults),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.hiking,
            text: "Hiking",
            order: 6,
            items: items(
                section(C.medical,
                    communalItem("Blister plasters", people),
                ),
                section(C.clothes,
                    item("Hiking boots", people, getChildrenAndOlder),
                    item("Sports bra", people, getFemaleTeenagersAndAdults),
                ),
                section(C.kit,
                    item("Walking poles", people, getAdults),
                    communalItem("Trail map", people, getAdults),
                    item("Toddler reins/Backpack harness", people, getToddlers),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.sightseeing,
            text: "Sightseeing and city walking",
            order: 7,
            items: items(
                section(C.dayBag,
                    item("Power bank", people, getTeenagersAndAdults),
                    communalItem("Offline maps downloaded", people, getTeenagersAndAdults),
                ),
                section(C.clothes,
                    item("Comfortable walking shoes", people, getToddlersAndOlder),
                    item("Modest clothing for religious sites (covers shoulders and knees)", people, getChildrenAndOlder),
                    item("Easy-to-remove shoes", people, getToddlersAndOlder),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.skiing,
            text: "Skiing or snowboarding",
            order: 8,
            items: items(
                section(C.dayBag,
                    communalItem("Sunscreen", people),
                    item("Lip balm with SPF", people, getChildrenAndOlder),
                ),
                section(C.clothes,
                    item("Ski jacket and salopettes", people, getToddlersAndOlder),
                    item("Thermal base layers", people, getToddlersAndOlder),
                    item("Ski socks", people, getToddlersAndOlder),
                    item("Snow boots", people, getToddlersAndOlder),
                ),
                section(C.kit,
                    item("Ski goggles", people, getToddlersAndOlder),
                    item("Ski helmet", people, getToddlersAndOlder),
                    communalItem("Hand warmers", people, getChildrenAndOlder),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.themePark,
            text: "Theme park or days out",
            order: 9,
            items: items(
                section(C.dayBag,
                    item("Power bank", people, getTeenagersAndAdults),
                    item("Poncho", people),
                    item("Ear defenders", people, getUnderTeenagers),
                ),
                section(C.clothes,
                    item("Comfortable walking shoes", people, getToddlersAndOlder),
                ),
                section(C.food,
                    communalItem("Cool bag", people),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.formalOccasions,
            text: "Formal occasions",
            order: 10,
            items: items(
                section(C.clothes,
                    item("Formal outfit", people),
                    item("Dress shoes", people, getToddlersAndOlder),
                    item("Watch", people, getTeenagersAndAdults),
                    item("Jewellery", people, getTeenagersAndAdults),
                    item("Evening bag/Clutch", people, getTeenagersAndAdults),
                ),
            )
        },
        {
            id: ACTIVITY_OPTION_IDS.festival,
            text: "Festival or live music",
            order: 11,
            items: items(
                // A festival is an activity rather than a place to stay, so it
                // combines with whichever accommodation you actually booked —
                // a tent, a campervan, or a hotel down the road.
                section(C.dayBag,
                    item("Festival tickets or wristband", people),
                    item("Bum bag or small crossbody bag", people, getChildrenAndOlder),
                    // Card readers need signal, and the signal is the first
                    // thing a field full of people takes away.
                    communalItem("Cash in small notes", people, getTeenagersAndAdults),
                    item("Power bank", people, getTeenagersAndAdults),
                    communalItem("Waterproof phone pouch", people, getTeenagersAndAdults),
                    item("Water bottle", people, getToddlersAndOlder),
                    item("Snacks", people, getToddlersAndOlder),
                    communalItem("Sunscreen", people),
                    item("Poncho", people),
                    item("Ear plugs", people, getChildrenAndOlder),
                    item("Ear defenders", people, getUnderTeenagers),
                    item("Reusable cup", people, getChildrenAndOlder),
                ),
                section(C.documents,
                    item("Photo ID", people, getTeenagersAndAdults),
                ),
                section(C.medical,
                    communalItem("Blister plasters", people),
                ),
                section(C.toiletries,
                    // Showers are a queue and the taps are cold, so this is the
                    // washbag a field needs rather than the one a bathroom does.
                    communalItem("Toilet roll", people),
                    communalItem("Wet wipes", people),
                    item("Dry shampoo", people, getTeenagersAndAdults),
                ),
                section(C.clothes,
                    item("Wellies", people, getToddlersAndOlder),
                    item("Warm layers for the evening", people),
                    item("Sunglasses", people, getChildrenAndOlder),
                    item("Fancy dress or costume", people, getChildrenAndOlder),
                ),
                section(C.food,
                    communalItem("Bin bags", people),
                ),
                section(C.kit,
                    // Tents in rows all look alike in the dark, and by then
                    // your phone is flat.
                    communalItem("Tent flag or marker", people),
                    item("Head torch", people, getChildrenAndOlder),
                    communalItem("Camp chairs", people),
                ),
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
            // The bag that stays with you. Keys and cards lead the whole list
            // because this is the "check before the door shuts" pile — and it
            // is where the phone, the snacks and the wipes belong too, however
            // little they have in common otherwise.
            section(C.dayBag,
                item("Wallet and bank cards", people, getTeenagersAndAdults),
                communalItem("House keys", people),
                item("Phone", people, getTeenagersAndAdults),
                item("Phone charger", people, getTeenagersAndAdults),
                item("Power bank", people, getTeenagersAndAdults),
                item("Headphones", people, getChildrenAndOlder),
                item("Tablet and charger", people, getChildrenAndOlder),
                communalItem("Hand sanitiser", people),
                communalItem("Tissues", people),
                item("Snacks", people, getToddlersAndOlder),
                item("Water bottle", people, getToddlersAndOlder),
                item("Colouring book and pens", people, getChildren),
                communalItem("Playing cards/Travel games", people, getChildrenAndOlder),
                item("Ear defenders", people, getUnderTeenagers),
                // The bag itself, so nobody packs a day bag's worth of things
                // and then leaves the bag at home.
                item("Day bag / Backpack", people, getChildrenAndOlder),
            ),
            section(C.documents,
                // A pet's papers are wanted at a border, so they sit with the
                // other documents rather than in Pet Care.
                item("Vaccination/health records", people, getPets),
            ),
            // Nothing here is reliably replaceable away from home.
            section(C.medical,
                item("Prescription medication", people),
                item("Glasses / contact lenses", people, getChildrenAndOlder),
                item("Contact lens solution", people, getTeenagersAndAdults),
                communalItem("First aid kit", people),
                communalItem("Plasters", people),
                communalItem("Pain relief (paracetamol / ibuprofen)", people),
                communalItem("Children's paracetamol / ibuprofen", people, getUnderTeenagers),
                communalItem("Thermometer", people),
                item("Teething gel", people, getBabies),
            ),
            section(C.clothes,
                item("Spare clothes", people, getBabies, { perNight: 1, perNights: 2, maxQuantity: 6 }),
                item("Spare clothes", people, getToddlers, { perNight: 1, perNights: 3, maxQuantity: 4 }),
            ),
            section(C.sleep,
                // A dummy is wanted on the journey as much as at bedtime, but
                // it is the comfort item that decides whether anyone sleeps, so
                // the pair stays together rather than being split by bag.
                item("Dummy (if used)", people, getBabies),
                item("Comfort item (teddy/blanket)", people, getToddlers),
            ),
            section(C.nappies,
                item("Nappies (pack/supply)", people, getBabies, { perNight: 6 }),
                communalItem("Wipes", people, getBabiesAndToddlers),
                communalItem("Nappy bags", people, getBabies),
                communalItem("Change mat", people, getBabies),
                item("Nappy cream", people, getBabies),
                item("Muslins/Burp cloths", people, getBabies),
                item("Pull-ups/Toddler nappies", people, getToddlers, { perNight: 4 }),
                communalItem("Potty (travel potty)", people, getToddlers),
            ),
            section(C.food,
                item("Bibs", people, getBabies),
                item("Bottles (if bottle feeding)", people, getBabies),
                communalItem("Bottle brush and steriliser bags", people, getBabies),
                item("Formula/Baby food", people, getBabies, { perNight: 4 }),
                item("Sippy cup/Toddler cup", people, getToddlers),
            ),
            section(C.kit,
                communalItem("Reusable bags", people),
                communalItem("Pram/Buggy", people, getBabiesAndToddlers),
                communalItem("Pram rain cover", people, getBabiesAndToddlers),
                communalItem("Baby carrier/Sling", people, getBabies),
            ),
            // Pet items — only appear when a matching pet is in the group
            section(C.pet,
                communalItem("Pet food", people, getPets),
                communalItem("Food & water bowls", people, getPets),
                communalItem("Travel water bottle and folding bowl", people, getPets),
                item("Pet bed/blanket", people, getPets),
                item("Pet medication", people, getPets),
                communalItem("Pet first aid kit", people, getPets),
                communalItem("Tick remover", people, getPets),
                communalItem("Vet contact details", people, getPets),
                item("Lead/Leash", people, getDogs),
                item("Collar & ID tag", people, getDogs),
                communalItem("Poo bags", people, getDogs),
                item("Dog toy", people, getDogs),
                item("Pet towel", people, getDogs),
                item("Dog travel harness or crate", people, getDogs),
                communalItem("Litter tray & litter", people, getCats),
                item("Cat carrier", people, getCats),
            ),
        ),
        questions: [
            {
                id: TEMPLATE_QUESTION_IDS.overnight,
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
                            section(C.toiletries,
                                item("Toothbrush", people, getToddlersAndOlder),
                                communalItem("Toothpaste", people),
                                communalItem("Shampoo", people),
                                communalItem("Shower gel", people),
                                item("Hairbrush/Comb", people, getChildrenAndOlder),
                                item("Deodorant", people, getChildrenAndOlder),
                                item("Toiletries bag", people, getChildrenAndOlder),
                                item("Face wash", people, getChildrenAndOlder),
                                item("Skincare products", people, getTeenagers),
                                item("Razor / shaving kit", people, getTeenagersAndAdults),
                                item("Menstrual products", people, getFemaleTeenagersAndAdults, { perNight: 1, perNights: 7, maxQuantity: 2 }),
                            ),
                            section(C.clothes,
                                item("Bra", people, getFemaleTeenagersAndAdults),
                                item("Underwear", people, getToddlersAndOlder, { perNight: 1, maxQuantity: 10 }),
                                // Potty training runs right through the Toddler
                                // bracket ("1-3 - potty & pull-ups"), and an
                                // accident soaks pants and bottoms together. The
                                // general rates assume clothes come back clean —
                                // which is how a toddler ended up with two pairs
                                // of trousers for a four-night trip.
                                //
                                // These carry the same text as the general copies
                                // on purpose: `deduplicateItems` collapses the
                                // pair for anyone in both and keeps the larger
                                // quantity, so a toddler gets one row with a
                                // bigger number rather than a second, confusing
                                // row. The caps assume a wash mid-trip.
                                item("Underwear", people, getToddlers, { perNight: 3, maxQuantity: 15 }),
                                item("Socks", people, undefined, { perNight: 1, maxQuantity: 10 }),
                                item("T-shirt/Top", people, undefined, { perNight: 1, maxQuantity: 10 }),
                                item("Trousers/Shorts", people, undefined, { perNight: 1, perNights: 3, maxQuantity: 5 }),
                                // Potty-training rate — see the note on Underwear above.
                                item("Trousers/Shorts", people, getToddlers, { perNight: 2, maxQuantity: 10 }),
                                item("Jumper", people, undefined, { perNight: 1, perNights: 4, maxQuantity: 2 }),
                                communalItem("Laundry bag", people),
                                communalItem("Travel detergent", people),
                            ),
                            section(C.dayBag,
                                // Wanted on the way, not on arrival — the same
                                // reason the flying option carries it.
                                item("Travel pillow", people, getTeenagersAndAdults),
                            ),
                            section(C.sleep,
                                item("Pyjamas", people, undefined, { perNight: 1, perNights: 3, maxQuantity: 3 }),
                                item("Earplugs and eye mask", people, getTeenagersAndAdults),
                                communalItem("Baby monitor", people, getBabies),
                                item("Nightlight", people, getUnderTeenagers),
                                communalItem("Blackout blind", people, getBabiesAndToddlers),
                                item("Baby sleeping bag/Swaddle", people, getBabies),
                                communalItem("Extra bedding/sheets", people, getBabies),
                                item("Bedtime bottle", people, getBabies),
                                item("Bedtime books", people, getToddlers),
                                item("Favourite toy/Stuffed animal", people, getChildren),
                            ),
                            section(C.nappies,
                                item("Night nappy/Pull-up", people, getToddlers),
                            ),
                            section(C.kit,
                                item("Torch", people, getChildrenAndOlder),
                            ),
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
                id: TEMPLATE_QUESTION_IDS.abroad,
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
                            section(C.documents,
                                item("Passport", people),
                                item("Visa", people),
                                item("EHIC/GHIC card", people),
                                communalItem("Travel insurance documents", people),
                                communalItem("Booking confirmations", people),
                                communalItem("Local currency", people, getAdults),
                                communalItem("Copies of important documents", people, getAdults),
                                item("Pet passport/Animal health certificate", people, getPets),
                            ),
                            section(C.dayBag,
                                item("Travel adapter", people, getTeenagersAndAdults),
                            ),
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
                id: TEMPLATE_QUESTION_IDS.weather,
                type: "saved",
                text: "What weather do you expect?",
                order: 2,
                questionType: "multiple-choice",
                options: [
                    {
                        id: WEATHER_OPTION_IDS.hot,
                        text: "Hot",
                        order: 0,
                        items: items(
                            // Sun cream is applied where you are, not where you
                            // are staying, so it travels in the day bag; the
                            // after-sun is an evening job and stays in the wash
                            // bag.
                            section(C.dayBag,
                                communalItem("Sunscreen", people),
                                communalItem("Baby sunscreen (SPF 50+)", people, getBabies),
                                communalItem("Toddler sunscreen", people, getToddlers),
                                communalItem("Kids sunscreen", people, getChildren),
                            ),
                            section(C.toiletries,
                                communalItem("After-sun", people),
                            ),
                            section(C.medical,
                                communalItem("Insect repellent", people),
                                communalItem("Antihistamines", people),
                            ),
                            section(C.clothes,
                                item("Sun hat", people, getChildrenAndOlder),
                                item("Sunglasses", people, getChildrenAndOlder),
                                item("Sandals", people, getToddlersAndOlder),
                                item("Sun protective baby clothing", people, getBabies),
                                item("Sun protective clothing", people, getToddlers),
                            ),
                            section(C.kit,
                                communalItem("Shade cover/Parasol for pram", people, getBabies),
                            ),
                        )
                    },
                    {
                        id: WEATHER_OPTION_IDS.strongSun,
                        text: "Strong sun",
                        order: 1,
                        items: items(
                            section(C.dayBag,
                                communalItem("Sunscreen", people),
                                item("Lip balm with SPF", people, getChildrenAndOlder),
                            ),
                            section(C.clothes,
                                item("Sun hat", people, getChildrenAndOlder),
                                item("Sunglasses", people, getChildrenAndOlder),
                            ),
                        )
                    },
                    {
                        id: WEATHER_OPTION_IDS.mild,
                        text: "Mild",
                        order: 2,
                        items: items(
                            section(C.clothes,
                                item("Light jacket", people),
                                item("Long-sleeved shirts", people),
                                item("Comfortable walking shoes", people, getToddlersAndOlder),
                            ),
                        )
                    },
                    {
                        id: WEATHER_OPTION_IDS.rain,
                        text: "Rain",
                        order: 3,
                        items: items(
                            section(C.clothes,
                                item("Raincoat", people),
                                item("Waterproof shoes/boots", people),
                            ),
                            section(C.dayBag,
                                communalItem("Umbrella", people),
                                communalItem("Waterproof rucksack cover", people, getChildrenAndOlder),
                            ),
                        )
                    },
                    {
                        id: WEATHER_OPTION_IDS.cold,
                        text: "Cold",
                        order: 4,
                        items: items(
                            section(C.clothes,
                                item("Winter coat", people, getChildrenAndOlder),
                                item("Gloves", people, getChildrenAndOlder),
                                item("Scarf", people, getChildrenAndOlder),
                                item("Warm hat/Beanie", people, getChildrenAndOlder),
                                item("Thermal underwear", people, getChildrenAndOlder),
                                item("Warm boots", people, getToddlersAndOlder),
                                item("Baby snowsuit/Pramsuit", people, getBabies),
                                item("Baby mittens", people, getBabies),
                                item("Baby warm hat with ear coverage", people, getBabies),
                                item("Toddler snowsuit/Winter coat", people, getToddlers),
                                item("Toddler mittens (not gloves - easier)", people, getToddlers),
                                item("Toddler warm hat", people, getToddlers),
                            ),
                            section(C.sleep,
                                communalItem("Blanket for carrier/pram", people, getBabies),
                            ),
                        )
                    },
                    {
                        id: WEATHER_OPTION_IDS.snow,
                        text: "Snow or ice",
                        order: 5,
                        items: items(
                            section(C.clothes,
                                item("Snow boots", people, getToddlersAndOlder),
                                item("Thermal socks", people, getToddlersAndOlder),
                            ),
                            section(C.kit,
                                item("Ice grips for shoes", people, getAdults),
                            ),
                        )
                    }
                ]
            },
            {
                id: TEMPLATE_QUESTION_IDS.transport,
                type: "saved",
                text: "How are you getting there?",
                order: 3,
                questionType: "multiple-choice",
                options: [
                    {
                        id: TRANSPORT_OPTION_IDS.flying,
                        text: "Flying",
                        order: 0,
                        items: items(
                            // Everything a flight adds is by definition
                            // something you need before you reach the hold.
                            section(C.dayBag,
                                communalItem("Boarding passes", people),
                                item("Medication in hand luggage", people),
                                item("Hand luggage liquids bag", people, getTeenagersAndAdults),
                                communalItem("Downloaded films and music", people),
                                item("Travel pillow", people, getTeenagersAndAdults),
                                item("Spare clothes in cabin bag", people, getBabiesAndToddlers),
                                item("Milk or dummy for take-off and landing", people, getBabies),
                            ),
                        )
                    },
                    {
                        id: TRANSPORT_OPTION_IDS.driving,
                        text: "Driving",
                        order: 1,
                        items: items(
                            // Sick bags and snacks are no use in the boot, and
                            // the keys are no use anywhere else.
                            section(C.dayBag,
                                communalItem("Car keys", people),
                                communalItem("Travel sickness tablets", people),
                                communalItem("Sick bags", people),
                                communalItem("Car charger", people),
                                communalItem("Snacks for the journey", people),
                            ),
                            section(C.documents,
                                item("Driving licence", people, getAdults),
                                communalItem("Breakdown cover documents", people, getAdults),
                            ),
                            section(C.kit,
                                item("Car seat", people, getUnderTeenagers),
                                communalItem("Window sun shades", people, getUnderTeenagers),
                            ),
                        )
                    },
                    {
                        id: TRANSPORT_OPTION_IDS.train,
                        text: "Train or coach",
                        order: 2,
                        items: items(
                            section(C.dayBag,
                                communalItem("Tickets", people),
                                communalItem("Downloaded films and music", people),
                                communalItem("Snacks for the journey", people),
                            ),
                        )
                    },
                    {
                        id: TRANSPORT_OPTION_IDS.ferry,
                        text: "Ferry",
                        order: 3,
                        items: items(
                            // A seasickness remedy in the car deck is a remedy
                            // you can't get to, which is also why the cruise
                            // option files it here.
                            section(C.dayBag,
                                communalItem("Tickets", people),
                                communalItem("Seasickness remedies", people),
                            ),
                            section(C.kit,
                                communalItem("Cabin overnight bag", people),
                            ),
                        )
                    }
                ]
            },
            {
                id: TEMPLATE_QUESTION_IDS.accommodation,
                type: "saved",
                text: "Where will you be staying?",
                order: 4,
                questionType: "multiple-choice",
                options: [
                    {
                        id: ACCOMMODATION_OPTION_IDS.hotel,
                        text: "Hotel or B&B",
                        order: 0,
                        items: items(
                            section(C.documents,
                                communalItem("Booking confirmations", people),
                            ),
                        )
                    },
                    {
                        id: ACCOMMODATION_OPTION_IDS.selfCatering,
                        text: "Self-catering (cottage, apartment, villa)",
                        order: 1,
                        items: items(
                            section(C.documents,
                                communalItem("Booking confirmations", people),
                            ),
                            section(C.toiletries,
                                communalItem("Towels", people),
                            ),
                            section(C.food,
                                communalItem("Dish soap and sponge", people),
                                communalItem("Dishwasher tablets", people),
                                communalItem("Tea towels", people),
                                communalItem("Bin bags", people),
                                communalItem("Tea and coffee", people),
                                communalItem("Sharp knife", people),
                                communalItem("Foil and cling film", people),
                                communalItem("Corkscrew", people, getAdults),
                                communalItem("Highchair or booster seat", people, getBabiesAndToddlers),
                            ),
                        )
                    },
                    {
                        id: ACCOMMODATION_OPTION_IDS.someoneElsesHome,
                        text: "Someone else's home",
                        order: 2,
                        items: items(
                            section(C.toiletries,
                                communalItem("Towels", people),
                            ),
                            section(C.sleep,
                                communalItem("Travel cot", people, getBabiesAndToddlers),
                                communalItem("Travel cot sheet", people, getBabiesAndToddlers),
                                communalItem("Blackout blind", people, getBabiesAndToddlers),
                            ),
                            section(C.kit,
                                communalItem("Host gift", people),
                                communalItem("Stair gate", people, getBabiesAndToddlers),
                            ),
                        )
                    },
                    {
                        id: ACCOMMODATION_OPTION_IDS.camping,
                        text: "Camping",
                        order: 3,
                        items: items(
                            section(C.toiletries,
                                communalItem("Towels", people),
                            ),
                            section(C.clothes,
                                item("Wellies", people, getToddlersAndOlder),
                            ),
                            section(C.sleep,
                                item("Sleeping bag", people),
                                item("Sleeping mat", people),
                                item("Pillow", people),
                            ),
                            section(C.food,
                                communalItem("Camping stove and gas", people, getAdults),
                                communalItem("Washing-up bowl and liquid", people),
                                communalItem("Cool box", people),
                                communalItem("Bin bags", people),
                            ),
                            section(C.kit,
                                communalItem("Tent", people),
                                communalItem("Tent pegs and mallet", people),
                                communalItem("Groundsheet", people),
                                item("Head torch", people, getChildrenAndOlder),
                                communalItem("Matches or lighter", people, getAdults),
                                communalItem("Camp chairs", people),
                            ),
                        )
                    },
                    {
                        id: ACCOMMODATION_OPTION_IDS.caravan,
                        text: "Caravan or motorhome",
                        order: 4,
                        items: items(
                            section(C.documents,
                                communalItem("Pitch booking confirmation", people, getAdults),
                            ),
                            section(C.toiletries,
                                communalItem("Towels", people),
                                communalItem("Toilet chemicals", people, getAdults),
                            ),
                            section(C.clothes,
                                item("Wellies", people, getToddlersAndOlder),
                            ),
                            section(C.sleep,
                                item("Bedding", people),
                                item("Pillow", people),
                            ),
                            section(C.food,
                                communalItem("Washing-up bowl and liquid", people),
                                communalItem("Cool box", people),
                                communalItem("Bin bags", people),
                            ),
                            section(C.kit,
                                communalItem("Electric hook-up cable", people, getAdults),
                                communalItem("Water hose and container", people, getAdults),
                                communalItem("Waste water container", people, getAdults),
                                communalItem("Levelling blocks and chocks", people, getAdults),
                                communalItem("Spare gas bottle", people, getAdults),
                                communalItem("Awning", people, getAdults),
                                communalItem("Camp chairs", people),
                            ),
                        )
                    },
                    {
                        id: ACCOMMODATION_OPTION_IDS.cruise,
                        text: "Cruise ship",
                        order: 5,
                        items: items(
                            section(C.dayBag,
                                communalItem("Seasickness remedies", people),
                                item("Lanyard for key card", people, getChildrenAndOlder),
                                communalItem("Port daypack", people),
                            ),
                            section(C.documents,
                                communalItem("Booking confirmations", people),
                            ),
                            section(C.clothes,
                                item("Formal outfit", people),
                            ),
                        )
                    }
                ]
            },
            {
                id: activitiesQuestionId,
                type: "saved",
                text: "What activities will you be doing?",
                order: 5,
                questionType: "multiple-choice",
                options: activityOptions
            }
        ]
    };
}
