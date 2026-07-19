import { PackingListQuestionSet, Item } from './types'

/**
 * Where an item lives inside a question set: either the always-needed list, or
 * a specific option under a specific question. Shared by the age-promotion and
 * template-update diff engines so both address items the same way.
 */
export type ItemLocation =
    | { kind: 'always' }
    | { kind: 'option'; questionId: string; optionId: string }

export interface LocatedItems {
    location: ItemLocation
    /** Human-readable label for display, e.g. "Always needed" or "Hiking — Walking poles" */
    contextLabel: string
    items: Item[]
}

/** Stable string key for a location, used to group/dedupe suggestions. */
export function locationKey(location: ItemLocation): string {
    return location.kind === 'always' ? 'always' : `option:${location.questionId}:${location.optionId}`
}

/** Compare item/question/option text ignoring surrounding whitespace and case. */
export function normalize(text: string): string {
    return text.trim().toLowerCase()
}

/**
 * Flatten a question set into its item-bearing locations (always-needed list
 * plus every option of every non-deleted question), each tagged with a
 * display label.
 */
export function collectLocations(qs: PackingListQuestionSet): LocatedItems[] {
    const locations: LocatedItems[] = [
        { location: { kind: 'always' }, contextLabel: 'Always needed', items: qs.alwaysNeededItems ?? [] },
    ]
    for (const question of qs.questions) {
        if (question.deletedAt) continue
        for (const option of question.options) {
            locations.push({
                location: { kind: 'option', questionId: question.id, optionId: option.id },
                contextLabel: `${question.text} — ${option.text}`,
                items: option.items,
            })
        }
    }
    return locations
}
