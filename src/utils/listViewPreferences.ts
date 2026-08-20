/**
 * How the user last left a particular packing list: which view they were in,
 * whether packed items were showing, and which sections they had folded away.
 *
 * A big family list is only manageable once you can put away the parts you
 * aren't packing right now — and that's worthless if the app forgets the moment
 * you navigate back to the lists index. This is per-list rather than global
 * because "everyone collapsed except Ellie" is a fact about one trip, not a
 * preference about the app.
 *
 * Kept in localStorage rather than on the list itself: it's a device-local view
 * state, not list data, and pushing it to the pod would have one person's
 * folded sections rearrange the list under a collaborator who is packing a
 * different bag.
 */

export type ListViewMode = 'person' | 'category'

export interface ListViewPreferences {
    viewMode: ListViewMode
    showPacked: boolean
    /** Keys of folded top-level sections — a person, a category, or the shared section. */
    collapsedSections: string[]
    /** Keys of folded groups within a section, in `sectionKey::groupLabel` form. */
    collapsedGroups: string[]
}

export const DEFAULT_LIST_VIEW_PREFERENCES: ListViewPreferences = {
    viewMode: 'person',
    showPacked: false,
    collapsedSections: [],
    collapsedGroups: [],
}

const KEY_PREFIX = 'pack-me-up:list-view:'

export function listViewPreferencesKey(listId: string): string {
    return `${KEY_PREFIX}${listId}`
}

function stringsOnly(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/**
 * Whether this list has been opened on this device before.
 *
 * The list view folds a big list down on its *first* open only; every open
 * after that belongs to whatever the user last chose, including choosing to
 * have everything open. That's why an entry is written even when it matches the
 * defaults exactly — the entry itself is the record that the user has seen this
 * list, and deleting it would have the list fold itself up again on the next
 * visit as if for the first time.
 */
export function hasStoredListViewPreferences(listId: string | undefined): boolean {
    if (!listId) return false
    try {
        return localStorage.getItem(listViewPreferencesKey(listId)) !== null
    } catch {
        return false
    }
}

/**
 * Never throws and never returns a partial object: a corrupt or half-written
 * entry costs the user their folded sections, which is not worth failing a list
 * render over. Storage itself can throw outright (Safari private browsing), so
 * every access is guarded rather than feature-detected.
 */
export function loadListViewPreferences(listId: string | undefined): ListViewPreferences {
    if (!listId) return DEFAULT_LIST_VIEW_PREFERENCES

    let raw: string | null = null
    try {
        raw = localStorage.getItem(listViewPreferencesKey(listId))
    } catch {
        return DEFAULT_LIST_VIEW_PREFERENCES
    }
    if (!raw) return DEFAULT_LIST_VIEW_PREFERENCES

    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return DEFAULT_LIST_VIEW_PREFERENCES
    }
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_LIST_VIEW_PREFERENCES

    const stored = parsed as Partial<Record<keyof ListViewPreferences, unknown>>
    return {
        // 'question' is what the category view was called before it was named
        // after what it groups by. Lists left in it stay in it.
        viewMode: stored.viewMode === 'category' || stored.viewMode === 'question' ? 'category' : 'person',
        showPacked: stored.showPacked === true,
        collapsedSections: stringsOnly(stored.collapsedSections),
        collapsedGroups: stringsOnly(stored.collapsedGroups),
    }
}

export function saveListViewPreferences(listId: string | undefined, prefs: ListViewPreferences): void {
    if (!listId) return
    try {
        localStorage.setItem(listViewPreferencesKey(listId), JSON.stringify(prefs))
    } catch {
        // Storage full or blocked — the list still works, it just won't
        // remember how it was left.
    }
}
