import {
    createSolidDataset,
    setThing,
    buildThing,
    getThing,
    getUrlAll,
    getStringNoLocale,
    getBoolean,
    getInteger,
    getDatetime,
    addStringNoLocale,
    addBoolean,
    addInteger,
    addDatetime,
    addUrl,
} from '@inrupt/solid-client'
import type { SolidDataset, Thing } from '@inrupt/solid-client'
import { PMU, RDF, DCTERMS } from './rdfVocab'
import type { PackingList, PackingListItem } from '../create-packing-list/types'
import type {
    PackingListQuestionSet,
    Person,
    Question,
    Option,
    Item,
    PersonSelection,
} from '../edit-questions/types'

// ── PackingList ───────────────────────────────────────────────────────────────

export function packingListToDataset(list: PackingList, datasetUrl: string): SolidDataset {
    let ds = createSolidDataset()

    let rootBuilder = buildThing({ url: datasetUrl })
        .addUrl(RDF.type, PMU.PackingList)
        .addStringNoLocale(PMU.name, list.name)
        .addDatetime(DCTERMS.created, new Date(list.createdAt))

    if (list.lastModified) {
        rootBuilder = rootBuilder.addDatetime(DCTERMS.modified, new Date(list.lastModified))
    }

    for (const item of list.items) {
        const itemUrl = `${datasetUrl}#item-${item.id}`
        rootBuilder = rootBuilder.addUrl(PMU.hasItem, itemUrl)
        ds = setThing(ds, packingListItemToThing(item, itemUrl))
    }

    for (const item of list.deletedItems ?? []) {
        const itemUrl = `${datasetUrl}#deleted-item-${item.id}`
        rootBuilder = rootBuilder.addUrl(PMU.hasDeletedItem, itemUrl)
        ds = setThing(ds, packingListItemToThing(item, itemUrl))
    }

    return setThing(ds, rootBuilder.build())
}

export function datasetToPackingList(dataset: SolidDataset, datasetUrl: string): PackingList {
    const rootThing = getThing(dataset, datasetUrl)
    if (!rootThing) throw new Error(`No root Thing at ${datasetUrl}`)

    const name = getStringNoLocale(rootThing, PMU.name) ?? ''
    const createdAt = getDatetime(rootThing, DCTERMS.created)?.toISOString() ?? new Date().toISOString()
    const lastModifiedDate = getDatetime(rootThing, DCTERMS.modified)
    const lastModified = lastModifiedDate?.toISOString()

    const id = datasetUrl.split('/').pop()?.replace('.ttl', '') ?? datasetUrl

    const items = getUrlAll(rootThing, PMU.hasItem)
        .map(url => thingToPackingListItem(getThing(dataset, url), url))
        .filter((item): item is PackingListItem => item !== null)

    const deletedItems = getUrlAll(rootThing, PMU.hasDeletedItem)
        .map(url => thingToPackingListItem(getThing(dataset, url), url))
        .filter((item): item is PackingListItem => item !== null)

    return {
        id,
        name,
        createdAt,
        ...(lastModified !== undefined ? { lastModified } : {}),
        items,
        deletedItems,
    }
}

function packingListItemToThing(item: PackingListItem, itemUrl: string): Thing {
    let t = buildThing({ url: itemUrl })
        .addUrl(RDF.type, PMU.PackingListItem)
        .addStringNoLocale(PMU.itemText, item.itemText)
        .addStringNoLocale(PMU.personId, item.personId)
        .addStringNoLocale(PMU.personName, item.personName)
        .addStringNoLocale(PMU.questionId, item.questionId)
        .addStringNoLocale(PMU.optionId, item.optionId)
        .addBoolean(PMU.packed, item.packed)

    if (item.category !== undefined) t = t.addStringNoLocale(PMU.category, item.category)
    if (item.reviewed !== undefined) t = t.addBoolean(PMU.reviewed, item.reviewed)

    return t.build()
}

function thingToPackingListItem(thing: Thing | null, url: string): PackingListItem | null {
    if (!thing) return null

    const fragment = url.split('#')[1] ?? ''
    const id = fragment.replace(/^(item-|deleted-item-)/, '')
    const itemText = getStringNoLocale(thing, PMU.itemText) ?? ''
    const personId = getStringNoLocale(thing, PMU.personId) ?? ''
    const personName = getStringNoLocale(thing, PMU.personName) ?? ''
    const questionId = getStringNoLocale(thing, PMU.questionId) ?? ''
    const optionId = getStringNoLocale(thing, PMU.optionId) ?? ''
    const packed = getBoolean(thing, PMU.packed) ?? false
    const category = getStringNoLocale(thing, PMU.category) ?? undefined
    const reviewed = getBoolean(thing, PMU.reviewed)

    return {
        id,
        itemText,
        personId,
        personName,
        questionId,
        optionId,
        packed,
        ...(category !== undefined ? { category } : {}),
        ...(reviewed !== null ? { reviewed } : {}),
    }
}

// ── QuestionSet ───────────────────────────────────────────────────────────────

export function questionSetToDataset(qs: PackingListQuestionSet, datasetUrl: string): SolidDataset {
    let ds = createSolidDataset()

    let rootBuilder = buildThing({ url: datasetUrl })
        .addUrl(RDF.type, PMU.QuestionSet)

    if (qs.lastModified) {
        rootBuilder = rootBuilder.addDatetime(DCTERMS.modified, new Date(qs.lastModified))
    }

    for (const person of qs.people) {
        const personUrl = `${datasetUrl}#person-${person.id}`
        rootBuilder = rootBuilder.addUrl(PMU.hasPerson, personUrl)
        ds = setThing(ds, personToThing(person, personUrl))
    }

    for (const question of qs.questions) {
        const questionUrl = `${datasetUrl}#question-${question.id}`
        rootBuilder = rootBuilder.addUrl(PMU.hasQuestion, questionUrl)
        const { questionThing, extras } = questionToThings(question, questionUrl, datasetUrl)
        ds = setThing(ds, questionThing)
        for (const t of extras) ds = setThing(ds, t)
    }

    for (let i = 0; i < qs.alwaysNeededItems.length; i++) {
        const itemUrl = `${datasetUrl}#always-item-${i}`
        rootBuilder = rootBuilder.addUrl(PMU.hasAlwaysNeededItem, itemUrl)
        const { itemThing, extras } = questionItemToThings(qs.alwaysNeededItems[i], itemUrl)
        ds = setThing(ds, itemThing)
        for (const t of extras) ds = setThing(ds, t)
    }

    return setThing(ds, rootBuilder.build())
}

export function datasetToQuestionSet(dataset: SolidDataset, datasetUrl: string): PackingListQuestionSet {
    const rootThing = getThing(dataset, datasetUrl)
    if (!rootThing) throw new Error(`No root Thing at ${datasetUrl}`)

    const lastModifiedDate = getDatetime(rootThing, DCTERMS.modified)
    const lastModified = lastModifiedDate?.toISOString()

    const people = getUrlAll(rootThing, PMU.hasPerson)
        .map(url => thingToPerson(getThing(dataset, url), url))
        .filter((p): p is Person => p !== null)

    const questions = getUrlAll(rootThing, PMU.hasQuestion)
        .map(url => thingToQuestion(dataset, url))
        .filter((q): q is Question => q !== null)
        .sort((a, b) => a.order - b.order)

    const alwaysItemUrls = getUrlAll(rootThing, PMU.hasAlwaysNeededItem)
    alwaysItemUrls.sort((a, b) => {
        const ia = parseInt(a.split('#always-item-')[1] ?? '0')
        const ib = parseInt(b.split('#always-item-')[1] ?? '0')
        return ia - ib
    })
    const alwaysNeededItems = alwaysItemUrls
        .map(url => thingToQuestionItem(dataset, url))
        .filter((item): item is Item => item !== null)

    return {
        _id: '1',
        people,
        questions,
        alwaysNeededItems,
        ...(lastModified !== undefined ? { lastModified } : {}),
    }
}

function personToThing(person: Person, personUrl: string): Thing {
    let t = buildThing({ url: personUrl })
        .addUrl(RDF.type, PMU.Person)
        .addStringNoLocale(PMU.name, person.name)

    if (person.ageRange) t = t.addStringNoLocale(PMU.ageRange, person.ageRange)
    if (person.gender) t = t.addStringNoLocale(PMU.gender, person.gender)

    return t.build()
}

function thingToPerson(thing: Thing | null, url: string): Person | null {
    if (!thing) return null
    const id = url.split('#person-')[1] ?? url
    const name = getStringNoLocale(thing, PMU.name) ?? ''
    const ageRange = getStringNoLocale(thing, PMU.ageRange) ?? undefined
    const gender = getStringNoLocale(thing, PMU.gender) ?? undefined
    return {
        id,
        name,
        ...(ageRange !== undefined ? { ageRange: ageRange as Person['ageRange'] } : {}),
        ...(gender !== undefined ? { gender: gender as Person['gender'] } : {}),
    }
}

function questionToThings(
    question: Question,
    questionUrl: string,
    datasetUrl: string
): { questionThing: Thing; extras: Thing[] } {
    const extras: Thing[] = []

    let qBuilder = buildThing({ url: questionUrl })
        .addUrl(RDF.type, PMU.Question)
        .addStringNoLocale(PMU.text, question.text)
        .addStringNoLocale(PMU.questionStatus, question.type)
        .addInteger(PMU.order, question.order)

    if (question.questionType) {
        qBuilder = qBuilder.addStringNoLocale(PMU.questionType, question.questionType)
    }

    for (const option of question.options) {
        const optionUrl = `${datasetUrl}#option-${option.id}`
        qBuilder = qBuilder.addUrl(PMU.hasOption, optionUrl)
        const { optionThing, extras: optExtras } = optionToThings(option, optionUrl, datasetUrl)
        extras.push(optionThing, ...optExtras)
    }

    return { questionThing: qBuilder.build(), extras }
}

function thingToQuestion(dataset: SolidDataset, url: string): Question | null {
    const thing = getThing(dataset, url)
    if (!thing) return null

    const id = url.split('#question-')[1] ?? url
    const text = getStringNoLocale(thing, PMU.text) ?? ''
    const type = (getStringNoLocale(thing, PMU.questionStatus) ?? 'saved') as Question['type']
    const order = getInteger(thing, PMU.order) ?? 0
    const questionType = getStringNoLocale(thing, PMU.questionType) ?? undefined

    const optionUrls = getUrlAll(thing, PMU.hasOption)
    const options = optionUrls
        .map(optUrl => thingToOption(dataset, optUrl))
        .filter((o): o is Option => o !== null)
        .sort((a, b) => a.order - b.order)

    return {
        id,
        text,
        type,
        order,
        options,
        ...(questionType !== undefined ? { questionType: questionType as Question['questionType'] } : {}),
    }
}

function optionToThings(
    option: Option,
    optionUrl: string,
    datasetUrl: string
): { optionThing: Thing; extras: Thing[] } {
    const extras: Thing[] = []

    let optBuilder = buildThing({ url: optionUrl })
        .addUrl(RDF.type, PMU.QuestionOption)
        .addStringNoLocale(PMU.text, option.text)
        .addInteger(PMU.order, option.order)

    for (let i = 0; i < option.items.length; i++) {
        const itemUrl = `${datasetUrl}#opt-item-${option.id}-${i}`
        optBuilder = optBuilder.addUrl(PMU.hasQuestionItem, itemUrl)
        const { itemThing, extras: itemExtras } = questionItemToThings(option.items[i], itemUrl)
        extras.push(itemThing, ...itemExtras)
    }

    return { optionThing: optBuilder.build(), extras }
}

function thingToOption(dataset: SolidDataset, url: string): Option | null {
    const thing = getThing(dataset, url)
    if (!thing) return null

    const id = url.split('#option-')[1] ?? url
    const text = getStringNoLocale(thing, PMU.text) ?? ''
    const order = getInteger(thing, PMU.order) ?? 0

    const itemUrls = getUrlAll(thing, PMU.hasQuestionItem)
    itemUrls.sort((a, b) => {
        // URLs are #opt-item-{optId}-{index} — sort by trailing index
        const ia = parseInt(a.split('-').pop() ?? '0')
        const ib = parseInt(b.split('-').pop() ?? '0')
        return ia - ib
    })
    const items = itemUrls
        .map(itemUrl => thingToQuestionItem(dataset, itemUrl))
        .filter((item): item is Item => item !== null)

    return { id, text, order, items }
}

function questionItemToThings(
    item: Item,
    itemUrl: string
): { itemThing: Thing; extras: Thing[] } {
    const extras: Thing[] = []

    let itemBuilder = buildThing({ url: itemUrl })
        .addUrl(RDF.type, PMU.QuestionItem)
        .addStringNoLocale(PMU.text, item.text)

    for (let i = 0; i < item.personSelections.length; i++) {
        const ps = item.personSelections[i]
        const psUrl = `${itemUrl}-ps-${i}`
        itemBuilder = itemBuilder.addUrl(PMU.hasPersonSelection, psUrl)
        extras.push(
            buildThing({ url: psUrl })
                .addUrl(RDF.type, PMU.PersonSelection)
                .addStringNoLocale(PMU.selectionPersonId, ps.personId)
                .addBoolean(PMU.selected, ps.selected)
                .addInteger(PMU.order, i)
                .build()
        )
    }

    return { itemThing: itemBuilder.build(), extras }
}

function thingToQuestionItem(dataset: SolidDataset, url: string): Item | null {
    const thing = getThing(dataset, url)
    if (!thing) return null

    const text = getStringNoLocale(thing, PMU.text) ?? ''

    const psUrls = getUrlAll(thing, PMU.hasPersonSelection)
    const personSelectionsWithOrder: Array<PersonSelection & { order: number }> = psUrls
        .map(psUrl => {
            const psThing = getThing(dataset, psUrl)
            if (!psThing) return null
            const personId = getStringNoLocale(psThing, PMU.selectionPersonId) ?? ''
            const selected = getBoolean(psThing, PMU.selected) ?? false
            const order = getInteger(psThing, PMU.order) ?? 0
            return { personId, selected, order }
        })
        .filter((ps): ps is PersonSelection & { order: number } => ps !== null)

    personSelectionsWithOrder.sort((a, b) => a.order - b.order)
    const personSelections: PersonSelection[] = personSelectionsWithOrder.map(({ personId, selected }) => ({ personId, selected }))

    return { text, personSelections }
}
