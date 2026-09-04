import { describe, it, expect } from 'vitest'
import { isNeutralAuthReturnRoute, suggestedPostLoginRoute } from './postLoginDestination'

describe('isNeutralAuthReturnRoute', () => {
    it.each([null, undefined, '', '/', '/home', '/home/', '/solid-pod-handle-redirect'])(
        'treats %p as a neutral entry point',
        route => {
            expect(isNeutralAuthReturnRoute(route)).toBe(true)
        }
    )

    it.each([
        '/view-lists',
        '/view-lists/abc123',
        '/wizard',
        '/manage-questions',
        '/pod/https%3A%2F%2Fpod.example%2F/view-lists',
        '/create-packing-list',
    ])('treats %p as a route the user meant to return to', route => {
        expect(isNeutralAuthReturnRoute(route)).toBe(false)
    })

    it('ignores a query string or nested hash when classifying', () => {
        expect(isNeutralAuthReturnRoute('/home?utm=x')).toBe(true)
        expect(isNeutralAuthReturnRoute('/view-lists?filter=me')).toBe(false)
    })
})

describe('suggestedPostLoginRoute', () => {
    it('sends someone with questions to their lists', () => {
        expect(suggestedPostLoginRoute(true)).toBe('/view-lists')
    })

    it('sends someone with no questions to the wizard', () => {
        expect(suggestedPostLoginRoute(false)).toBe('/wizard')
    })
})
