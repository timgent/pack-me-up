import { describe, it, expect } from 'vitest'
import {
    installOpenInvocationHandler,
    parseOpenInvocation,
    resolvePackMeUpResource,
    openInvocationPath,
    rewriteOpenInvocationHash,
} from './openInvocation'

const POD = 'https://alice.solidcommunity.example/'
const LIST_IRI = `${POD}pack-me-up/packing-lists/list-42.ttl`
const QUESTIONS_IRI = `${POD}pack-me-up/packing-list-questions.ttl`

describe('parseOpenInvocation', () => {
    it('reads the spec\'s query-form open variable out of the fragment', () => {
        expect(parseOpenInvocation(`#open=${encodeURIComponent(LIST_IRI)}`)).toBe(LIST_IRI)
    })

    it('accepts a value a consumer left un-encoded', () => {
        expect(parseOpenInvocation(`#open=${LIST_IRI}`)).toBe(LIST_IRI)
    })

    it('ignores variables it does not recognise rather than failing', () => {
        const hash = `#login=${encodeURIComponent('https://alice.example/#me')}&open=${encodeURIComponent(LIST_IRI)}&output=text%2Fhtml`
        expect(parseOpenInvocation(hash)).toBe(LIST_IRI)
    })

    it('takes the first value when open is repeated, since the app opens one resource', () => {
        const hash = `#open=${encodeURIComponent(LIST_IRI)}&open=${encodeURIComponent(QUESTIONS_IRI)}`
        expect(parseOpenInvocation(hash)).toBe(LIST_IRI)
    })

    it('does not treat ";" as a separator, as the spec requires', () => {
        // The whole tail is part of the open value, so it is no longer the IRI
        // of anything this app stores and nothing is opened.
        const hash = `#open=${encodeURIComponent(LIST_IRI)};login=whoever`
        expect(parseOpenInvocation(hash)).toBe(`${LIST_IRI};login=whoever`)
        expect(resolvePackMeUpResource(parseOpenInvocation(hash)!)).toBeNull()
    })

    it('leaves the app\'s own hash routes alone', () => {
        expect(parseOpenInvocation('#/view-lists/list-42')).toBeNull()
        expect(parseOpenInvocation('#/manage-questions')).toBeNull()
        expect(parseOpenInvocation('')).toBeNull()
        expect(parseOpenInvocation('#')).toBeNull()
    })

    it('reports an empty or undecodable value as present but unusable', () => {
        // Not null: the invocation was made, so the app owes the person an
        // explanation rather than a blank page.
        expect(parseOpenInvocation('#open=')).toBe('')
        expect(parseOpenInvocation('#open=%E0%A4%A')).toBe('')
    })

    it('reports no invocation at all when there is no open variable', () => {
        expect(parseOpenInvocation('#open')).toBeNull()
        expect(parseOpenInvocation('#login=whoever')).toBeNull()
    })
})

describe('resolvePackMeUpResource', () => {
    it('recognises a packing list by where the app stores it', () => {
        expect(resolvePackMeUpResource(LIST_IRI)).toEqual({
            kind: 'packing-list',
            podUrl: POD,
            listId: 'list-42',
        })
    })

    it('recognises a question set', () => {
        expect(resolvePackMeUpResource(QUESTIONS_IRI)).toEqual({
            kind: 'question-set',
            podUrl: POD,
        })
    })

    it('does not claim resources this app knows nothing about', () => {
        expect(resolvePackMeUpResource(`${POD}notes/shopping.ttl`)).toBeNull()
        expect(resolvePackMeUpResource(`${POD}pack-me-up/backups/2026-01-01.ttl`)).toBeNull()
        expect(resolvePackMeUpResource(`${POD}pack-me-up/packing-lists/`)).toBeNull()
    })

    it('refuses schemes an invocation must never navigate to', () => {
        expect(resolvePackMeUpResource('javascript:alert(1)')).toBeNull()
        expect(resolvePackMeUpResource('data:text/html,<script>')).toBeNull()
        expect(resolvePackMeUpResource('file:///etc/passwd')).toBeNull()
        expect(resolvePackMeUpResource('not-an-iri')).toBeNull()
        expect(resolvePackMeUpResource('')).toBeNull()
    })
})

describe('openInvocationPath', () => {
    it('opens a list on your own pod as your own list', () => {
        expect(openInvocationPath(LIST_IRI, POD)).toBe('/view-lists/list-42')
    })

    it('opens a list on someone else\'s pod through the shared-list route', () => {
        expect(openInvocationPath(LIST_IRI, 'https://bob.example/')).toBe(
            `/view-lists/list-42?pod=${encodeURIComponent(POD)}`
        )
    })

    it('opens your own question set on the questions page', () => {
        expect(openInvocationPath(QUESTIONS_IRI, POD)).toBe('/manage-questions')
    })

    it('opens someone else\'s question set in their pod context', () => {
        expect(openInvocationPath(QUESTIONS_IRI, null)).toBe(
            `/pod/${encodeURIComponent(POD)}/manage-questions`
        )
    })

    it('has no path for a resource it does not recognise', () => {
        expect(openInvocationPath(`${POD}notes/shopping.ttl`, POD)).toBeNull()
    })
})

describe('rewriteOpenInvocationHash', () => {
    it('turns an invocation fragment into a route the app can actually navigate', () => {
        expect(rewriteOpenInvocationHash(`#open=${encodeURIComponent(LIST_IRI)}`)).toBe(
            `#/open?resource=${encodeURIComponent(LIST_IRI)}`
        )
    })

    it('leaves anything that is not an invocation untouched', () => {
        expect(rewriteOpenInvocationHash('#/view-lists/list-42')).toBeNull()
        expect(rewriteOpenInvocationHash('#/manage-questions')).toBeNull()
        expect(rewriteOpenInvocationHash('')).toBeNull()
    })

    it('routes an invocation the app will refuse, so the refusal has somewhere to be said', () => {
        expect(rewriteOpenInvocationHash('#open=javascript:alert(1)')).toBe(
            `#/open?resource=${encodeURIComponent('javascript:alert(1)')}`
        )
        expect(rewriteOpenInvocationHash('#open=')).toBe('#/open?resource=')
    })
})

describe('installOpenInvocationHandler', () => {
    it('rewrites an invocation already in the address bar before the router sees it', () => {
        window.location.hash = `#open=${encodeURIComponent(LIST_IRI)}`

        installOpenInvocationHandler(window)

        expect(window.location.hash).toBe(`#/open?resource=${encodeURIComponent(LIST_IRI)}`)
    })

    it('rewrites an invocation that arrives while the app is already open', () => {
        window.location.hash = '#/view-lists'
        installOpenInvocationHandler(window)

        window.location.hash = `#open=${encodeURIComponent(QUESTIONS_IRI)}`
        window.dispatchEvent(new window.HashChangeEvent('hashchange'))

        expect(window.location.hash).toBe(`#/open?resource=${encodeURIComponent(QUESTIONS_IRI)}`)
    })

    it('also catches the popstate a fragment change fires, which is what the router listens on', () => {
        window.location.hash = '#/view-lists'
        installOpenInvocationHandler(window)

        window.location.hash = `#open=${encodeURIComponent(LIST_IRI)}`
        window.dispatchEvent(new window.PopStateEvent('popstate'))

        expect(window.location.hash).toBe(`#/open?resource=${encodeURIComponent(LIST_IRI)}`)
    })

    it('tells the router to look again once it has rewritten the fragment', () => {
        window.location.hash = '#/view-lists'
        installOpenInvocationHandler(window)

        const seen: string[] = []
        window.addEventListener('popstate', () => seen.push(window.location.hash))

        window.location.hash = `#open=${encodeURIComponent(LIST_IRI)}`
        window.dispatchEvent(new window.HashChangeEvent('hashchange'))

        expect(seen).toContain(`#/open?resource=${encodeURIComponent(LIST_IRI)}`)
    })

    it('leaves ordinary navigation alone', () => {
        window.location.hash = '#/manage-questions'

        installOpenInvocationHandler(window)

        expect(window.location.hash).toBe('#/manage-questions')
    })
})
