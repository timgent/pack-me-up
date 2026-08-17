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

    if (list.destination) {
        rootBuilder = rootBuilder.addStringNoLocale(PMU.destination, list.destination)
    }

    if (list.startDate) {
        rootBuilder = rootBuilder.addStringNoLocale(PMU.tripStartDate, list.startDate)
    }

    if (list.endDate) {
        rootBuilder = rootBuilder.addStringNoLocale(PMU.tripEndDate, list.endDate)
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

    for (const personId of (list.selectedPeopleIds ?? [])) {
        rootBuilder = rootBuilder.addStringNoLocale(PMU.selectedPersonId, personId)
    }

    for (const answer of (list.questionAnswers ?? [])) {
        const answerUrl = `${datasetUrl}#answer-${answer.questionId}`
        rootBuilder = rootBuilder.addUrl(PMU.hasAnswer, answerUrl)
        let answerBuilder = buildThing({ url: answerUrl })
            .addStringNoLocale(PMU.questionId, answer.questionId)
        for (const optionId of answer.selectedOptionIds) {
            answerBuilder = answerBuilder.addStringNoLocale(PMU.selectedOptionId, optionId)
        }
        ds = setThing(ds, answerBuilder.build())
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
    const destination = getStringNoLocale(rootThing, PMU.destination) ?? undefined
    const startDate = getStringNoLocale(rootThing, PMU.tripStartDate) ?? undefined
    const endDate = getStringNoLocale(rootThing, PMU.tripEndDate) ?? undefined

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

    const selectedPeopleIds = getStringNoLocaleAll(rootThing, PMU.selectedPersonId)

    const questionAnswers = getUrlAll(rootThing, PMU.hasAnswer)
        .map(url => {
            const thing = getThing(dataset, url)
            if (!thing) return null
            const questionId = getStringNoLocale(thing, PMU.questionId) ?? ''
            const selectedOptionIds = getStringNoLocaleAll(thing, PMU.selectedOptionId)
            return { questionId, selectedOptionIds }
        })
        .filter((a): a is { questionId: string; selectedOptionIds: string[] } => a !== null)

    return {
        id,
        name,
        createdAt,
        ...(lastModified !== undefined ? { lastModified } : {}),
        ...(nights !== null ? { nights } : {}),
        ...(destination !== undefined ? { destination } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
        ...(endDate !== undefined ? { endDate } : {}),
        items,
        deletedItems,
        ...(guests.length > 0 ? { guests } : {}),
        ...(selectedPeopleIds.length > 0 ? { selectedPeopleIds } : {}),
        ...(questionAnswers.length > 0 ? { questionAnswers } : {}),
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
    if (item.order !== undefined) t = t.addInteger(PMU.order, item.order)
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
    const order = getInteger(thing, PMU.order)
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
        ...(order !== null ? { order } : {}),
        ...(itemLastModified !== undefined ? { lastModified: itemLastModified } : {}),
    }
}

// ── Section order ─────────────────────────────────────────────────────────────

/**
 * The section order, written as one Thing per name carrying its position.
 *
 * Every other repeated string in this file (`emptySections`, `selectedPersonId`)
 * is a set, and is read back sorted because RDF gives no order back. A section
 * order is the opposite: the order *is* the value, so each entry has to say
 * where it goes, the same way an option carries its own `order`.
 *
 * It lives on the question set alone. A packing list carries no copy — the
 * order is read live when a list is shown, so that changing it reaches every
 * list at once.
 */
function sectionOrderThings(
    labels: string[],
    datasetUrl: string,
): { urls: string[]; things: Thing[] } {
    const urls: string[] = []
    const things: Thing[] = []
    labels.forEach((label, index) => {
        const url = `${datasetUrl}#section-order-${index}`
        urls.push(url)
        things.push(buildThing({ url })
            .addUrl(RDF.type, PMU.SectionOrderEntry)
            .addStringNoLocale(PMU.text, label)
            .addInteger(PMU.order, index)
            .build())
    })
    return { urls, things }
}

function readSectionOrder(dataset: SolidDataset, rootThing: Thing): string[] {
    return getUrlAll(rootThing, PMU.hasSectionOrderEntry)
        .map(url => {
            const thing = getThing(dataset, url)
            if (!thing) return null
            const label = getStringNoLocale(thing, PMU.text)
            if (label === null) return null
            return { label, order: getInteger(thing, PMU.order) ?? 0 }
        })
        .filter((entry): entry is { label: string; order: number } => entry !== null)
        .sort((a, b) => a.order - b.order)
        .map(({ label }) => label)
}

// ── QuestionSet ───────────────────────────────────────────────────────────────

export function questionSetToDataset(qs: PackingListQuestionSet, datasetUrl: string): SolidDataset {
    let ds = createSolidDataset()

    let rootBuilder = buildThing({ url: datasetUrl })
        .addUrl(RDF.type, PMU.QuestionSet)

    if (qs.lastModified) {
        rootBuilder = rootBuilder.addDatetime(DCTERMS.modified, new Date(qs.lastModified))
    }

    if (qs.templateVersion !== undefined) {
        rootBuilder = rootBuilder.addInteger(PMU.templateVersion, qs.templateVersion)
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

    for (const label of qs.alwaysNeededEmptySections ?? []) {
        rootBuilder = rootBuilder.addStringNoLocale(PMU.alwaysNeededEmptySection, label)
    }

    {
        const { urls, things } = sectionOrderThings(qs.sectionOrder ?? [], datasetUrl)
        for (const url of urls) rootBuilder = rootBuilder.addUrl(PMU.hasSectionOrderEntry, url)
        for (const t of things) ds = setThing(ds, t)
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

    const templateVersionValue = getInteger(rootThing, PMU.templateVersion)
    const templateVersion = templateVersionValue === null ? undefined : templateVersionValue

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
    const alwaysNeededItems = sortItemsByOrder(alwaysItemUrls
        .map(url => thingToQuestionItem(dataset, url))
        .filter((item): item is Item => item !== null))

    // Sorted for the same reason as an option's — see `thingToOption`.
    const alwaysNeededEmptySections = getStringNoLocaleAll(rootThing, PMU.alwaysNeededEmptySection).sort()

    // Not sorted, unlike the empty sections above — each entry carries its own
    // position, which is the only reason this field is stored as Things at all.
    const sectionOrder = readSectionOrder(dataset, rootThing)

    return {
        _id: '1',
        people,
        questions,
        alwaysNeededItems,
        ...(alwaysNeededEmptySections.length > 0 ? { alwaysNeededEmptySections } : {}),
        ...(sectionOrder.length > 0 ? { sectionOrder } : {}),
        ...(lastModified !== undefined ? { lastModified } : {}),
        ...(templateVersion !== undefined ? { templateVersion } : {}),
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
    if (person.color) t = t.addStringNoLocale(PMU.personColor, person.color)
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
    const color = getStringNoLocale(thing, PMU.personColor) ?? undefined
    const lastModified = getDatetime(thing, PMU.personLastModified)?.toISOString()
    const deletedAt = getDatetime(thing, PMU.personDeletedAt)?.toISOString()
    return {
        id,
        name,
        ...(ageRange !== undefined ? { ageRange: ageRange as Person['ageRange'] } : {}),
        ...(gender !== undefined ? { gender: gender as Person['gender'] } : {}),
        ...(species !== undefined ? { species: species as Person['species'] } : {}),
        ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
        ...(color !== undefined ? { color: color as Person['color'] } : {}),
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

    for (const label of option.emptySections ?? []) {
        optBuilder = optBuilder.addStringNoLocale(PMU.emptySection, label)
    }

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
    const items = sortItemsByOrder(itemUrls
        .map(itemUrl => thingToQuestionItem(dataset, itemUrl))
        .filter((item): item is Item => item !== null))

    // Repeated strings are an unordered set in RDF, so these come back sorted
    // rather than as written. They name sections with nothing in them, whose
    // position is decided by where the reader puts them anyway.
    const emptySections = getStringNoLocaleAll(thing, PMU.emptySection).sort()

    return {
        id,
        text,
        order,
        items,
        ...(emptySections.length > 0 ? { emptySections } : {}),
    }
}

// Explicit order wins where present; items without one keep their URL-index
// position (legacy data written before items carried an order field).
function sortItemsByOrder(items: Item[]): Item[] {
    return items
        .map((item, index) => ({ item, key: item.order ?? index }))
        .sort((a, b) => a.key - b.key)
        .map(({ item }) => item)
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
    if (item.order !== undefined) itemBuilder = itemBuilder.addInteger(PMU.order, item.order)
    // Same predicate as PackingListItem.category — it's the same relation, and
    // the item's category flows straight through to the generated list item.
    if (item.category !== undefined) itemBuilder = itemBuilder.addStringNoLocale(PMU.category, item.category)
    if (item.communal !== undefined) itemBuilder = itemBuilder.addBoolean(PMU.communal, item.communal)
    // perNight is stored as a decimal to allow rates like 0.5 per night
    if (item.perNight !== undefined) itemBuilder = itemBuilder.addDecimal(PMU.perNight, item.perNight)
    if (item.perNights !== undefined) itemBuilder = itemBuilder.addInteger(PMU.perNights, item.perNights)
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

// ── DeletedPackingLists ───────────────────────────────────────────────────────

export interface PackingListDeletion {
    listId: string
    deletedAt: string
}

/**
 * Tombstones for packing lists the user has deleted.
 *
 * Without these, a device holding a list the pod does not have cannot tell a
 * list deleted on another device from one it has never uploaded, so login sync
 * uploads it again and the delete undoes itself everywhere.
 */
export interface DeletedPackingLists {
    deletions: PackingListDeletion[]
    lastModified: string
}

export function deletedPackingListsToDataset(data: DeletedPackingLists, datasetUrl: string): SolidDataset {
    let ds = createSolidDataset()

    let rootBuilder = buildThing({ url: datasetUrl })
        .addUrl(RDF.type, PMU.DeletedPackingLists)
        .addDatetime(DCTERMS.modified, new Date(data.lastModified))

    for (let i = 0; i < data.deletions.length; i++) {
        const deletion = data.deletions[i]
        const deletionUrl = `${datasetUrl}#deletion-${i}`
        rootBuilder = rootBuilder.addUrl(PMU.hasPackingListDeletion, deletionUrl)

        ds = setThing(
            ds,
            buildThing({ url: deletionUrl })
                .addUrl(RDF.type, PMU.PackingListDeletion)
                .addStringNoLocale(PMU.deletedListId, deletion.listId)
                .addDatetime(PMU.listDeletedAt, new Date(deletion.deletedAt))
                .build()
        )
    }

    return setThing(ds, rootBuilder.build())
}

export function datasetToDeletedPackingLists(dataset: SolidDataset, datasetUrl: string): DeletedPackingLists {
    const rootThing = getThing(dataset, datasetUrl)
    if (!rootThing) throw new Error(`No root Thing at ${datasetUrl}`)

    const lastModified = getDatetime(rootThing, DCTERMS.modified)?.toISOString() ?? new Date().toISOString()
    const deletionUrls = getUrlAll(rootThing, PMU.hasPackingListDeletion)

    const deletions: PackingListDeletion[] = deletionUrls
        .map(url => {
            const t = getThing(dataset, url)
            if (!t) return null
            const listId = getStringNoLocale(t, PMU.deletedListId)
            const deletedAt = getDatetime(t, PMU.listDeletedAt)?.toISOString()
            // A tombstone with no id or no time cannot be acted on — dropping it
            // is safer than inventing a value that could delete the wrong list.
            if (!listId || !deletedAt) return null
            return { listId, deletedAt }
        })
        .filter((d): d is PackingListDeletion => d !== null)

    return { deletions, lastModified }
}

function thingToQuestionItem(dataset: SolidDataset, url: string): Item | null {
    const thing = getThing(dataset, url)
    if (!thing) return null

    const text = getStringNoLocale(thing, PMU.text) ?? ''
    const id = getStringNoLocale(thing, PMU.questionItemId) ?? undefined
    const communal = getBoolean(thing, PMU.communal)
    const order = getInteger(thing, PMU.order)
    const category = getStringNoLocale(thing, PMU.category) ?? undefined
    const perNight = getDecimal(thing, PMU.perNight)
    const perNights = getInteger(thing, PMU.perNights)
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
        ...(perNights !== null ? { perNights } : {}),
        ...(maxQuantity !== null ? { maxQuantity } : {}),
        ...(ageRanges.length > 0 ? { ageRanges } : {}),
        ...(order !== null ? { order } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(lastModified !== undefined ? { lastModified } : {}),
        ...(deletedAt !== undefined ? { deletedAt } : {}),
    }
}
