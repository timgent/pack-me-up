import { PackingListQuestionSet, Item, Question, Option, SavedQuestion } from './types'
import { createExampleData, WIZARD_TEMPLATE_VERSION } from './example-data'
import { generateUUID } from '../utils/uuid'
import { ItemLocation, locationKey, normalize } from './item-locations'
import { sectionNamesIn } from './item-sections'

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
    | {
        kind: 'setCategories'
        key: string
        label: string
        contextLabel: string
        /** Normalised item text → the section the template puts it in. */
        categories: Record<string, string>
        /** How many of the user's items this would file, for the label. */
        itemCount: number
    }

type AddItemSuggestion = Extract<TemplateUpdateSuggestion, { kind: 'addItem' }>
type AddOptionSuggestion = Extract<TemplateUpdateSuggestion, { kind: 'addOption' }>
type AddQuestionSuggestion = Extract<TemplateUpdateSuggestion, { kind: 'addQuestion' }>
type SetCategoriesSuggestion = Extract<TemplateUpdateSuggestion, { kind: 'setCategories' }>

function isRelevant(item: Item): boolean {
    // Template items are already filtered to those selecting at least one
    // person; this is a defensive backstop.
    return item.personSelections.some(ps => ps.selected)
}

function everyItemIn(qs: PackingListQuestionSet): Item[] {
    return [
        ...(qs.alwaysNeededItems ?? []),
        ...qs.questions.flatMap(q => q.options.flatMap(o => o.items)),
    ]
}

/**
 * Which section the template puts each item in, keyed by normalised text.
 * A text the template files in two different sections is dropped rather than
 * guessed at — there is no basis for picking one.
 */
function templateCategoryByText(template: PackingListQuestionSet): Map<string, string> {
    const byText = new Map<string, string>()
    const ambiguous = new Set<string>()
    for (const item of everyItemIn(template)) {
        if (!item.category) continue
        const key = normalize(item.text)
        const seen = byText.get(key)
        if (seen !== undefined && seen !== item.category) ambiguous.add(key)
        else byText.set(key, item.category)
    }
    for (const key of ambiguous) byText.delete(key)
    return byText
}

/**
 * Offer to file a set written before the template carried sections. Sections are
 * the one template change `addItem` can't deliver: matching is by item text, so
 * an item the user already has is never revisited, and a category-only change
 * would otherwise be invisible to every existing user.
 *
 * Only offered when the user has never used sections themselves
 * (`sectionNamesIn` is empty). Once they have, an absent category means "I put
 * this back in the main pile" — `applySectionLayout` stores exactly that — and
 * there is no way to tell that apart from "this predates sections". Guessing
 * would silently undo their arrangement, so we don't ask.
 */
function buildSetCategoriesSuggestion(
    qs: PackingListQuestionSet,
    template: PackingListQuestionSet,
): SetCategoriesSuggestion | undefined {
    if (sectionNamesIn(qs).length > 0) return undefined

    const byText = templateCategoryByText(template)
    if (byText.size === 0) return undefined

    const categories: Record<string, string> = {}
    let itemCount = 0
    for (const item of everyItemIn(qs)) {
        if (item.category || item.deletedAt) continue
        const category = byText.get(normalize(item.text))
        if (category === undefined) continue
        categories[normalize(item.text)] = category
        itemCount++
    }
    if (itemCount === 0) return undefined

    const sections = new Set(Object.values(categories))
    return {
        kind: 'setCategories',
        key: 'setCategories',
        label: `Sort ${itemCount} item${itemCount === 1 ? '' : 's'} into ${sections.size} sections (Day Bag, Clothes, Toiletries…)`,
        contextLabel: 'Organise your list',
        categories,
        itemCount,
    }
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

    // Two template items can share a text in one place: the Baby and Toddler
    // rates for "Spare clothes", the general and potty-training rates for
    // "Trousers/Shorts". They are separate additions reaching different people,
    // so each needs its own checkbox — a shared key would tie them together in
    // the review card and collide as a React key.
    const usedKeys = new Set<string>()
    const uniqueKey = (key: string): string => {
        let candidate = key
        for (let n = 2; usedKeys.has(candidate); n++) candidate = `${key}#${n}`
        usedKeys.add(candidate)
        return candidate
    }

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
                    key: uniqueKey(`addItem:${locationKey(location)}:${normalize(ti.text)}`),
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
            key: uniqueKey(`addItem:always:${normalize(ti.text)}`),
            label: ti.text,
            contextLabel: 'Always needed',
            location,
            item: ti,
        })
    }

    const setCategories = buildSetCategoriesSuggestion(qs, template)
    if (setCategories) suggestions.push(setCategories)

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
    const setCategories = accepted.find((s): s is SetCategoriesSuggestion => s.kind === 'setCategories')

    const stampItem = (i: Item): Item => ({ ...i, id: generateUUID(), lastModified: now })

    // Only fills a gap: an item that already carries a category keeps it, so
    // this can never move something the user has filed themselves, and items
    // inserted above already carry the template's own category.
    const fileItem = (i: Item): Item => {
        if (!setCategories || i.category) return i
        const category = setCategories.categories[normalize(i.text)]
        if (category === undefined) return i
        return { ...i, category, lastModified: now }
    }

    const addItemsToLocation = (location: ItemLocation, items: Item[]): Item[] => {
        const key = locationKey(location)
        const here = addItems.filter(s => locationKey(s.location) === key)
        return [...items.map(fileItem), ...here.map(s => stampItem(s.item))]
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
