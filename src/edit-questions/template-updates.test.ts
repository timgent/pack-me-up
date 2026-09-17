import { describe, it, expect } from 'vitest'
import { createExampleData, WIZARD_TEMPLATE_VERSION, TEMPLATE_QUESTION_IDS, ACTIVITY_OPTION_IDS } from './example-data'
import { buildTemplateUpdateSuggestions, applyTemplateUpdates } from './template-updates'
import { PackingListQuestionSet, Person } from './types'

const adult: Person = { id: 'a1', name: 'Alice', ageRange: 'Adult', gender: 'female' }

// A saved set identical to the current template but stamped as an older
// version, so it represents a user who set up before the latest updates.
function baseSet(people: Person[] = [adult]): PackingListQuestionSet {
    const generated = JSON.parse(JSON.stringify(createExampleData(people, []))) as PackingListQuestionSet
    return { ...generated, _id: '1', templateVersion: 0 }
}

function findQuestion(set: PackingListQuestionSet, id: string) {
    return set.questions.find(q => q.id === id)!
}

describe('buildTemplateUpdateSuggestions', () => {
    it('returns nothing when the set already matches the template', () => {
        expect(buildTemplateUpdateSuggestions(baseSet())).toEqual([])
    })

    it('suggests an item missing from an existing option', () => {
        const set = baseSet()
        const hot = findQuestion(set, TEMPLATE_QUESTION_IDS.weather).options.find(o => o.text === 'Hot')!
        hot.items = hot.items.filter(i => i.text !== 'Sunscreen')

        const suggestions = buildTemplateUpdateSuggestions(set)
        expect(suggestions).toHaveLength(1)
        expect(suggestions[0].kind).toBe('addItem')
        expect(suggestions[0].label).toBe('Sunscreen')
        expect(suggestions[0]).toMatchObject({
            location: { kind: 'option', questionId: TEMPLATE_QUESTION_IDS.weather, optionId: hot.id },
        })
    })

    // The template deliberately carries two rates under one text where they
    // reach different people — Baby and Toddler "Spare clothes", the general
    // and potty-training "Trousers/Shorts". A user missing the text is offered
    // both, and the review card keys its checkboxes (and its React rows) on
    // `key`, so the pair must not share one.
    it('gives each copy of a repeated item text its own key', () => {
        const toddler: Person = { id: 't1', name: 'Tod', ageRange: 'Toddler' }
        const baby: Person = { id: 'b1', name: 'Bea', ageRange: 'Baby' }
        const set = baseSet([adult, toddler, baby])
        const overnightYes = findQuestion(set, TEMPLATE_QUESTION_IDS.overnight).options.find(o => o.text === 'Yes')!
        overnightYes.items = overnightYes.items.filter(i => i.text !== 'Trousers/Shorts')
        set.alwaysNeededItems = set.alwaysNeededItems.filter(i => i.text !== 'Spare clothes')

        const suggestions = buildTemplateUpdateSuggestions(set)
        expect(suggestions.filter(s => s.label === 'Trousers/Shorts')).toHaveLength(2)
        expect(suggestions.filter(s => s.label === 'Spare clothes')).toHaveLength(2)
        const keys = suggestions.map(s => s.key)
        expect(new Set(keys).size, 'suggestion keys must be unique').toBe(keys.length)

        // Both rates come back, so the toddler keeps their own.
        const updated = applyTemplateUpdates(set, suggestions)
        const restored = findQuestion(updated, TEMPLATE_QUESTION_IDS.overnight)
            .options.find(o => o.text === 'Yes')!.items
            .filter(i => i.text === 'Trousers/Shorts')
        expect(restored).toHaveLength(2)
    })

    it('suggests a missing always-needed item', () => {
        const set = baseSet()
        set.alwaysNeededItems = set.alwaysNeededItems.filter(i => i.text !== 'Snacks')

        const suggestions = buildTemplateUpdateSuggestions(set)
        expect(suggestions.map(s => s.label)).toContain('Snacks')
        const snacks = suggestions.find(s => s.label === 'Snacks')!
        expect(snacks).toMatchObject({ kind: 'addItem', location: { kind: 'always' } })
    })

    it('matches a question by text when its id differs (legacy set)', () => {
        const set = baseSet()
        const weather = findQuestion(set, TEMPLATE_QUESTION_IDS.weather)
        weather.id = 'legacy-weather-uuid'
        const hot = weather.options.find(o => o.text === 'Hot')!
        hot.items = hot.items.filter(i => i.text !== 'Sunscreen')

        const suggestions = buildTemplateUpdateSuggestions(set)
        expect(suggestions.map(s => s.label)).toEqual(['Sunscreen'])
        expect(suggestions[0]).toMatchObject({
            location: { kind: 'option', questionId: 'legacy-weather-uuid', optionId: hot.id },
        })
    })

    it('does not resurrect items from a question the user deleted', () => {
        const set = baseSet()
        const accommodation = findQuestion(set, TEMPLATE_QUESTION_IDS.accommodation)
        accommodation.deletedAt = '2026-01-01T00:00:00.000Z'
        accommodation.options = []
        expect(buildTemplateUpdateSuggestions(set)).toEqual([])
    })

    it('suggests a whole new option under an existing question', () => {
        const set = baseSet()
        const activities = findQuestion(set, TEMPLATE_QUESTION_IDS.activities)
        activities.options = activities.options.filter(o => o.id !== ACTIVITY_OPTION_IDS.hiking)

        const suggestions = buildTemplateUpdateSuggestions(set)
        expect(suggestions).toHaveLength(1)
        expect(suggestions[0]).toMatchObject({
            kind: 'addOption',
            label: 'Hiking',
            questionId: TEMPLATE_QUESTION_IDS.activities,
        })
    })

    it('suggests a whole new question when the user has none like it', () => {
        const set = baseSet()
        set.questions = set.questions.filter(q => q.id !== TEMPLATE_QUESTION_IDS.abroad)

        const suggestions = buildTemplateUpdateSuggestions(set)
        expect(suggestions).toHaveLength(1)
        expect(suggestions[0]).toMatchObject({ kind: 'addQuestion', label: 'Are you travelling abroad?' })
    })

    it('does not re-suggest a renamed legacy question whose items already exist', () => {
        const set = baseSet()
        const overnight = findQuestion(set, TEMPLATE_QUESTION_IDS.overnight)
        overnight.id = 'legacy-overnight-uuid'
        overnight.text = 'Sleeping over somewhere?'

        expect(buildTemplateUpdateSuggestions(set)).toEqual([])
    })

    it('ignores deleted people when regenerating the reference template', () => {
        const set = baseSet()
        set.people = [adult, { id: 'baby1', name: 'Baby', ageRange: 'Baby', deletedAt: '2026-01-01T00:00:00.000Z' }]
        set.alwaysNeededItems = set.alwaysNeededItems.filter(i => i.text !== 'Snacks')

        const suggestions = buildTemplateUpdateSuggestions(set)
        expect(suggestions.map(s => s.label)).toEqual(['Snacks'])
    })
})

describe('applyTemplateUpdates', () => {
    it('stamps the current template version even when nothing is accepted (dismiss)', () => {
        const set = baseSet()
        const updated = applyTemplateUpdates(set, [])
        expect(updated.templateVersion).toBe(WIZARD_TEMPLATE_VERSION)
        expect(updated.questions).toHaveLength(set.questions.length)
        expect(updated.alwaysNeededItems).toHaveLength(set.alwaysNeededItems.length)
    })

    it('inserts an accepted item with a fresh id and stamps the version', () => {
        const set = baseSet()
        const hot = findQuestion(set, TEMPLATE_QUESTION_IDS.weather).options.find(o => o.text === 'Hot')!
        hot.items = hot.items.filter(i => i.text !== 'Sunscreen')

        const suggestions = buildTemplateUpdateSuggestions(set)
        const updated = applyTemplateUpdates(set, suggestions)

        expect(updated.templateVersion).toBe(WIZARD_TEMPLATE_VERSION)
        const updatedHot = findQuestion(updated, TEMPLATE_QUESTION_IDS.weather).options.find(o => o.text === 'Hot')!
        const inserted = updatedHot.items.find(i => i.text === 'Sunscreen')!
        expect(inserted).toBeTruthy()
        expect(inserted.id).toBeTruthy()
        expect(inserted.lastModified).toBeTruthy()
        expect(inserted.personSelections.some(ps => ps.personId === adult.id && ps.selected)).toBe(true)
    })

    it('only inserts the accepted subset', () => {
        const set = baseSet()
        const hot = findQuestion(set, TEMPLATE_QUESTION_IDS.weather).options.find(o => o.text === 'Hot')!
        hot.items = hot.items.filter(i => i.text !== 'Sunscreen' && i.text !== 'Sun hat')

        const suggestions = buildTemplateUpdateSuggestions(set)
        const onlySunscreen = suggestions.filter(s => s.label === 'Sunscreen')
        const updated = applyTemplateUpdates(set, onlySunscreen)

        const updatedHot = findQuestion(updated, TEMPLATE_QUESTION_IDS.weather).options.find(o => o.text === 'Hot')!
        expect(updatedHot.items.some(i => i.text === 'Sunscreen')).toBe(true)
        expect(updatedHot.items.some(i => i.text === 'Sun hat')).toBe(false)
    })

    it('inserts a new option with fresh item ids', () => {
        const set = baseSet()
        const activities = findQuestion(set, TEMPLATE_QUESTION_IDS.activities)
        activities.options = activities.options.filter(o => o.id !== ACTIVITY_OPTION_IDS.hiking)

        const suggestions = buildTemplateUpdateSuggestions(set)
        const updated = applyTemplateUpdates(set, suggestions)

        const hiking = findQuestion(updated, TEMPLATE_QUESTION_IDS.activities).options.find(o => o.text === 'Hiking')
        expect(hiking).toBeTruthy()
        expect(hiking!.items.length).toBeGreaterThan(0)
        expect(hiking!.items.every(i => i.id)).toBe(true)
    })

    it('appends a new question after the existing ones', () => {
        const set = baseSet()
        set.questions = set.questions.filter(q => q.id !== TEMPLATE_QUESTION_IDS.abroad)
        const maxOrderBefore = Math.max(...set.questions.map(q => q.order))

        const suggestions = buildTemplateUpdateSuggestions(set)
        const updated = applyTemplateUpdates(set, suggestions)

        const abroad = updated.questions.find(q => q.text === 'Are you travelling abroad?')!
        expect(abroad).toBeTruthy()
        expect(abroad.order).toBeGreaterThan(maxOrderBefore)
        expect(abroad.type).toBe('saved')
        expect(abroad.options.flatMap(o => o.items).every(i => i.id)).toBe(true)
    })
})

describe('buildTemplateUpdateSuggestions - filing an uncategorised set into sections', () => {
    /** A set as it looked before the template carried categories. */
    function uncategorisedSet(people: Person[] = [adult]): PackingListQuestionSet {
        const set = baseSet(people)
        for (const item of set.alwaysNeededItems) delete item.category
        for (const q of set.questions) {
            for (const o of q.options) for (const i of o.items) delete i.category
        }
        return set
    }

    const setCategoriesFrom = (set: PackingListQuestionSet) =>
        buildTemplateUpdateSuggestions(set).find(s => s.kind === 'setCategories')

    it('offers to file a set that has no categories anywhere', () => {
        const suggestion = setCategoriesFrom(uncategorisedSet())
        expect(suggestion).toBeTruthy()
        expect(suggestion).toMatchObject({ kind: 'setCategories', contextLabel: 'Organise your list' })
        expect(suggestion!.kind === 'setCategories' && suggestion.itemCount).toBeGreaterThan(20)
    })

    it('does not offer it for a set already generated from the current template', () => {
        expect(setCategoriesFrom(baseSet())).toBeUndefined()
    })

    // An absent category is how "back in the main pile" is stored, so once the
    // user has arranged sections we cannot tell that apart from legacy data.
    it('stays silent once the user has made a section of their own', () => {
        const set = uncategorisedSet()
        set.alwaysNeededItems[0].category = 'My own section'
        expect(setCategoriesFrom(set)).toBeUndefined()
    })

    it('files matching items and leaves unknown ones alone', () => {
        const set = uncategorisedSet()
        set.alwaysNeededItems.push({
            text: 'Something I invented',
            personSelections: [{ personId: adult.id, selected: true }],
        })

        const updated = applyTemplateUpdates(set, buildTemplateUpdateSuggestions(set))

        const charger = updated.alwaysNeededItems.find(i => i.text === 'Phone charger')!
        expect(charger.category).toBe('Day Bag')
        expect(charger.lastModified).toBeTruthy()

        const overnightYes = updated.questions
            .find(q => q.id === TEMPLATE_QUESTION_IDS.overnight)!
            .options.find(o => o.text === 'Yes')!
        expect(overnightYes.items.find(i => i.text === 'Toothbrush')!.category).toBe('Toiletries')
        expect(overnightYes.items.find(i => i.text === 'Underwear')!.category).toBe('Clothes')

        expect(updated.alwaysNeededItems.find(i => i.text === 'Something I invented')!.category).toBeUndefined()
    })

    it('never moves an item the user has already filed', () => {
        const set = uncategorisedSet()
        const charger = set.alwaysNeededItems.find(i => i.text === 'Phone charger')!
        charger.category = 'Hand luggage'

        // Gated off entirely once a section exists, so nothing is offered — and
        // applying the rest must still leave their choice untouched.
        expect(setCategoriesFrom(set)).toBeUndefined()
        const updated = applyTemplateUpdates(set, buildTemplateUpdateSuggestions(set))
        expect(updated.alwaysNeededItems.find(i => i.text === 'Phone charger')!.category).toBe('Hand luggage')
    })

    it('is declined independently of the additive suggestions', () => {
        const set = uncategorisedSet()
        set.alwaysNeededItems = set.alwaysNeededItems.filter(i => i.text !== 'Snacks')

        const suggestions = buildTemplateUpdateSuggestions(set)
        const withoutFiling = suggestions.filter(s => s.kind !== 'setCategories')
        const updated = applyTemplateUpdates(set, withoutFiling)

        expect(updated.alwaysNeededItems.find(i => i.text === 'Snacks')).toBeTruthy()
        expect(updated.alwaysNeededItems.find(i => i.text === 'Phone charger')!.category).toBeUndefined()
    })
})
