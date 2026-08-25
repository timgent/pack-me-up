import { describe, it, expect } from 'vitest'
import { Parser } from 'n3'
import { fromRdfJsDataset, solidDatasetAsTurtle } from '@inrupt/solid-client'
import { Store } from 'n3'
import { datasetFromQuads, responseToDataset } from './rdfDataset'
import { questionSetToDataset, packingListToDataset, datasetToQuestionSet, datasetToPackingList } from './rdfSerialization'
import { fullyPopulatedQuestionSet, fullyPopulatedPackingList, withoutLocalOnlyFields } from '../test-utils/fullyPopulatedFixtures'
import type { PackingList } from '../create-packing-list/types'

const QUESTIONS_URL = 'https://pod.example.com/pack-me-up/packing-list-questions.ttl'
const LIST_URL = 'https://pod.example.com/pack-me-up/packing-lists/list-1.ttl'

function parseQuads(turtle: string) {
    return new Parser({ format: 'text/turtle' }).parse(turtle)
}

function turtleResponse(turtle: string): Response {
    return new Response(turtle, { status: 200, headers: { 'Content-Type': 'text/turtle' } })
}

/** `new Response()` always has an empty `url`; the parser reads it as the source IRI. */
function withUrl(response: Response, url: string): Response {
    Object.defineProperty(response, 'url', { value: url })
    return response
}

describe('datasetFromQuads', () => {
    // The structure is @inrupt/solid-client's own — this only builds it in one
    // linear pass instead of copying the whole subject map per quad. If the two
    // ever disagree, every deserializer in the app is reading the wrong shape.
    it.each([
        ['question set', () => questionSetToDataset(fullyPopulatedQuestionSet, QUESTIONS_URL)],
        ['packing list', () => packingListToDataset({ ...fullyPopulatedPackingList, id: 'list-1' }, LIST_URL)],
    ])('builds exactly the dataset @inrupt/solid-client builds, for a %s', async (_name, makeDataset) => {
        const turtle = await solidDatasetAsTurtle(makeDataset())
        const quads = parseQuads(turtle)
        expect(quads.length).toBeGreaterThan(0)

        const ours = datasetFromQuads(quads)
        const theirs = fromRdfJsDataset(new Store(quads))

        expect(JSON.parse(JSON.stringify(ours))).toEqual(JSON.parse(JSON.stringify(theirs)))
    })

    it('keeps every field of a question set through a parse', async () => {
        const questionSet = { ...fullyPopulatedQuestionSet, _id: '1' }
        const turtle = await solidDatasetAsTurtle(questionSetToDataset(questionSet, QUESTIONS_URL))

        const parsed = datasetToQuestionSet(datasetFromQuads(parseQuads(turtle)), QUESTIONS_URL)

        expect(parsed).toEqual(questionSet)
    })

    it('keeps every field of a packing list through a parse', async () => {
        const list: PackingList = { ...fullyPopulatedPackingList, id: 'list-1' }
        const turtle = await solidDatasetAsTurtle(packingListToDataset(list, LIST_URL))

        const parsed = datasetToPackingList(datasetFromQuads(parseQuads(turtle)), LIST_URL)

        expect(parsed).toEqual(withoutLocalOnlyFields(list))
    })

    it('handles the object types Turtle can carry', () => {
        const quads = parseQuads(`
            @prefix ex: <https://example.com/> .
            ex:thing ex:named ex:other ;
                     ex:count "3"^^<http://www.w3.org/2001/XMLSchema#integer> ;
                     ex:label "Hello"@en ;
                     ex:nested [ ex:inner "deep" ] .
        `)

        const ours = datasetFromQuads(quads)
        const theirs = fromRdfJsDataset(new Store(quads))

        expect(JSON.parse(JSON.stringify(ours))).toEqual(JSON.parse(JSON.stringify(theirs)))
    })

    it('returns an empty default graph for no quads', () => {
        expect(datasetFromQuads([])).toEqual({ type: 'Dataset', graphs: { default: {} } })
    })
})

describe('responseToDataset', () => {
    it('parses a Turtle response into a readable dataset', async () => {
        const questionSet = { ...fullyPopulatedQuestionSet, _id: '1' }
        const turtle = await solidDatasetAsTurtle(questionSetToDataset(questionSet, QUESTIONS_URL))

        const dataset = await responseToDataset(withUrl(turtleResponse(turtle), QUESTIONS_URL))

        expect(datasetToQuestionSet(dataset, QUESTIONS_URL)).toEqual(questionSet)
    })

    it('throws an error carrying the status code when the response was not a success', async () => {
        // The conditional-GET cache in loadRdfFromPod recognises its 304 by
        // `statusCode`, so this is load-bearing, not cosmetic.
        const notModified = withUrl(new Response(null, { status: 304 }), QUESTIONS_URL)

        await expect(responseToDataset(notModified)).rejects.toMatchObject({ statusCode: 304 })
    })

    it('throws when the response is not Turtle', async () => {
        const json = withUrl(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }), QUESTIONS_URL)

        await expect(responseToDataset(json)).rejects.toThrow(/application\/json/)
    })
})
