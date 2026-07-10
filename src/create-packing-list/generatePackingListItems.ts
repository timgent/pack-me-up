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
    return questionAnswers.flatMap(qa => {
        const selectedOptionIds = qa.selectedOptionIds ?? []
        const question = questions.find(q => q.id === qa.questionId)
        if (!question) return []

        return selectedOptionIds.flatMap(selectedOptionId => {
            if (!selectedOptionId) return []
            const selectedOption = question.options.find(o => o.id === selectedOptionId)
            if (!selectedOption) return []

            return selectedOption.items.flatMap(item =>
                generateItemInstances(item, people, selectedPeopleIds, {
                    questionId: question.id,
                    optionId: selectedOption.id,
                    category: question.questionType === 'multiple-choice'
                        ? selectedOption.text
                        : question.text,
                })
            )
        })
    })
}

export function generateAlwaysNeededItems(
    alwaysNeededItems: Item[],
    people: Person[],
    selectedPeopleIds: string[]
): PackingListItem[] {
    return alwaysNeededItems.flatMap(item =>
        generateItemInstances(item, people, selectedPeopleIds, {
            questionId: 'always-needed',
            optionId: 'always-needed',
            category: 'Essentials',
        })
    )
}
