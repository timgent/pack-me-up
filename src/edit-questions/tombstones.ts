import { Item, PackingListQuestionSet } from './types'

/**
 * People, questions and question-set items are deleted by tombstone: they stay
 * in the document carrying a `deletedAt`, so the deletion can reach the pod and
 * win the per-entity merge instead of being re-added by a device that still has
 * the entity (see `mergeQuestionSets`).
 *
 * That makes the stored set the wrong thing to read from. A tombstoned question
 * is a deletion, not a question — showing it on the create-a-list page put back
 * every question the user had deleted, with none of its options under it (an
 * option is removed outright, so a deleted question that was emptied first has
 * nothing left to show). The same goes for generating: a deleted item must not
 * land on a new list.
 *
 * `activeQuestionSet` is the view every reader wants — the same set with every
 * tombstone dropped, including the items nested inside each option. Writers
 * must keep using the stored set: saving this one back would purge the
 * tombstones, and every deletion with them.
 */
export function activeQuestionSet(questionSet: PackingListQuestionSet): PackingListQuestionSet {
    return {
        ...questionSet,
        people: questionSet.people.filter(person => !person.deletedAt),
        alwaysNeededItems: activeItems(questionSet.alwaysNeededItems),
        questions: questionSet.questions
            .filter(question => !question.deletedAt)
            .map(question => ({
                ...question,
                options: question.options.map(option => ({
                    ...option,
                    items: activeItems(option.items),
                })),
            })),
    }
}

export function activeItems(items: Item[]): Item[] {
    return items.filter(item => !item.deletedAt)
}
