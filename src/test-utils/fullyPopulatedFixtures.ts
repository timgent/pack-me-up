import type { PackingList, PackingListItem } from '../create-packing-list/types'
import type { PackingListQuestionSet, Person, Item, SavedQuestion, Option } from '../edit-questions/types'

/**
 * Fixtures with **every** field of their type populated, used by the
 * persistence round-trip tests (see `database.test.ts` →
 * "persists every field of the type").
 *
 * Why they live here (in `src`, not in a `.test.ts` file): `tsconfig.app.json`
 * excludes test files from type checking, so a fixture defined inside a test
 * would not be checked. Here it is, which is the whole point:
 *
 *   `Required<...>` means adding a new optional field to `PackingList` or
 *   `PackingListQuestionSet` **breaks the type check** (`npm test` runs it
 *   first) until the field is added below — and once it is added, the
 *   round-trip tests fail unless the field actually survives being saved and
 *   read back.
 *
 * That pair is the automatic guard against the class of bug in #260, where
 * `savePackingList` built its document from a hand-maintained field allowlist
 * and silently dropped `nights`, `questionAnswers` and `selectedPeopleIds`.
 *
 * So: when the type check points you here, add the new field with a
 * distinctive value. Don't reach for `as` or a partial fixture.
 */

const fullyPopulatedItem: Required<PackingListItem> = {
    id: 'item-1',
    itemText: 'Sunscreen',
    personId: 'person-1',
    personName: 'Alice',
    questionId: 'q1',
    optionId: 'opt1',
    packed: true,
    communal: false,
    quantity: 3,
    category: 'Toiletries',
    order: 2,
    reviewed: true,
    lastMinute: true,
    lastModified: '2025-01-02T00:00:00.000Z',
}

const fullyPopulatedDeletedItem: Required<PackingListItem> = {
    ...fullyPopulatedItem,
    id: 'item-2',
    itemText: 'Umbrella',
    packed: false,
    communal: true,
    personId: '',
    personName: '',
    order: 5,
}

/** Every field of `PackingList` populated, except `_rev` (assigned by PouchDB). */
export const fullyPopulatedPackingList: Required<Omit<PackingList, '_rev'>> = {
    id: 'pl-full',
    name: 'Fully populated trip',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastModified: '2025-01-02T00:00:00.000Z',
    sharedFromPodUrl: 'https://alice.example/pod/',
    ownerWebId: 'https://alice.example/profile/card#me',
    nights: 4,
    destination: 'Lisbon, Portugal',
    startDate: '2025-06-01',
    endDate: '2025-06-05',
    items: [fullyPopulatedItem],
    deletedItems: [fullyPopulatedDeletedItem],
    guests: [{ id: 'guest-1', name: 'Zoe' }],
    questionAnswers: [{ questionId: 'q1', selectedOptionIds: ['opt1', 'opt2'] }],
    selectedPeopleIds: ['person-1', 'person-2'],
}

/**
 * Fields of `PackingList` that are deliberately local-only and are not written
 * to the pod (see the comments on the type). The RDF round-trip test excludes
 * them; everything else must survive a trip through the pod serialisation.
 */
export const packingListLocalOnlyFields = ['_rev', 'sharedFromPodUrl', 'ownerWebId'] as const

type PackingListLocalOnlyField = typeof packingListLocalOnlyFields[number]

/** The fields of a list that a pod copy is expected to carry. */
export function withoutLocalOnlyFields<T extends Partial<PackingList>>(
    list: T
): Omit<T, PackingListLocalOnlyField> {
    const copy = { ...list } as Record<string, unknown>
    for (const field of packingListLocalOnlyFields) delete copy[field]
    return copy as Omit<T, PackingListLocalOnlyField>
}

const fullyPopulatedPerson: Required<Person> = {
    id: 'person-1',
    name: 'Alice',
    ageRange: 'Adult',
    dateOfBirth: '1990-05-04',
    gender: 'female',
    species: 'dog',
    color: 'fuchsia',
    emoji: '🦄',
    webId: 'https://alice.example/profile/card#me',
    lastModified: '2025-01-02T00:00:00.000Z',
    deletedAt: '2025-01-03T00:00:00.000Z',
}

const fullyPopulatedQuestionSetItem: Required<Item> = {
    id: 'qs-item-1',
    text: 'Sunscreen',
    personSelections: [{ personId: 'person-1', selected: true }],
    communal: true,
    // Single value on purpose: RDF multi-values are an unordered set, so a
    // longer list would make the pod round-trip assertion order-dependent.
    ageRanges: ['Adult'],
    category: 'Toiletries',
    order: 1,
    perNight: 2,
    perNights: 3,
    maxQuantity: 7,
    lastModified: '2025-01-02T00:00:00.000Z',
    deletedAt: '2025-01-03T00:00:00.000Z',
}

const fullyPopulatedOption: Required<Option> = {
    id: 'opt1',
    text: 'Sunny',
    items: [fullyPopulatedQuestionSetItem],
    order: 0,
    // Single value for the same reason as `ageRanges` above: these are repeated
    // strings on one Thing, and RDF multi-values come back as an unordered set.
    emptySections: ['Beach kit'],
}

const fullyPopulatedQuestion: Required<SavedQuestion> = {
    id: 'q1',
    type: 'saved',
    text: 'What is the weather?',
    options: [fullyPopulatedOption],
    order: 0,
    questionType: 'multiple-choice',
    lastModified: '2025-01-02T00:00:00.000Z',
    deletedAt: '2025-01-03T00:00:00.000Z',
}

/**
 * Every field of `PackingListQuestionSet` populated, except the PouchDB-assigned
 * `_id` / `_rev`.
 */
export const fullyPopulatedQuestionSet: Required<Omit<PackingListQuestionSet, '_id' | '_rev'>> = {
    people: [fullyPopulatedPerson],
    alwaysNeededItems: [fullyPopulatedQuestionSetItem],
    alwaysNeededEmptySections: ['Documents'],
    questions: [fullyPopulatedQuestion],
    // Deliberately several values, and deliberately not alphabetical: a section
    // order is the one repeated field whose *order* is the whole point, so the
    // round-trip assertions have to be order-dependent here.
    sectionOrder: ['Toiletries', 'Essentials', 'Beach kit'],
    lastModified: '2025-01-02T00:00:00.000Z',
    templateVersion: 3,
}
