import { Question, Person } from '../edit-questions/types'
import { PackingListItem } from './types'

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

            return selectedOption.items.flatMap(item => {
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
                        questionId: question.id,
                        optionId: selectedOption.id,
                        packed: false,
                        category: question.questionType === 'multiple-choice'
                            ? selectedOption.text
                            : question.text,
                    } satisfies PackingListItem
                })
            })
        })
    })
}
