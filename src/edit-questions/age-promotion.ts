import { PackingListQuestionSet, Person, Item, Question, Option } from './types'
import { AgeTransition } from './age-derivation'
import { createExampleData } from './example-data'
import { generateUUID } from '../utils/uuid'

export type ItemLocation =
    | { kind: 'always' }
    | { kind: 'option'; questionId: string; optionId: string }

export interface PromotionSuggestion {
    /** Stable key for UI checkbox state */
    key: string
    personId: string
    personName: string
    direction: 'ageOut' | 'ageIn' | 'addItem'
    itemText: string
    /** Where the item lives, for display: "Always needed" or "Question — Option" */
    contextLabel: string
    location: ItemLocation
    /** For toggles: index into the raw items array at `location` */
    itemIndex?: number
    /** For addItem: the ready-to-insert catalog item (selections aligned to active people) */
    newItem?: Item
}

function locationKey(location: ItemLocation): string {
    return location.kind === 'always' ? 'always' : `option:${location.questionId}:${location.optionId}`
}

function normalize(text: string): string {
    return text.trim().toLowerCase()
}

interface LocatedItems {
    location: ItemLocation
    contextLabel: string
    items: Item[]
}

function collectLocations(qs: PackingListQuestionSet): LocatedItems[] {
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

function toggleSuggestions(qs: PackingListQuestionSet, transitions: AgeTransition[]): PromotionSuggestion[] {
    const suggestions: PromotionSuggestion[] = []
    for (const { location, contextLabel, items } of collectLocations(qs)) {
        items.forEach((item, itemIndex) => {
            if (item.deletedAt || !item.ageRanges) return
            for (const { person, to } of transitions) {
                const selection = item.personSelections.find(ps => ps.personId === person.id)
                if (!selection) continue
                const inNewBracket = item.ageRanges!.includes(to)
                const direction = selection.selected && !inNewBracket ? 'ageOut'
                    : !selection.selected && inNewBracket ? 'ageIn'
                    : null
                if (!direction) continue
                suggestions.push({
                    key: `${direction}:${person.id}:${locationKey(location)}:${itemIndex}`,
                    personId: person.id,
                    personName: person.name,
                    direction,
                    itemText: item.text,
                    contextLabel,
                    location,
                    itemIndex,
                })
            }
        })
    }
    return suggestions
}

/**
 * Default items for a newly reached bracket that are missing from the user's
 * data entirely — they were dropped at generation time because nobody was in
 * that bracket. Regenerates the default catalog for the post-transition
 * family and matches locations back by question/option text (or stable
 * option id), so renamed questions are simply skipped rather than guessed at.
 */
function additionSuggestions(qs: PackingListQuestionSet, transitions: AgeTransition[]): PromotionSuggestion[] {
    const activePeople = qs.people.filter(p => !p.deletedAt)
    const promotedBracket = new Map(transitions.map(t => [t.person.id, t.to]))
    const postPeople: Person[] = activePeople.map(p => {
        const to = promotedBracket.get(p.id)
        return to ? { ...p, ageRange: to } : p
    })
    const catalog = createExampleData(postPeople, [])

    const userLocations = collectLocations(qs)
    const findUserLocation = (catalogLoc: LocatedItems, catalogQs: PackingListQuestionSet): LocatedItems | undefined => {
        if (catalogLoc.location.kind === 'always') {
            return userLocations.find(l => l.location.kind === 'always')
        }
        const { questionId, optionId } = catalogLoc.location
        const catalogQuestion = catalogQs.questions.find(q => q.id === questionId)
        const catalogOption = catalogQuestion?.options.find(o => o.id === optionId)
        if (!catalogQuestion || !catalogOption) return undefined
        return userLocations.find(l => {
            if (l.location.kind !== 'option') return false
            const userQuestion = qs.questions.find(q => q.id === (l.location as { questionId: string }).questionId)
            const userOption = userQuestion?.options.find(o => o.id === (l.location as { optionId: string }).optionId)
            if (!userQuestion || !userOption) return false
            const questionMatches = normalize(userQuestion.text) === normalize(catalogQuestion.text)
            const optionMatches = userOption.id === catalogOption.id || normalize(userOption.text) === normalize(catalogOption.text)
            return questionMatches && optionMatches
        })
    }

    const suggestions: PromotionSuggestion[] = []
    const suggested = new Set<string>()
    for (const catalogLoc of collectLocations(catalog)) {
        const userLoc = findUserLocation(catalogLoc, catalog)
        if (!userLoc) continue
        // Deleted items count as present: the user chose to remove them.
        const existingTexts = new Set(userLoc.items.map(i => normalize(i.text)))

        for (const catalogItem of catalogLoc.items) {
            if (!catalogItem.ageRanges) continue
            for (const { person, from, to } of transitions) {
                if (!catalogItem.ageRanges.includes(to)) continue
                // Skip items that were already relevant before the transition —
                // if they're missing, the user removed them on purpose.
                if (from && catalogItem.ageRanges.includes(from)) continue
                const selection = catalogItem.personSelections.find(ps => ps.personId === person.id)
                if (!selection?.selected) continue
                if (existingTexts.has(normalize(catalogItem.text))) continue

                const dedupeKey = `${locationKey(userLoc.location)}:${normalize(catalogItem.text)}`
                if (suggested.has(dedupeKey)) continue
                suggested.add(dedupeKey)
                suggestions.push({
                    key: `addItem:${person.id}:${dedupeKey}`,
                    personId: person.id,
                    personName: person.name,
                    direction: 'addItem',
                    itemText: catalogItem.text,
                    contextLabel: userLoc.contextLabel,
                    location: userLoc.location,
                    newItem: catalogItem,
                })
            }
        }
    }
    return suggestions
}

/**
 * Everything worth reviewing when the given people move into a new age
 * bracket: existing tagged items to select/deselect, plus default items for
 * the new bracket that don't exist in the data yet.
 */
export function buildPromotionSuggestions(
    qs: PackingListQuestionSet,
    transitions: AgeTransition[],
): PromotionSuggestion[] {
    if (transitions.length === 0) return []
    return [...toggleSuggestions(qs, transitions), ...additionSuggestions(qs, transitions)]
}

/**
 * Apply the accepted suggestions and acknowledge every transition by moving
 * each person's stored ageRange to the new bracket (which stops the prompt
 * recurring). Only touched items and people get a fresh lastModified so the
 * pod merge stays fine-grained.
 */
export function applyAgePromotions(
    qs: PackingListQuestionSet,
    transitions: AgeTransition[],
    accepted: PromotionSuggestion[],
    now: string = new Date().toISOString(),
): PackingListQuestionSet {
    const promotedBracket = new Map(transitions.map(t => [t.person.id, t.to]))

    const people = qs.people.map(p => {
        const to = promotedBracket.get(p.id)
        return to ? { ...p, ageRange: to, lastModified: now } : p
    })

    const toggles = accepted.filter(s => s.direction !== 'addItem')
    const additions = accepted.filter(s => s.direction === 'addItem' && s.newItem)

    const applyToLocation = (location: ItemLocation, items: Item[]): Item[] => {
        const locKey = locationKey(location)
        let result = items.map((item, idx) => {
            const togglesHere = toggles.filter(s => locationKey(s.location) === locKey && s.itemIndex === idx)
            if (togglesHere.length === 0) return item
            const toggledPersonIds = new Set(togglesHere.map(s => s.personId))
            return {
                ...item,
                lastModified: now,
                personSelections: item.personSelections.map(ps =>
                    toggledPersonIds.has(ps.personId) ? { ...ps, selected: !ps.selected } : ps
                ),
            }
        })
        const additionsHere = additions.filter(s => locationKey(s.location) === locKey)
        if (additionsHere.length > 0) {
            result = [
                ...result,
                ...additionsHere.map(s => ({ ...s.newItem!, id: generateUUID(), lastModified: now })),
            ]
        }
        return result
    }

    const questions: Question[] = qs.questions.map(question => ({
        ...question,
        options: question.options.map((option): Option => ({
            ...option,
            items: applyToLocation(
                { kind: 'option', questionId: question.id, optionId: option.id },
                option.items,
            ),
        })),
    }))

    return {
        ...qs,
        people,
        questions,
        alwaysNeededItems: applyToLocation({ kind: 'always' }, qs.alwaysNeededItems ?? []),
    }
}
