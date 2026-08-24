import { PackingListQuestionSet } from '../edit-questions/types'
import { activeQuestionSet } from '../edit-questions/tombstones'
import { PackingList, PackingListItem } from './types'
import { generateQuestionBasedItems, generateAlwaysNeededItems } from './generatePackingListItems'
// Identity and collapsing are shared with the creation flow, so an item arriving
// from two answers behaves the same whether the list is being created or
// updated — including taking the larger of the two suggested quantities.
import { deduplicateItems, itemIdentityKey as itemKey } from './deduplicate'

// The sentinel questionId used for always-needed items; such items carry no real
// question/option ids to reconstruct answers from.
const ALWAYS_NEEDED_QUESTION_ID = 'always-needed'

interface GenerationInputs {
    questionAnswers: Array<{ questionId: string; selectedOptionIds: string[] }>
    selectedPeopleIds: string[]
}


// Legacy lists (created before generation inputs were persisted) have neither
// `questionAnswers` nor `selectedPeopleIds`. Rebuild what we can from the items
// that were generated: the distinct (questionId → optionId) pairs become the
// answers, and the distinct non-empty personIds become the travellers. This is
// lossy — an option that generated no instances, or whose items were all
// deleted-and-purged, is invisible — but safe for additions: at worst it misses
// some additions, it never invents wrong ones.
export function reconstructGenerationInputs(list: PackingList): GenerationInputs {
    const optionIdsByQuestion = new Map<string, Set<string>>()
    const peopleIds = new Set<string>()

    for (const item of [...list.items, ...(list.deletedItems ?? [])]) {
        if (item.personId) peopleIds.add(item.personId)
        if (!item.questionId || item.questionId === ALWAYS_NEEDED_QUESTION_ID) continue
        if (!item.optionId) continue
        if (!optionIdsByQuestion.has(item.questionId)) {
            optionIdsByQuestion.set(item.questionId, new Set())
        }
        optionIdsByQuestion.get(item.questionId)!.add(item.optionId)
    }

    const questionAnswers = [...optionIdsByQuestion.entries()].map(([questionId, optionIds]) => ({
        questionId,
        selectedOptionIds: [...optionIds],
    }))

    return { questionAnswers, selectedPeopleIds: [...peopleIds] }
}

function resolveGenerationInputs(list: PackingList): GenerationInputs {
    if (list.questionAnswers !== undefined || list.selectedPeopleIds !== undefined) {
        return {
            questionAnswers: list.questionAnswers ?? [],
            selectedPeopleIds: list.selectedPeopleIds ?? [],
        }
    }
    return reconstructGenerationInputs(list)
}

// Re-runs the generator for the list's stored (or reconstructed) inputs against
// the current question set, and returns only the items that are genuinely new:
// not already on the list, and not previously deleted from it. Additions carry
// a fresh id and lastModified so the item-level merge can track them.
export function computeQuestionSetAdditions(
    list: PackingList,
    storedQuestionSet: PackingListQuestionSet,
): PackingListItem[] {
    // Deletions in the question set are tombstones, so read past them: a
    // question, item or person the user has deleted must never come back as an
    // addition. See `activeQuestionSet`.
    const questionSet = activeQuestionSet(storedQuestionSet)
    const { questionAnswers, selectedPeopleIds } = resolveGenerationInputs(list)

    // A person removed from the question set must not be regenerated; this also
    // guards the non-null people.find(...)! inside the generator.
    const currentPeopleIds = new Set(questionSet.people.map(p => p.id))
    const validPeopleIds = selectedPeopleIds.filter(id => currentPeopleIds.has(id))

    const regenerated = [
        ...generateQuestionBasedItems(
            questionSet.questions,
            questionAnswers,
            questionSet.people,
            validPeopleIds,
            list.nights,
        ),
        ...generateAlwaysNeededItems(
            questionSet.alwaysNeededItems,
            questionSet.people,
            validPeopleIds,
            list.nights,
        ),
    ]

    // Anything already present (incl. custom items the user added by hand with
    // the same text) or previously deleted is not an addition.
    const existingKeys = new Set<string>()
    for (const item of list.items) existingKeys.add(itemKey(item.personId, item.itemText))
    for (const item of (list.deletedItems ?? [])) existingKeys.add(itemKey(item.personId, item.itemText))

    const additions: PackingListItem[] = []
    const now = new Date().toISOString()
    for (const item of deduplicateItems(regenerated)) {
        if (existingKeys.has(itemKey(item.personId, item.itemText))) continue
        additions.push({ ...item, id: crypto.randomUUID(), packed: false, lastModified: now })
    }
    return additions
}
