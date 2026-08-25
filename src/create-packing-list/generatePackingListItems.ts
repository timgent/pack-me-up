import { Question, Person, Item } from '../edit-questions/types'
import { ALWAYS_NEEDED_CATEGORY, defaultCategoryFor } from '../edit-questions/item-sections'
import { PackingListItem } from './types'
// Not crypto.randomUUID directly: it is missing from older WebViews, which is
// exactly where the Capacitor builds run.
import { generateUUID } from '../utils/uuid'

interface ItemContext {
    questionId: string
    optionId: string
    // Category to use when the item doesn't carry its own — the option text,
    // the question text, or 'Essentials' for always-needed items.
    category?: string
    nights?: number
}

// An item's own category wins over the one derived from its question/option.
// The category is stamped on each item rather than marking a section boundary,
// so it is a purely local property: per-item LWW merges (mergeQuestionSets) and
// old clients that drop the field can only ever misplace the single item they
// touched, never scramble a whole section.
function categoryFor(item: Item, context: ItemContext): string | undefined {
    return item.category ?? context.category
}

// The rate is "perNight per perNights nights" (perNights defaults to 1):
// ceil(nights × perNight / perNights), capped at maxQuantity, never below 1.
// Undefined when either the trip length or the item's rate is unknown, so
// items and trips that don't opt in behave exactly as before.
export function suggestedQuantity(item: Item, nights?: number): number | undefined {
    if (!nights || nights <= 0 || !item.perNight || item.perNight <= 0) return undefined
    const perNights = item.perNights && item.perNights > 0 ? item.perNights : 1
    const quantity = Math.ceil(nights * item.perNight / perNights)
    return Math.max(1, Math.min(quantity, item.maxQuantity ?? Infinity))
}

function generateItemInstances(
    item: Item,
    people: Person[],
    selectedPeopleIds: string[],
    context: ItemContext
): PackingListItem[] {
    const quantity = suggestedQuantity(item, context.nights)
    if (item.communal) {
        // Person selections act as a trigger: include the single shared item
        // when at least one selected person is travelling. No selections at
        // all means the item is always needed.
        const triggered = item.personSelections.length === 0
            || item.personSelections.some(ps => ps.selected && selectedPeopleIds.includes(ps.personId))
        if (!triggered) return []
        return [{
            id: generateUUID(),
            itemText: item.text,
            personId: '',
            personName: '',
            questionId: context.questionId,
            optionId: context.optionId,
            packed: false,
            communal: true,
            ...(quantity !== undefined ? { quantity } : {}),
            category: categoryFor(item, context),
        }]
    }

    const selectedPeople = item.personSelections.filter(
        ps => ps.selected && selectedPeopleIds.includes(ps.personId)
    )
    return selectedPeople.flatMap(ps => {
        const person = people.find(p => p.id === ps.personId)!
        return {
            id: generateUUID(),
            itemText: item.text,
            personId: ps.personId,
            personName: person.name,
            questionId: context.questionId,
            optionId: context.optionId,
            packed: false,
            ...(quantity !== undefined ? { quantity } : {}),
            category: categoryFor(item, context),
        } satisfies PackingListItem
    })
}

export function generateQuestionBasedItems(
    questions: Question[],
    questionAnswers: Array<{ questionId: string; selectedOptionIds?: string[] }>,
    people: Person[],
    selectedPeopleIds: string[],
    nights?: number
): PackingListItem[] {
    // Walk the question set in its own order (questions, then options, then
    // items) rather than answer order, so the generated list mirrors how the
    // user arranged their questions.
    const answersByQuestionId = new Map(questionAnswers.map(qa => [qa.questionId, qa]))
    return [...questions]
        .sort((a, b) => a.order - b.order)
        .flatMap(question => {
            const qa = answersByQuestionId.get(question.id)
            if (!qa) return []
            const selectedOptionIds = new Set((qa.selectedOptionIds ?? []).filter(Boolean))

            return [...question.options]
                .sort((a, b) => a.order - b.order)
                .filter(option => selectedOptionIds.has(option.id))
                .flatMap(selectedOption =>
                    sortItemsByOrder(selectedOption.items).flatMap(item =>
                        generateItemInstances(item, people, selectedPeopleIds, {
                            questionId: question.id,
                            optionId: selectedOption.id,
                            category: defaultCategoryFor(question, selectedOption),
                            nights,
                        })
                    )
                )
        })
}

export function generateAlwaysNeededItems(
    alwaysNeededItems: Item[],
    people: Person[],
    selectedPeopleIds: string[],
    nights?: number
): PackingListItem[] {
    return sortItemsByOrder(alwaysNeededItems).flatMap(item =>
        generateItemInstances(item, people, selectedPeopleIds, {
            questionId: 'always-needed',
            optionId: 'always-needed',
            category: ALWAYS_NEEDED_CATEGORY,
            nights,
        })
    )
}

// Explicit order wins where present; items without one keep their array
// position (question sets written before items carried an order field).
function sortItemsByOrder(items: Item[]): Item[] {
    return items
        .map((item, index) => ({ item, key: item.order ?? index }))
        .sort((a, b) => a.key - b.key)
        .map(({ item }) => item)
}

// Stamped onto the final assembled list so the view page can show items in
// question-set order without needing access to the owner's question set.
export function withItemOrder(items: PackingListItem[]): PackingListItem[] {
    return items.map((item, index) => ({ ...item, order: index }))
}
