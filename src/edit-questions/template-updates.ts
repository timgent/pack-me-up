import { PackingListQuestionSet, Item, Question, Option, SavedQuestion } from './types'
import { createExampleData, WIZARD_TEMPLATE_VERSION } from './example-data'
import { generateUUID } from '../utils/uuid'
import { ItemLocation, locationKey, normalize } from './item-locations'

/**
 * A single additive change the current wizard template offers over what the
 * user already has. Purely additive by design — nothing here ever removes or
 * rewrites a user's own questions, options, or items.
 */
export type TemplateUpdateSuggestion =
    | {
        kind: 'addItem'
        /** Stable key for UI checkbox state and de-duplication */
        key: string
        /** The item text being offered */
        label: string
        /** Where it will land, for display (e.g. "Hiking — Walking poles") */
        contextLabel: string
        location: ItemLocation
        item: Item
    }
    | {
        kind: 'addOption'
        key: string
        /** The new option text */
        label: string
        /** The existing question it will be added to, for display */
        contextLabel: string
        questionId: string
        option: Option
    }
    | {
        kind: 'addQuestion'
        key: string
        /** The new question text */
        label: string
        contextLabel: string
        question: Question
    }

type AddItemSuggestion = Extract<TemplateUpdateSuggestion, { kind: 'addItem' }>
type AddOptionSuggestion = Extract<TemplateUpdateSuggestion, { kind: 'addOption' }>
type AddQuestionSuggestion = Extract<TemplateUpdateSuggestion, { kind: 'addQuestion' }>

function isRelevant(item: Item): boolean {
    // Template items are already filtered to those selecting at least one
    // person; this is a defensive backstop.
    return item.personSelections.some(ps => ps.selected)
}

/**
 * Diff the current wizard template (regenerated for the user's active people)
 * against a saved question set and return the additions the user is missing:
 * new items in existing options/always-needed, whole new options under an
 * existing question, and whole new questions.
 *
 * Matching is additive-only and conservative:
 * - Questions match by stable id first, then normalized text. A matched but
 *   deleted question is respected (nothing is resurrected from it).
 * - A template question with no match is offered as a new question only when
 *   most of its items are absent from the user's set, so a renamed legacy
 *   question isn't re-suggested wholesale.
 * - Options match by id then normalized text; items match by normalized text.
 *   An item the user removed is simply absent, so it may be re-offered once
 *   (the version stamp stops it recurring after the user reviews).
 */
export function buildTemplateUpdateSuggestions(qs: PackingListQuestionSet): TemplateUpdateSuggestion[] {
    const activePeople = (qs.people ?? []).filter(p => !p.deletedAt)
    const template = createExampleData(activePeople, [])

    const suggestions: TemplateUpdateSuggestion[] = []

    // Every item text anywhere in the user's set (including deleted questions'
    // items), used to tell a genuinely new question from a renamed one.
    const allUserItemTexts = new Set<string>()
    for (const item of qs.alwaysNeededItems ?? []) allUserItemTexts.add(normalize(item.text))
    for (const q of qs.questions) {
        for (const o of q.options) for (const i of o.items) allUserItemTexts.add(normalize(i.text))
    }

    const findUserQuestion = (tq: Question): Question | undefined => {
        const byId = qs.questions.find(q => q.id === tq.id)
        if (byId) return byId
        return qs.questions.find(q => normalize(q.text) === normalize(tq.text))
    }

    for (const tq of template.questions) {
        const uq = findUserQuestion(tq)

        if (!uq) {
            const templateItems = tq.options.flatMap(o => o.items)
            if (templateItems.length === 0) continue
            const presentCount = templateItems.filter(i => allUserItemTexts.has(normalize(i.text))).length
            // Majority already present ⇒ almost certainly the same question
            // under a different name; don't offer it again.
            if (presentCount * 2 >= templateItems.length) continue
            suggestions.push({
                kind: 'addQuestion',
                key: `addQuestion:${tq.id}`,
                label: tq.text,
                contextLabel: 'New question',
                question: tq,
            })
            continue
        }

        if (uq.deletedAt) continue // user removed this question — respect it

        for (const to of tq.options) {
            const uo = uq.options.find(o => o.id === to.id)
                ?? uq.options.find(o => normalize(o.text) === normalize(to.text))
            if (!uo) {
                if (to.items.length === 0) continue
                suggestions.push({
                    kind: 'addOption',
                    key: `addOption:${uq.id}:${to.id}`,
                    label: to.text,
                    contextLabel: uq.text,
                    questionId: uq.id,
                    option: to,
                })
                continue
            }
            const existing = new Set(uo.items.map(i => normalize(i.text)))
            const location: ItemLocation = { kind: 'option', questionId: uq.id, optionId: uo.id }
            for (const ti of to.items) {
                if (!isRelevant(ti) || existing.has(normalize(ti.text))) continue
                suggestions.push({
                    kind: 'addItem',
                    key: `addItem:${locationKey(location)}:${normalize(ti.text)}`,
                    label: ti.text,
                    contextLabel: `${uq.text} — ${uo.text}`,
                    location,
                    item: ti,
                })
            }
        }
    }

    const existingAlways = new Set((qs.alwaysNeededItems ?? []).map(i => normalize(i.text)))
    for (const ti of template.alwaysNeededItems) {
        if (!isRelevant(ti) || existingAlways.has(normalize(ti.text))) continue
        const location: ItemLocation = { kind: 'always' }
        suggestions.push({
            kind: 'addItem',
            key: `addItem:always:${normalize(ti.text)}`,
            label: ti.text,
            contextLabel: 'Always needed',
            location,
            item: ti,
        })
    }

    return suggestions
}

/**
 * Apply the accepted additions and stamp the set to the current template
 * version. Passing an empty list still stamps the version — that's how a
 * "dismiss" is recorded, so the review card doesn't reappear until the next
 * template change. Inserted items get fresh ids and a `lastModified` so the
 * pod merge stays fine-grained.
 */
export function applyTemplateUpdates(
    qs: PackingListQuestionSet,
    accepted: TemplateUpdateSuggestion[],
    now: string = new Date().toISOString(),
): PackingListQuestionSet {
    const addItems = accepted.filter((s): s is AddItemSuggestion => s.kind === 'addItem')
    const addOptions = accepted.filter((s): s is AddOptionSuggestion => s.kind === 'addOption')
    const addQuestions = accepted.filter((s): s is AddQuestionSuggestion => s.kind === 'addQuestion')

    const stampItem = (i: Item): Item => ({ ...i, id: generateUUID(), lastModified: now })

    const addItemsToLocation = (location: ItemLocation, items: Item[]): Item[] => {
        const key = locationKey(location)
        const here = addItems.filter(s => locationKey(s.location) === key)
        if (here.length === 0) return items
        return [...items, ...here.map(s => stampItem(s.item))]
    }

    let questions: Question[] = qs.questions.map(question => {
        const newOptions = addOptions.filter(s => s.questionId === question.id)
        const maxOrder = question.options.reduce((m, o) => Math.max(m, o.order), -1)
        const insertedOptions: Option[] = newOptions.map((s, idx) => ({
            ...s.option,
            order: maxOrder + 1 + idx,
            items: s.option.items.map(stampItem),
        }))
        return {
            ...question,
            options: [
                ...question.options.map(option => ({
                    ...option,
                    items: addItemsToLocation(
                        { kind: 'option', questionId: question.id, optionId: option.id },
                        option.items,
                    ),
                })),
                ...insertedOptions,
            ],
        }
    })

    const maxQuestionOrder = questions.reduce((m, q) => Math.max(m, q.order), -1)
    const insertedQuestions: SavedQuestion[] = addQuestions.map((s, idx) => ({
        ...s.question,
        type: 'saved',
        order: maxQuestionOrder + 1 + idx,
        lastModified: now,
        options: s.question.options.map(option => ({
            ...option,
            items: option.items.map(stampItem),
        })),
    }))
    questions = [...questions, ...insertedQuestions]

    return {
        ...qs,
        questions,
        alwaysNeededItems: addItemsToLocation({ kind: 'always' }, qs.alwaysNeededItems ?? []),
        templateVersion: WIZARD_TEMPLATE_VERSION,
    }
}

/**
 * True when the saved set predates the current template version and there is
 * at least one real addition to offer. Cheap enough to call on render.
 */
export function hasTemplateUpdates(qs: PackingListQuestionSet): boolean {
    if ((qs.templateVersion ?? 0) >= WIZARD_TEMPLATE_VERSION) return false
    return buildTemplateUpdateSuggestions(qs).length > 0
}
