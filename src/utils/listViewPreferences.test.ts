import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
    DEFAULT_LIST_VIEW_PREFERENCES,
    loadListViewPreferences,
    saveListViewPreferences,
    listViewPreferencesKey,
    hasStoredListViewPreferences,
    hasStalePersonViewSections,
} from './listViewPreferences'

describe('listViewPreferences', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('loading', () => {
        it('returns the defaults for a list that has never been opened', () => {
            expect(loadListViewPreferences('list-1')).toEqual(DEFAULT_LIST_VIEW_PREFERENCES)
        })

        it('returns the defaults when there is no list id', () => {
            expect(loadListViewPreferences(undefined)).toEqual(DEFAULT_LIST_VIEW_PREFERENCES)
        })

        it('reads back what was saved', () => {
            saveListViewPreferences('list-1', {
                showPacked: true,
                collapsedSections: ['Toiletries', '__last_minute__'],
                collapsedGroups: ['Toiletries::Alice'],
            })

            expect(loadListViewPreferences('list-1')).toEqual({
                showPacked: true,
                collapsedSections: ['Toiletries', '__last_minute__'],
                collapsedGroups: ['Toiletries::Alice'],
            })
        })

        it('keeps each list\'s preferences separate', () => {
            saveListViewPreferences('list-1', { ...DEFAULT_LIST_VIEW_PREFERENCES, collapsedSections: ['Alice'] })

            expect(loadListViewPreferences('list-2')).toEqual(DEFAULT_LIST_VIEW_PREFERENCES)
        })
    })

    describe('surviving bad stored data', () => {
        it('falls back to the defaults when the stored value is not JSON', () => {
            localStorage.setItem(listViewPreferencesKey('list-1'), 'not json{')

            expect(loadListViewPreferences('list-1')).toEqual(DEFAULT_LIST_VIEW_PREFERENCES)
        })

        it('falls back to the defaults when the stored value is not an object', () => {
            localStorage.setItem(listViewPreferencesKey('list-1'), '"just a string"')

            expect(loadListViewPreferences('list-1')).toEqual(DEFAULT_LIST_VIEW_PREFERENCES)
        })

        it('drops the view mode entries written before the toggle was removed', () => {
            localStorage.setItem(
                listViewPreferencesKey('list-1'),
                JSON.stringify({ viewMode: 'person', showPacked: true, collapsedSections: ['Toiletries'] }),
            )

            const prefs = loadListViewPreferences('list-1')

            expect(prefs).not.toHaveProperty('viewMode')
            // Everything alongside it still survives the read.
            expect(prefs.showPacked).toBe(true)
            expect(prefs.collapsedSections).toEqual(['Toiletries'])
        })

        it('ignores collapsed keys that are not strings', () => {
            localStorage.setItem(
                listViewPreferencesKey('list-1'),
                JSON.stringify({ collapsedSections: ['Alice', 7, null, 'Bob'], collapsedGroups: 'nope' }),
            )

            const prefs = loadListViewPreferences('list-1')
            expect(prefs.collapsedSections).toEqual(['Alice', 'Bob'])
            expect(prefs.collapsedGroups).toEqual([])
        })

        it('fills in fields the stored value is missing', () => {
            localStorage.setItem(listViewPreferencesKey('list-1'), JSON.stringify({ showPacked: true }))

            expect(loadListViewPreferences('list-1')).toEqual({
                ...DEFAULT_LIST_VIEW_PREFERENCES,
                showPacked: true,
            })
        })
    })

    describe('when storage is unavailable', () => {
        it('returns the defaults rather than throwing on read', () => {
            vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
                throw new Error('SecurityError')
            })

            expect(() => loadListViewPreferences('list-1')).not.toThrow()
            expect(loadListViewPreferences('list-1')).toEqual(DEFAULT_LIST_VIEW_PREFERENCES)
        })

        it('swallows the failure on write', () => {
            vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error('QuotaExceededError')
            })

            expect(() => saveListViewPreferences('list-1', DEFAULT_LIST_VIEW_PREFERENCES)).not.toThrow()
        })
    })

    describe('saving', () => {
        it('does nothing without a list id', () => {
            const setItem = vi.spyOn(Storage.prototype, 'setItem')

            saveListViewPreferences(undefined, DEFAULT_LIST_VIEW_PREFERENCES)

            expect(setItem).not.toHaveBeenCalled()
        })

        it('keeps an entry for a list left at its defaults, so it counts as seen', () => {
            saveListViewPreferences('list-1', DEFAULT_LIST_VIEW_PREFERENCES)

            expect(hasStoredListViewPreferences('list-1')).toBe(true)
        })

        it('still counts as seen once the user opens everything back up', () => {
            saveListViewPreferences('list-1', { ...DEFAULT_LIST_VIEW_PREFERENCES, collapsedSections: ['Alice'] })
            saveListViewPreferences('list-1', DEFAULT_LIST_VIEW_PREFERENCES)

            expect(hasStoredListViewPreferences('list-1')).toBe(true)
        })
    })

    describe('knowing whether a list has been opened before', () => {
        it('is false for a list never opened', () => {
            expect(hasStoredListViewPreferences('list-1')).toBe(false)
        })

        it('is false without a list id', () => {
            expect(hasStoredListViewPreferences(undefined)).toBe(false)
        })

        it('is true once the list has been saved', () => {
            saveListViewPreferences('list-1', DEFAULT_LIST_VIEW_PREFERENCES)

            expect(hasStoredListViewPreferences('list-1')).toBe(true)
        })

        it('treats unreadable storage as never opened rather than throwing', () => {
            vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
                throw new Error('SecurityError')
            })

            expect(hasStoredListViewPreferences('list-1')).toBe(false)
        })
    })
})

describe('hasStalePersonViewSections', () => {
    const sections = ['Toiletries', 'Clothes', '__last_minute__']

    it('spots fold state left behind by the old person view', () => {
        const prefs = { ...DEFAULT_LIST_VIEW_PREFERENCES, collapsedSections: ['Alice', 'Bob'] }

        expect(hasStalePersonViewSections(prefs, sections)).toBe(true)
    })

    it('leaves alone fold state that still names a card', () => {
        const prefs = { ...DEFAULT_LIST_VIEW_PREFERENCES, collapsedSections: ['Alice', 'Clothes'] }

        expect(hasStalePersonViewSections(prefs, sections)).toBe(false)
    })

    it('is not stale when nothing was folded — that is a choice, not a leftover', () => {
        expect(hasStalePersonViewSections(DEFAULT_LIST_VIEW_PREFERENCES, sections)).toBe(false)
    })
})
