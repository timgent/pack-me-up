import { Question, Person, Item } from '../edit-questions/types'
import { PackingListItem } from './types'

interface ItemContext {
    questionId: string
    optionId: string
    category?: string
}

function generateItemInstances(
    item: Item,
    people: Person[],
    selectedPeopleIds: string[],
    context: ItemContext
): PackingListItem[] {
    if (item.communal) {
        // Person selections act as a trigger: include the single shared item
        // when at least one selected person is travelling. No selections at
        // all means the item is always needed.
        const triggered = item.personSelections.length === 0
            || item.personSelections.some(ps => ps.selected && selectedPeopleIds.includes(ps.personId))
        if (!triggered) return []
        return [{
            id: crypto.randomUUID(),
            itemText: item.text,
            personId: '',
            personName: '',
            questionId: context.questionId,
            optionId: context.optionId,
            packed: false,
            communal: true,
            category: context.category,
        }]
    }

    const selectedPeople = item.personSelections.filter(
        ps => ps.selected && selectedPeopleIds.includes(ps.personId)
    )
    return selectedPeople.flatMap(ps => {
        const person = people.find(p => p.id === ps.personId)!
        return {
            id: crypto.randomUUID(),
            itemText: item.text,
            personId: ps.personId,
            personName: person.name,
            questionId: context.questionId,
            optionId: context.optionId,
            packed: false,
            category: context.category,
        } satisfies PackingListItem
    })
}

export function generateQuestionBasedItems(
    questions: Question[],
    questionAnswers: Array<{ questionId: string; selectedOptionIds?: string[] }>,
    people: Person[],
    selectedPeopleIds: string[]
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
                            category: question.questionType === 'multiple-choice'
                                ? selectedOption.text
                                : question.text,
                        })
                    )
                )
        })
}

export function generateAlwaysNeededItems(
    alwaysNeededItems: Item[],
    people: Person[],
    selectedPeopleIds: string[]
): PackingListItem[] {
    return sortItemsByOrder(alwaysNeededItems).flatMap(item =>
        generateItemInstances(item, people, selectedPeopleIds, {
            questionId: 'always-needed',
            optionId: 'always-needed',
            category: 'Essentials',
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
