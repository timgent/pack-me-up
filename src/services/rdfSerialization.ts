import {
    createSolidDataset,
    setThing,
    buildThing,
    getThing,
    getUrlAll,
    getStringNoLocale,
    getStringNoLocaleAll,
    getBoolean,
    getInteger,
    getDecimal,
    getDatetime,
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
    AgeRange,
} from '../edit-questions/types'
import { AgeRangeSchema } from '../edit-questions/types'

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

    if (list.nights !== undefined) {
        rootBuilder = rootBuilder.addInteger(PMU.nights, list.nights)
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

    for (const guest of (list.guests ?? [])) {
        const guestUrl = `${datasetUrl}#guest-${guest.id}`
        rootBuilder = rootBuilder.addUrl(PMU.hasGuest, guestUrl)
        ds = setThing(ds, buildThing({ url: guestUrl })
            .addStringNoLocale(PMU.name, guest.name)
            .build())
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
    const nights = getInteger(rootThing, PMU.nights)

    const items = getUrlAll(rootThing, PMU.hasItem)
        .map(url => thingToPackingListItem(getThing(dataset, url), url))
        .filter((item): item is PackingListItem => item !== null)

    const deletedItems = getUrlAll(rootThing, PMU.hasDeletedItem)
        .map(url => thingToPackingListItem(getThing(dataset, url), url))
        .filter((item): item is PackingListItem => item !== null)

    const guests = getUrlAll(rootThing, PMU.hasGuest)
        .map(url => {
            const thing = getThing(dataset, url)
            if (!thing) return null
            const id = (url.split('#')[1] ?? '').replace('guest-', '')
            const name = getStringNoLocale(thing, PMU.name) ?? ''
            return { id, name }
        })
        .filter((g): g is { id: string; name: string } => g !== null)

    return {
        id,
        name,
        createdAt,
        ...(lastModified !== undefined ? { lastModified } : {}),
        ...(nights !== null ? { nights } : {}),
        items,
        deletedItems,
        ...(guests.length > 0 ? { guests } : {}),
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

    if (item.communal !== undefined) t = t.addBoolean(PMU.communal, item.communal)
    if (item.quantity !== undefined) t = t.addInteger(PMU.quantity, item.quantity)
    if (item.category !== undefined) t = t.addStringNoLocale(PMU.category, item.category)
    if (item.reviewed !== undefined) t = t.addBoolean(PMU.reviewed, item.reviewed)
    if (item.lastModified !== undefined) t = t.addDatetime(PMU.itemLastModified, new Date(item.lastModified))

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
    const communal = getBoolean(thing, PMU.communal)
    const quantity = getInteger(thing, PMU.quantity)
    const category = getStringNoLocale(thing, PMU.category) ?? undefined
    const reviewed = getBoolean(thing, PMU.reviewed)
    const itemLastModified = getDatetime(thing, PMU.itemLastModified)?.toISOString()

    return {
        id,
        itemText,
        personId,
        personName,
        questionId,
        optionId,
        packed,
        ...(communal !== null ? { communal } : {}),
        ...(quantity !== null ? { quantity } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(reviewed !== null ? { reviewed } : {}),
        ...(itemLastModified !== undefined ? { lastModified: itemLastModified } : {}),
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
    if (person.species) t = t.addStringNoLocale(PMU.species, person.species)
    if (person.dateOfBirth) t = t.addStringNoLocale(PMU.dateOfBirth, person.dateOfBirth)
    if (person.lastModified) t = t.addDatetime(PMU.personLastModified, new Date(person.lastModified))
    if (person.deletedAt) t = t.addDatetime(PMU.personDeletedAt, new Date(person.deletedAt))

    return t.build()
}

function thingToPerson(thing: Thing | null, url: string): Person | null {
    if (!thing) return null
    const id = (url.split('#')[1] ?? '').replace(/^person-/, '') || url
    const name = getStringNoLocale(thing, PMU.name) ?? ''
    const ageRange = getStringNoLocale(thing, PMU.ageRange) ?? undefined
    const gender = getStringNoLocale(thing, PMU.gender) ?? undefined
    const species = getStringNoLocale(thing, PMU.species) ?? undefined
    const dateOfBirth = getStringNoLocale(thing, PMU.dateOfBirth) ?? undefined
    const lastModified = getDatetime(thing, PMU.personLastModified)?.toISOString()
    const deletedAt = getDatetime(thing, PMU.personDeletedAt)?.toISOString()
    return {
        id,
        name,
        ...(ageRange !== undefined ? { ageRange: ageRange as Person['ageRange'] } : {}),
        ...(gender !== undefined ? { gender: gender as Person['gender'] } : {}),
        ...(species !== undefined ? { species: species as Person['species'] } : {}),
        ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
        ...(lastModified !== undefined ? { lastModified } : {}),
        ...(deletedAt !== undefined ? { deletedAt } : {}),
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
    if (question.lastModified) {
        qBuilder = qBuilder.addDatetime(PMU.questionLastModified, new Date(question.lastModified))
    }
    if (question.deletedAt) {
        qBuilder = qBuilder.addDatetime(PMU.questionDeletedAt, new Date(question.deletedAt))
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

    const id = (url.split('#')[1] ?? '').replace(/^question-/, '') || url
    const text = getStringNoLocale(thing, PMU.text) ?? ''
    const type = (getStringNoLocale(thing, PMU.questionStatus) ?? 'saved') as Question['type']
    const order = getInteger(thing, PMU.order) ?? 0
    const questionType = getStringNoLocale(thing, PMU.questionType) ?? undefined
    const lastModified = getDatetime(thing, PMU.questionLastModified)?.toISOString()
    const deletedAt = getDatetime(thing, PMU.questionDeletedAt)?.toISOString()

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
        ...(lastModified !== undefined ? { lastModified } : {}),
        ...(deletedAt !== undefined ? { deletedAt } : {}),
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

    if (item.id) itemBuilder = itemBuilder.addStringNoLocale(PMU.questionItemId, item.id)
    if (item.communal !== undefined) itemBuilder = itemBuilder.addBoolean(PMU.communal, item.communal)
    // perNight is stored as a decimal to allow rates like 0.5 per night
    if (item.perNight !== undefined) itemBuilder = itemBuilder.addDecimal(PMU.perNight, item.perNight)
    if (item.maxQuantity !== undefined) itemBuilder = itemBuilder.addInteger(PMU.maxQuantity, item.maxQuantity)
    for (const ageRange of item.ageRanges ?? []) {
        itemBuilder = itemBuilder.addStringNoLocale(PMU.hasAgeRange, ageRange)
    }
    if (item.lastModified) itemBuilder = itemBuilder.addDatetime(PMU.questionItemLastModified, new Date(item.lastModified))
    if (item.deletedAt) itemBuilder = itemBuilder.addDatetime(PMU.questionItemDeletedAt, new Date(item.deletedAt))

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

// ── SharedWithMe ──────────────────────────────────────────────────────────────

export interface SharedContext {
    podUrl: string
    webId?: string
    label?: string
    addedAt: string
}

export interface SharedWithMeList {
    contexts: SharedContext[]
    lastModified: string
}

export function sharedWithMeToDataset(list: SharedWithMeList, datasetUrl: string): SolidDataset {
    let ds = createSolidDataset()

    let rootBuilder = buildThing({ url: datasetUrl })
        .addUrl(RDF.type, PMU.SharedWithMeList)
        .addDatetime(DCTERMS.modified, new Date(list.lastModified))

    for (let i = 0; i < list.contexts.length; i++) {
        const ctx = list.contexts[i]
        const ctxUrl = `${datasetUrl}#ctx-${i}`
        rootBuilder = rootBuilder.addUrl(PMU.hasSharedContext, ctxUrl)

        let ctxBuilder = buildThing({ url: ctxUrl })
            .addUrl(RDF.type, PMU.SharedContext)
            .addStringNoLocale(PMU.sharedPodUrl, ctx.podUrl)
            .addDatetime(PMU.sharedAddedAt, new Date(ctx.addedAt))

        if (ctx.webId) ctxBuilder = ctxBuilder.addStringNoLocale(PMU.sharedWebId, ctx.webId)
        if (ctx.label) ctxBuilder = ctxBuilder.addStringNoLocale(PMU.sharedLabel, ctx.label)

        ds = setThing(ds, ctxBuilder.build())
    }

    return setThing(ds, rootBuilder.build())
}

export function datasetToSharedWithMe(dataset: SolidDataset, datasetUrl: string): SharedWithMeList {
    const rootThing = getThing(dataset, datasetUrl)
    if (!rootThing) throw new Error(`No root Thing at ${datasetUrl}`)

    const lastModified = getDatetime(rootThing, DCTERMS.modified)?.toISOString() ?? new Date().toISOString()
    const ctxUrls = getUrlAll(rootThing, PMU.hasSharedContext)

    const contexts: SharedContext[] = ctxUrls
        .map(url => {
            const t = getThing(dataset, url)
            if (!t) return null
            const podUrl = getStringNoLocale(t, PMU.sharedPodUrl) ?? ''
            const addedAt = getDatetime(t, PMU.sharedAddedAt)?.toISOString() ?? new Date().toISOString()
            const webId = getStringNoLocale(t, PMU.sharedWebId) ?? undefined
            const label = getStringNoLocale(t, PMU.sharedLabel) ?? undefined
            const ctx: SharedContext = { podUrl, addedAt }
            if (webId) ctx.webId = webId
            if (label) ctx.label = label
            return ctx
        })
        .filter((c): c is SharedContext => c !== null)

    return { contexts, lastModified }
}

// ── SharedListsWithMe ─────────────────────────────────────────────────────────

export interface SharedListContext {
    listId: string
    listUrl: string
    podUrl: string
    ownerWebId?: string
    label?: string
    addedAt: string
}

export interface SharedListsWithMe {
    lists: SharedListContext[]
    lastModified: string
}

export function sharedListsWithMeToDataset(data: SharedListsWithMe, datasetUrl: string): SolidDataset {
    let ds = createSolidDataset()

    let rootBuilder = buildThing({ url: datasetUrl })
        .addUrl(RDF.type, PMU.SharedListsWithMe)
        .addDatetime(DCTERMS.modified, new Date(data.lastModified))

    for (let i = 0; i < data.lists.length; i++) {
        const item = data.lists[i]
        const itemUrl = `${datasetUrl}#list-${i}`
        rootBuilder = rootBuilder.addUrl(PMU.hasSharedList, itemUrl)

        let itemBuilder = buildThing({ url: itemUrl })
            .addUrl(RDF.type, PMU.SharedListContext)
            .addStringNoLocale(PMU.sharedListId, item.listId)
            .addStringNoLocale(PMU.sharedListUrl, item.listUrl)
            .addStringNoLocale(PMU.sharedPodUrl, item.podUrl)
            .addDatetime(PMU.sharedAddedAt, new Date(item.addedAt))

        if (item.ownerWebId) itemBuilder = itemBuilder.addStringNoLocale(PMU.sharedWebId, item.ownerWebId)
        if (item.label) itemBuilder = itemBuilder.addStringNoLocale(PMU.sharedListLabel, item.label)

        ds = setThing(ds, itemBuilder.build())
    }

    return setThing(ds, rootBuilder.build())
}

export function datasetToSharedListsWithMe(dataset: SolidDataset, datasetUrl: string): SharedListsWithMe {
    const rootThing = getThing(dataset, datasetUrl)
    if (!rootThing) throw new Error(`No root Thing at ${datasetUrl}`)

    const lastModified = getDatetime(rootThing, DCTERMS.modified)?.toISOString() ?? new Date().toISOString()
    const listUrls = getUrlAll(rootThing, PMU.hasSharedList)

    const lists: SharedListContext[] = listUrls
        .map(url => {
            const t = getThing(dataset, url)
            if (!t) return null
            const listId = getStringNoLocale(t, PMU.sharedListId) ?? ''
            const listUrl = getStringNoLocale(t, PMU.sharedListUrl) ?? ''
            const podUrl = getStringNoLocale(t, PMU.sharedPodUrl) ?? ''
            const addedAt = getDatetime(t, PMU.sharedAddedAt)?.toISOString() ?? new Date().toISOString()
            const ownerWebId = getStringNoLocale(t, PMU.sharedWebId) ?? undefined
            const label = getStringNoLocale(t, PMU.sharedListLabel) ?? undefined
            const ctx: SharedListContext = { listId, listUrl, podUrl, addedAt }
            if (ownerWebId) ctx.ownerWebId = ownerWebId
            if (label) ctx.label = label
            return ctx
        })
        .filter((c): c is SharedListContext => c !== null)

    return { lists, lastModified }
}

function thingToQuestionItem(dataset: SolidDataset, url: string): Item | null {
    const thing = getThing(dataset, url)
    if (!thing) return null

    const text = getStringNoLocale(thing, PMU.text) ?? ''
    const id = getStringNoLocale(thing, PMU.questionItemId) ?? undefined
    const communal = getBoolean(thing, PMU.communal)
    const perNight = getDecimal(thing, PMU.perNight)
    const maxQuantity = getInteger(thing, PMU.maxQuantity)
    const lastModified = getDatetime(thing, PMU.questionItemLastModified)?.toISOString()
    const deletedAt = getDatetime(thing, PMU.questionItemDeletedAt)?.toISOString()

    // RDF multi-values are unordered — restore the canonical bracket order
    const bracketOrder = AgeRangeSchema.options
    const ageRanges = getStringNoLocaleAll(thing, PMU.hasAgeRange)
        .filter((r): r is AgeRange => (bracketOrder as readonly string[]).includes(r))
        .sort((a, b) => bracketOrder.indexOf(a) - bracketOrder.indexOf(b))

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

    return {
        text,
        personSelections,
        ...(id !== undefined ? { id } : {}),
        ...(communal !== null ? { communal } : {}),
        ...(perNight !== null ? { perNight } : {}),
        ...(maxQuantity !== null ? { maxQuantity } : {}),
        ...(ageRanges.length > 0 ? { ageRanges } : {}),
        ...(lastModified !== undefined ? { lastModified } : {}),
        ...(deletedAt !== undefined ? { deletedAt } : {}),
    }
}
