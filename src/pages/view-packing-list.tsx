import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDebouncedCallback } from 'use-debounce'
import { PackingList, PackingListItem } from '../create-packing-list/types'
import { useDatabase } from '../components/DatabaseContext'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { LoadingState } from '../components/LoadingState'
import { PodSyncIndicator } from '../components/PodSyncIndicator'
import { useForm, useWatch } from 'react-hook-form'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { reportError } from '../errorReporting'
import { usePodSync } from '../hooks/usePodSync'
import { useLocalFirstLoad } from '../hooks/useLocalFirstLoad'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'
import { POD_CONTAINERS, getPrimaryPodUrl, saveRdfToPod, resolveOwnerDisplayName, deriveWebIdFromPodUrl, isRetryablePodUrlFailure } from '../services/solidPod'
import { useOwnerDisplayName } from '../hooks/useOwnerDisplayName'
import { packingListToDataset, datasetToPackingList } from '../services/rdfSerialization'
import { SharePackingListModal } from '../components/SharePackingListModal'
import { SolidPodPrompt } from '../components/SolidPodPrompt'
import { UpdateFromQuestionsModal } from '../components/UpdateFromQuestionsModal'
import { useForeignPod } from '../components/ForeignPodContext'
import { useSharedListsSync } from '../hooks/useSharedListsSync'
import { mergePackingLists } from '../utils/mergePackingLists'
import { applyQuestionSetChanges, computeQuestionSetChanges, type QuestionSetChange } from '../create-packing-list/updateFromQuestions'
import { MILESTONE_MESSAGES, resolveMilestone } from './packing-milestones'
import { formatTripCountdown, formatTripDates } from '../create-packing-list/tripDetails'
import { TripCountdownBadge } from '../components/TripCountdownBadge'
import { tapFeedback } from '../utils/haptics'
import { prefersReducedMotion } from '../utils/prefersReducedMotion'
import { groupItemsByCategory, sortByOrder, type CategoryAccessors } from '../utils/groupByCategory'
import { sectionHeading } from '../utils/sectionHeading'
import { CATEGORY_ORDER } from '../edit-questions/item-sections'
import { useSectionOrder } from '../hooks/useSectionOrder'
import { clearPendingSignInAction, getPendingSignInAction, setPendingSignInAction } from '../utils/pendingSignInAction'
import { usePersonIdentities } from '../hooks/usePersonIdentities'
import { AddItemComposer, UNCATEGORISED_LABEL, type AddItemTarget, type PersonOption } from '../components/AddItemComposer'
import { CategoryItemGrid } from '../components/CategoryItemGrid'
import { ItemRowPanel } from '../components/ItemRowPanel'
import { buildCategoryRows, buildGridColumns, UNASSIGNED_COLUMN_KEY, type GridRow } from '../utils/categoryItemGrid'
import { PeopleFilterBar } from '../components/PeopleFilterBar'
import { ActionMenu, ActionMenuItem } from '../components/ActionMenu'
import { togglePerson, isFiltered, personTotals, filterSummary, sharedTotal, sharedSelected, filterLabel, filterNames } from '../utils/peopleFilter'
import { buildSuggestionIndex } from '../utils/itemSuggestions'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { loadListViewPreferences, saveListViewPreferences, hasStoredListViewPreferences, hasStalePersonViewSections } from '../utils/listViewPreferences'
import { profile, profileEvent } from '../utils/profiling'

type FormData = {
    items: Record<string, boolean>
}

// Reserved key for communal items — cannot collide with a person's name, which
// is what keys the other sections (and, in question view, the groups inside a
// section).
const SHARED_SECTION_KEY = '__shared__'

// What the shared group is called where it sits among people: inside a
// section's card in question view, and in the "who for" picker.
const SHARED_GROUP_LABEL = 'Shared'

// Reserved key for the last minute section, for the same reason as the shared
// one: a person can't be called this, so the two can never collide.
const LAST_MINUTE_SECTION_KEY = '__last_minute__'

// Some things can't go in a bag until you're walking out of the door. They are
// collected in one card at the end of the list rather than sitting among the
// items that can be packed now, whichever way the list is grouped.
const LAST_MINUTE_TITLE = 'Last Minute'
const LAST_MINUTE_HINT = 'Pack these just before you go.'

// Stable empty diff for the closed preview, so the modal isn't handed a new
// array — and told its choices have changed — on every render of this page.
const NO_QUESTION_UPDATES: QuestionSetChange[] = []

/** What actually happened, in the order the preview listed it. */
function questionUpdateSummary(applied: readonly QuestionSetChange[]): string {
    const added = applied.reduce((total, change) => total + change.additions.length, 0)
    const removed = applied.reduce((total, change) => total + change.removedIds.length, 0)
    const changed = applied.filter(change => change.type === 'update').length

    if (removed === 0 && changed === 0) {
        return `Added ${added} item${added === 1 ? '' : 's'} from your questions`
    }
    const parts = [
        added > 0 ? `${added} added` : null,
        changed > 0 ? `${changed} updated` : null,
        removed > 0 ? `${removed} removed` : null,
    ].filter(Boolean)
    return `Updated from your questions: ${parts.join(', ')}`
}

// Long enough for the last (delayed) confetti piece to finish falling
const CONFETTI_DURATION_MS = 4000

// Kept in step with the `sections-packing-away` animation in index.css
const SECTIONS_EXIT_MS = 550

// Kept in step with the `item-packed-swell` / `item-packed-tick` animations in
// index.css. Also how long a freshly-packed row is held on screen before the
// "hide packed items" filter takes it — long enough to see, short enough that
// the next item is never waiting on it.
const ITEM_FLOURISH_MS = 450

// A section that finishes in front of the user gets long enough to be seen
// finishing — the item flourish, plus a beat to read the "All packed!" badge —
// before it folds itself away.
const SECTION_FOLD_DELAY_MS = 900

// How long a list has to be before it arrives folded. Roughly "more rows than
// fit on a screen": below this the wall the folding exists to prevent isn't
// there, and a freshly generated list is better off showing the user what it
// made them. Only ever applies to a list's first open — see
// hasStoredListViewPreferences.
const FOLD_ON_OPEN_MIN_ITEMS = 30

// Joins section keys into a single comparable value. Section keys are people's
// names and category labels, so the separator has to be something neither can
// contain — a space or a comma would make "Ann Lee" and "Ann, Lee" the same set.
const KEY_SEPARATOR = '\u001f'

// Spread across the viewport with staggered starts so the confetti doesn't fall
// as one rank. Fixed rather than random so the effect is identical every run.
const CONFETTI_PIECES = [
    { emoji: '🎉', left: '6%', delay: '0s' },
    { emoji: '🎊', left: '18%', delay: '0.5s' },
    { emoji: '✨', left: '30%', delay: '0.15s' },
    { emoji: '🧳', left: '43%', delay: '0.8s' },
    { emoji: '🎈', left: '56%', delay: '0.35s' },
    { emoji: '✈️', left: '69%', delay: '0.65s' },
    { emoji: '🌍', left: '82%', delay: '0.2s' },
    { emoji: '🎉', left: '93%', delay: '0.95s' },
]

interface ListSection {
    /** The section's stored name — what a category is written as on its items. */
    key: string
    /** What the card is headed with: the name as `sectionHeading` writes it. */
    title: string
    items: PackingListItem[]
    // Name used in aria-labels and guest actions; '' for the shared section
    name: string
    guestId?: string
    communal?: boolean
    // True for category-centric top-level sections (grouped by category rather than person)
    isCategory?: boolean
    // Category view's arrangement of this section: a row per item, a column per
    // person. Built from every item in the section, packed ones included — see
    // `buildCategoryRows`.
    rows?: GridRow[]
    // True for the one section holding the items that can only be packed on the
    // way out of the door. Grouped by person, like a category section.
    lastMinute?: boolean
}

// Generated items carry an `order` stamped from the question set; sort by it so
// the list mirrors how the user arranged their questions. Items without one
// (legacy lists, custom additions) fall back to alphabetical at the end.
const PACKING_ITEM_ACCESSORS: CategoryAccessors<PackingListItem> = {
    category: item => item.category,
    order: item => item.order,
    text: item => item.itemText,
}

function sortByItemOrder(items: PackingListItem[]): PackingListItem[] {
    return sortByOrder(items, PACKING_ITEM_ACCESSORS)
}

/**
 * `sectionOrder` is the list's own copy of the order its owner arranged their
 * sections in (see `section-order.ts`). Lists generated before that existed —
 * and lists whose owner never chose an order — pass nothing and get the
 * built-in default, which is what every list used to get.
 */
export function groupByCategory(
    items: PackingListItem[],
    sectionOrder: readonly string[] = CATEGORY_ORDER,
) {
    return groupItemsByCategory(items, PACKING_ITEM_ACCESSORS, {
        uncategorisedLabel: UNCATEGORISED_LABEL,
        order: sectionOrder,
        pinLast: UNCATEGORISED_LABEL,
    })
}

/** The catch-all section is the absence of a category, not a category named "Other". */
function categoryFromLabel(label: string): string | undefined {
    return label === UNCATEGORISED_LABEL ? undefined : label
}

interface SectionStats { packed: number; total: number }

/** A section is worth celebrating — and worth folding away — once every item in it is packed. */
function isSectionComplete(stats?: SectionStats): boolean {
    return stats !== undefined && stats.total > 0 && stats.packed === stats.total
}

/** Where a custom item was added without saying whose it is. */
export const UNASSIGNED_LABEL = 'Unassigned'

/** One group of items inside a section's card: a category, or a person, or the shared group. */
interface ItemGroup {
    /** Identifies the group in collapse state and stats; not shown to the user. */
    key: string
    label: string
    items: PackingListItem[]
    /** The group holding communal items — nobody's in particular, so everybody's. */
    communal?: boolean
}

/**
 * The people a section's items belong to, plus — since communal items belong to
 * the section as much as anyone's do — a shared group, first, the way the shared
 * card comes first in person view. Keyed rather than labelled so a person
 * actually called "Shared" keeps their own group.
 */
export function groupByPerson(items: PackingListItem[]): ItemGroup[] {
    const map = new Map<string, PackingListItem[]>()
    for (const item of items) {
        const key = item.communal ? SHARED_SECTION_KEY : (item.personName || UNASSIGNED_LABEL)
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(item)
    }
    return [...map.entries()]
        .sort(([a], [b]) => (
            a === SHARED_SECTION_KEY ? -1 : b === SHARED_SECTION_KEY ? 1 : a.localeCompare(b)
        ))
        .map(([key, groupItems]) => ({
            key,
            label: key === SHARED_SECTION_KEY ? SHARED_GROUP_LABEL : key,
            items: sortByItemOrder(groupItems),
            ...(key === SHARED_SECTION_KEY ? { communal: true } : {}),
        }))
}


/** Ties the people filter to the cards it narrows, for assistive tech. */
const LIST_SECTIONS_ID = 'packing-list-sections'

export function ViewPackingList() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const foreignPodCtx = useForeignPod()
    // Prefer full-collaboration context over per-list query param (backward compat)
    const foreignPodUrl = foreignPodCtx?.foreignPodUrl ?? searchParams.get('pod') ?? undefined
    const ownerWebIdFromUrl = searchParams.get('owner') ?? undefined
    const backPath = foreignPodCtx
        ? `/pod/${encodeURIComponent(foreignPodCtx.foreignPodUrl)}/view-lists`
        : '/view-lists'
    const [packingList, setPackingList] = useState<PackingList | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    // Whether this page has looked in the local database yet. Pod syncing waits
    // on it: a pod copy applied before we know what is on the device overwrites
    // it, and the device's copy can be the newer one — the pod write for the
    // last edit is best effort and may not have landed before the page closed.
    const [localCopyChecked, setLocalCopyChecked] = useState(false)
    const [shareModalOpen, setShareModalOpen] = useState(false)
    // Sharing needs a pod, so a logged-out sharer gets the ask framed around
    // sharing rather than a generic "set up a pod" pitch.
    const [signInToSharePromptOpen, setSignInToSharePromptOpen] = useState(false)
    // Changes computed from the question set; non-null opens the preview modal.
    // Computed on demand rather than watched: the diff regenerates the whole
    // list from the question set, which is not something to re-run every time a
    // checkbox is ticked.
    const [questionUpdateChanges, setQuestionUpdateChanges] = useState<QuestionSetChange[] | null>(null)
    // Whether the question set exists locally (gates the "Update from questions" button).
    const [hasQuestionSet, setHasQuestionSet] = useState(false)
    const [ownPodUrl, setOwnPodUrl] = useState<string | null>(null)
    // Tracks whether initial data has been loaded (local DB or pod).
    // Used to surface a real error to the user instead of hanging on "Loading…"
    // when a foreign-pod fetch fails.
    const hasLoadedRef = useRef(false)
    // How this list was last left — folded sections, view mode, whether packed
    // items were showing. Read once, synchronously, so a list opens folded the
    // way it was closed rather than flashing its full self first.
    const [storedPreferences] = useState(() => loadListViewPreferences(id))
    // Whether this list has been opened here before. Read before the first save
    // writes an entry, so it stays true to its name for the whole visit.
    const [listSeenBefore] = useState(() => hasStoredListViewPreferences(id))
    // True while a first-open fold is still exactly as this page left it — the
    // one moment worth explaining, and only until the user touches anything.
    const [foldedOnOpen, setFoldedOnOpen] = useState(false)
    const [showPacked, setShowPacked] = useState(storedPreferences.showPacked)
    /**
     * Who the user is packing for. Empty means everyone, which is where a list
     * always opens: unlike a folded section, a filter is a thing you are doing
     * rather than a way you keep this list, and one restored a week later is a
     * list that looks like it has lost two thirds of itself.
     */
    const [selectedPeople, setSelectedPeople] = useState<ReadonlySet<string>>(() => new Set<string>())
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const [itemToDelete, setItemToDelete] = useState<string | null>(null)
    // Which row of the category grid has its "who needs this?" panel open, held
    // as keys rather than as the row itself: the row is rebuilt whenever the
    // list changes, and a panel holding the old one would keep showing the state
    // before the change it was used to make.
    const [openRowKeys, setOpenRowKeys] = useState<{ sectionKey: string; rowKey: string; anchorItemId?: string } | null>(null)
    // A row can hold one item or one each for four people; removing the second
    // kind is worth naming who it affects.
    const [rowToDelete, setRowToDelete] = useState<{ label: string; items: PackingListItem[]; who: string } | null>(null)
    // Groups within a section, keyed `sectionKey::groupLabel`
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(storedPreferences.collapsedGroups))
    // Top-level sections: a category, or the last minute card
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set(storedPreferences.collapsedSections))
    // Sections this page folded away on the user's behalf once everything in
    // them was packed. Tracked apart from the folded set so a section is only
    // ever auto-folded once: reopen it and it stays open.
    const autoFoldedRef = useRef<Set<string>>(new Set())
    // Sections finished before the user arrived fold without ceremony; after the
    // first pass, folding waits for the celebration to be seen.
    const hasFoldedOnOpenRef = useRef(false)
    // The first-open fold happens once per mount at most, whatever else changes.
    const hasSeededFoldRef = useRef(false)
    // Reveals an empty Shared Items section on lists that have no communal
    // items yet; once an item is added the section persists from the data.
    const [renamingGuestId, setRenamingGuestId] = useState<string | null>(null)
    const [renamingGuestName, setRenamingGuestName] = useState('')
    const [guestToRemove, setGuestToRemove] = useState<string | null>(null)
    // The row worth pointing out for a moment because it has just landed
    // somewhere: typed into a composer, or moved to the last minute card.
    // `bringIntoView` separates the two — see the effect below.
    const [highlightedItem, setHighlightedItem] = useState<{ id: string; bringIntoView: boolean } | null>(null)
    const itemRowRefs = useRef<Map<string, HTMLElement>>(new Map())
    // One-off confetti when the final item is ticked
    const [showConfetti, setShowConfetti] = useState(false)
    // 'exiting' plays the fold-away animation, 'packed-away' has removed the cards
    const [completionStage, setCompletionStage] = useState<'none' | 'exiting' | 'packed-away'>('none')
    // True only when the list was finished in front of the user, which is the
    // one time the banner gets its big entrance rather than the gentle one
    const [justCelebrated, setJustCelebrated] = useState(false)
    // null means "haven't looked yet", so the first read is only a baseline
    const wasAllPackedRef = useRef<boolean | null>(null)
    // Encouragement in the progress strip. Held as state rather than derived so
    // it can lag behind a boundary — see resolveMilestone.
    const [milestone, setMilestone] = useState<number | null>(null)
    // The item currently taking its bow after being checked off. The nonce rises
    // on every tick so re-checking the same row remounts the tick and replays it,
    // rather than the unchanged id leaving the animation half-finished.
    const [flourish, setFlourish] = useState<{ itemId: string; nonce: number } | null>(null)

    // The reward for a tick belongs to the tick, not to the save that follows it
    // 800ms later — everything here is local and immediate, and none of it waits
    // on the database or the pod. Unchecking is a correction rather than an
    // achievement, so it passes in silence.
    const handleItemToggle = useCallback((itemId: string, checked: boolean) => {
        if (!checked) return
        tapFeedback()
        if (prefersReducedMotion()) return
        setFlourish(prev => ({ itemId, nonce: (prev?.nonce ?? 0) + 1 }))
    }, [])

    useEffect(() => {
        if (!flourish) return
        const timer = setTimeout(() => setFlourish(null), ITEM_FLOURISH_MS)
        return () => clearTimeout(timer)
    }, [flourish])

    // Remember how the list was left. Cheap enough to write on every change —
    // four scalars and two key lists — and writing eagerly means a list closed
    // by killing the tab is remembered just as well as one navigated away from.
    useEffect(() => {
        saveListViewPreferences(id, {
            showPacked,
            collapsedSections: [...collapsedSections],
            collapsedGroups: [...collapsedGroups],
        })
    }, [id, showPacked, collapsedSections, collapsedGroups])


    const toggleSection = (sectionKey: string) => {
        // Once the user has arranged the list themselves, the note explaining
        // how it arrived has nothing left to explain.
        setFoldedOnOpen(false)
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(sectionKey)) { next.delete(sectionKey) } else { next.add(sectionKey) }
            return next
        })
    }

    const handleCheckAll = (items: PackingListItem[]) =>
        items.forEach(item => setValue(`items.${item.id}`, true))
    const isDesktop = useIsDesktop()
    const { isLoggedIn, session } = useSolidPod()
    const { showToast } = useToast()
    const { db } = useDatabase()
    // Read from the question set on every visit, not copied onto the list when
    // it was generated — the order is one global setting, so changing it has to
    // reach the lists that already exist. See `useSectionOrder`.
    const sectionOrder = useSectionOrder(db)
    const { sharedListsWithMe, saveSharedListsWithMe } = useSharedListsSync()
    const effectiveOwnerWebId = ownerWebIdFromUrl ?? packingList?.ownerWebId
    const ownerDisplayName = useOwnerDisplayName(foreignPodUrl, effectiveOwnerWebId, session)

    useEffect(() => {
        if (isLoggedIn && session) {
            getPrimaryPodUrl(session).then(url => setOwnPodUrl(url ?? null))
        }
    }, [isLoggedIn, session])

    // Someone who signed in from the "share this list" prompt came back here to
    // share — pick the action up where they left it rather than making them
    // find the button again.
    useEffect(() => {
        if (!isLoggedIn || !id) return
        const pending = getPendingSignInAction()
        if (pending?.type === 'share' && pending.listId === id) {
            clearPendingSignInAction()
            setShareModalOpen(true)
        }
    }, [isLoggedIn, id])

    // The "Update from questions" action only applies to the user's own lists,
    // regenerating them from their local question set. Foreign lists belong to
    // someone else, so gate the button on a question set existing locally.
    useEffect(() => {
        if (foreignPodUrl || !db) {
            setHasQuestionSet(false)
            return
        }
        Promise.resolve()
            .then(() => db.getQuestionSet())
            .then(() => setHasQuestionSet(true))
            .catch(() => setHasQuestionSet(false))
    }, [db, foreignPodUrl])

    useEffect(() => {
        if (!packingList || !foreignPodUrl || !id || !sharedListsWithMe) return
        if (sharedListsWithMe.lists.some(l => l.listId === id)) return
        const fileUrl = `${foreignPodUrl}${POD_CONTAINERS.PACKING_LISTS}${id}.ttl`
        saveSharedListsWithMe({
            lists: [...sharedListsWithMe.lists, {
                listId: id,
                listUrl: fileUrl,
                podUrl: foreignPodUrl,
                ownerWebId: ownerWebIdFromUrl ?? deriveWebIdFromPodUrl(foreignPodUrl),
                label: packingList.name,
                addedAt: new Date().toISOString(),
            }],
            lastModified: new Date().toISOString(),
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when list identity or registry loads
    }, [packingList?.id, foreignPodUrl, sharedListsWithMe])

    useEffect(() => {
        if (!packingList || !foreignPodUrl) return
        // Prefer the URL param, then the value already stored, then derive as last resort.
        // Never overwrite a correct ownerWebId with a derived guess.
        const resolvedOwnerWebId = ownerWebIdFromUrl ?? packingList.ownerWebId ?? deriveWebIdFromPodUrl(foreignPodUrl)
        if (packingList.sharedFromPodUrl === foreignPodUrl && packingList.ownerWebId === resolvedOwnerWebId) return
        db.savePackingList({ ...packingList, sharedFromPodUrl: foreignPodUrl, ownerWebId: resolvedOwnerWebId })
            .then(result => setPackingList(prev => prev ? { ...prev, sharedFromPodUrl: foreignPodUrl, ownerWebId: resolvedOwnerWebId, _rev: result.rev } : prev))
            .catch(() => {})
    }, [packingList?.id, foreignPodUrl, ownerWebIdFromUrl, db])

    // An item typed into a composer is worth following to wherever it landed.
    // An item *moved* is not: marking things last minute happens while reading
    // down the list, and scrolling to the card at the far end of it takes the
    // rows being worked through out from under the user. The highlight alone
    // says where the item went, for whoever is looking that way.
    useEffect(() => {
        if (!highlightedItem?.bringIntoView) return
        // 'nearest' rather than 'center': items are usually added in runs, and
        // centring a row that is already on screen drags the composer being
        // typed into out from under the cursor.
        itemRowRefs.current.get(highlightedItem.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, [highlightedItem])

    // Everything the add-item composers need, derived once per list rather than
    // per composer: there is one on every card, and they re-render whenever an
    // item is ticked.
    const suggestionIndex = useMemo(
        () => buildSuggestionIndex(packingList?.items ?? [], packingList?.deletedItems ?? []),
        [packingList?.items, packingList?.deletedItems],
    )

    const peopleOptions = useMemo<PersonOption[]>(() => {
        const byName = new Map<string, string>()
        for (const guest of packingList?.guests ?? []) byName.set(guest.name, guest.id)
        for (const item of packingList?.items ?? []) {
            if (item.communal || !item.personName) continue
            if (!byName.has(item.personName)) byName.set(item.personName, item.personId)
        }
        return [...byName.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, id]) => ({ name, id }))
    }, [packingList?.items, packingList?.guests])

    // Everyone this list names, so the ones the question set doesn't know —
    // guests, or the whole cast of a shared list — still come out in colours
    // nobody else here is wearing.
    const personIdentity = usePersonIdentities(db, peopleOptions, session)

    // The columns every category card uses — the whole list's people, not the
    // ones a particular category happens to mention, so a person is in the same
    // place on every card and a column of gaps is an answer rather than an
    // absence: nobody has packed a thing for the baby in here.
    const gridColumns = useMemo(
        () => buildGridColumns(peopleOptions, packingList?.items ?? []),
        [peopleOptions, packingList?.items],
    )

    const filtering = isFiltered(selectedPeople)
    /**
     * Whose chips the cards draw. Handed to the grid and to nothing else: the
     * rows themselves, and the row panel that says who needs what, are built
     * from the full column set, because which cells exist is a fact about the
     * list rather than about what is on screen.
     */
    const visibleColumnKeys = filtering ? selectedPeople : undefined

    const handleTogglePerson = useCallback((name: string) => {
        setSelectedPeople(prev => togglePerson(prev, name))
    }, [])
    const handleClearFilter = useCallback(() => {
        setSelectedPeople(new Set<string>())
    }, [])

    /**
     * The column the filter is down to, when it is down to exactly one person.
     *
     * The unassigned column is never one: "Unassigned" is a useful thing to
     * filter by — it is every item nobody has claimed yet — but it is not
     * somebody to rename, remove, or pack a bag for.
     */
    const solePerson = selectedPeople.size === 1 && !sharedSelected(selectedPeople)
        ? gridColumns.find(column => column.key === [...selectedPeople][0] && !column.unassigned)
        : undefined


    const { setValue, getValues, control, reset } = useForm<FormData>({
        defaultValues: {
            items: {}
        }
    })

    // Use useWatch instead of watch() for proper re-renders on form changes
    const watchedItems = useWatch({ control, name: 'items', defaultValue: {} })

    /**
     * The grid's checkboxes are driven from the form's values rather than
     * registered against it.
     *
     * A registered checkbox reads its initial state from the form's *default*
     * values, which `setValue` doesn't update — so a registered box that
     * unmounts and comes back renders unchecked while the form still says
     * packed, and the next save writes the lie down. The grid mounts and
     * unmounts cells constantly (a row leaves when it is finished, columns
     * change with the list), so it reads `watchedItems` instead and can't drift.
     */
    const handleGridToggle = useCallback((item: PackingListItem, checked: boolean) => {
        setValue(`items.${item.id}`, checked)
        handleItemToggle(item.id, checked)
    }, [setValue, handleItemToggle])

    // What each person still has to pack, over the whole list — the figure sits
    // on their chip, which is readable from anywhere, so it has to mean the same
    // thing from anywhere.
    const peopleTotals = useMemo(
        () => personTotals(packingList?.items ?? [], watchedItems),
        [packingList?.items, watchedItems],
    )
    const sharedStat = useMemo(
        () => sharedTotal(packingList?.items ?? [], watchedItems),
        [packingList?.items, watchedItems],
    )

    /**
     * Everything of one person's, packed in a stroke.
     *
     * The old key was deliberately inert because the one thing it could do was
     * this, and doing it by accident is nine items changed with no way back. A
     * labelled button behind a filter answers the accident; the undo answers the
     * rest, which a confirmation dialog never did — a dialog you meet often is a
     * dialog you learn to dismiss.
     */
    const handlePackAllFor = useCallback((personName: string) => {
        const before = { ...getValues('items') }
        const toPack = (packingList?.items ?? []).filter(
            item => !item.communal && item.personName === personName && !before[item.id],
        )
        if (toPack.length === 0) return
        // The effect watching the form's values does the saving; setting them
        // here is the whole of the change.
        for (const item of toPack) setValue(`items.${item.id}`, true)
        showToast(`Packed ${toPack.length} of ${personName}'s items`, 'success', undefined, {
            label: 'Undo',
            onAction: () => {
                for (const item of toPack) setValue(`items.${item.id}`, before[item.id] === true)
            },
        })
    }, [getValues, packingList?.items, setValue, showToast])

    const registerCellRef = useCallback((itemId: string, element: HTMLElement | null) => {
        if (element) itemRowRefs.current.set(itemId, element)
        else itemRowRefs.current.delete(itemId)
    }, [])

    // The finale belongs to the *moment* the list is finished, so it fires on the
    // transition into "everything packed" and is anchored to the viewport rather
    // than the top of the document — you tick the last item wherever you happen
    // to be scrolled to. The banner further down stays as the persistent "this
    // list is done" state for when the list is reopened later.
    useEffect(() => {
        if (!packingList) return
        const total = packingList.items.length
        // The form hydrates a beat after the list loads; until it does, every
        // item looks unpacked and an already-finished list would falsely
        // "transition" into completion on open.
        if (total > 0 && Object.keys(watchedItems).length === 0) return
        const packed = packingList.items.filter(item => watchedItems[item.id]).length
        const complete = total > 0 && packed === total
        const previously = wasAllPackedRef.current
        wasAllPackedRef.current = complete
        if (!complete) {
            setCompletionStage('none')
            setShowConfetti(false)
            setJustCelebrated(false)
            return
        }
        if (previously === null) {
            // Opening a list that was already finished: no celebration to replay,
            // but the cards have no work left in them either.
            setCompletionStage('packed-away')
            return
        }
        if (!previously) {
            setShowConfetti(true)
            setCompletionStage('exiting')
            setJustCelebrated(true)
        }
    }, [packingList, watchedItems])

    useEffect(() => {
        if (!packingList) return
        const total = packingList.items.length
        // Same hydration guard as above: until the form fills in, every item looks
        // unpacked and a list opened mid-way would start with no milestone.
        if (total > 0 && Object.keys(watchedItems).length === 0) return
        const packed = packingList.items.filter(item => watchedItems[item.id]).length
        setMilestone(prev => resolveMilestone(prev, packed, total))
    }, [packingList, watchedItems])

    useEffect(() => {
        if (!showConfetti) return
        const timer = setTimeout(() => setShowConfetti(false), CONFETTI_DURATION_MS)
        return () => clearTimeout(timer)
    }, [showConfetti])

    useEffect(() => {
        if (completionStage !== 'exiting') return
        const timer = setTimeout(() => setCompletionStage('packed-away'), SECTIONS_EXIT_MS)
        return () => clearTimeout(timer)
    }, [completionStage])

    // Ref to the pod save function so useSyncCoordinator can push merged results back.
    // Populated after usePodSync is called below.
    const saveToPodRef = useRef<((data: PackingList) => Promise<boolean>) | undefined>(undefined)

    // Set up sync coordination (handles conflict resolution, focus preservation, etc.)
    const { syncingFromPod, handleSyncSuccess, handleSyncError, saveWithSyncPrevention } =
        useSyncCoordinator<PackingList>({
            currentData: packingList,
            saveToLocalDb: async (data) => {
                const dataToSave = foreignPodUrl ? { ...data, sharedFromPodUrl: foreignPodUrl } : data
                return db.savePackingList(dataToSave)
            },
            updateFormAndState: (data, newRev) => {
                hasLoadedRef.current = true;
                setIsLoading(false);
                setPackingList({
                    ...data,
                    _rev: newRev
                });
                const formValues: Record<string, boolean> = {};
                data.items.forEach((item) => {
                    formValues[item.id] = item.packed;
                });
                reset({ items: formValues });
            },
            conflictStrategy: 'fallback-to-pod',
            mergeFunction: mergePackingLists,
            saveToPod: saveToPodRef.current,
        });

    // When viewing a shared (foreign) pod list and the initial pod fetch fails,
    // stop the infinite loading spinner and surface the error as a toast.
    const handleViewSyncError = useCallback((error: string) => {
        handleSyncError(error)
        if (foreignPodUrl && !hasLoadedRef.current) {
            hasLoadedRef.current = true
            setIsLoading(false)
            const details = reportError(error, 'Could not load shared list')
            showToast(`Could not load shared list: ${error}`, 'error', details)
        }
    }, [handleSyncError, foreignPodUrl, showToast])

    // Callback when save to Pod succeeds
    const handleSaveSuccess = useCallback(() => {
        console.log('Saved packing list to Pod successfully');
    }, []);

    // Callback when save to Pod fails
    const handleSaveError = useCallback((error: string, cause?: unknown) => {
        // A Pod whose address we couldn't look up this second is a network
        // condition, not a fault: the edit is already in the local database, and
        // the next save carries it up. Say that in words the user can act on, and
        // keep it out of Sentry — it arrived there as a bare "No pod URL found"
        // with only errorReporting's own frames for a stack.
        if (isRetryablePodUrlFailure(cause)) {
            console.warn('Save to Pod skipped:', error);
            showToast(error, 'error');
            return;
        }
        const details = reportError(cause ?? error, 'Save to Pod error');
        showToast(`Failed to save to Pod: ${error}`, 'error', details);
    }, [showToast]);

    // Set up automatic Pod sync with polling
    const { saveToPod } = usePodSync<PackingList>({
        pathConfig: {
            container: POD_CONTAINERS.PACKING_LISTS,
            filename: (id) => `${id}.ttl`,
            resourceId: id || null,
            podUrl: foreignPodUrl,
        },
        rdf: { serialize: packingListToDataset, deserialize: datasetToPackingList },
        pollInterval: 5000, // Poll every 5 seconds for faster sync
        // Allow reading public shared lists without login, but never before the
        // local database has been consulted — see localCopyChecked.
        enabled: localCopyChecked && (isLoggedIn || !!foreignPodUrl),
        onSyncSuccess: handleSyncSuccess,
        onSyncError: handleViewSyncError,
        onSaveSuccess: handleSaveSuccess,
        onSaveError: handleSaveError,
    });

    // Keep saveToPodRef in sync so useSyncCoordinator can push merge results back to pod
    useEffect(() => {
        saveToPodRef.current = saveToPod
    }, [saveToPod])

    // The list is read from this device first and the pod catches up afterwards
    // — see useLocalFirstLoad. A list already stored here is on screen in
    // milliseconds instead of waiting on a sync that walks the whole pod.
    const { isCheckingPod } = useLocalFirstLoad(() => {
        // Once this list is on screen the per-list pod poll owns reconciliation:
        // it merges through useSyncCoordinator, which preserves focus and
        // in-flight edits. Re-reading here would reset the form under the
        // user's fingers. The read the login sync triggers is only of use while
        // there is still nothing to show — or while what is showing is another
        // list, which is why this checks the id rather than a "have loaded" flag.
        if (packingList?.id === id) return

        const fetchPackingList = async () => {
            try {
                const doc = await db.getPackingList(id!)
                setLocalCopyChecked(true)
                setPackingList(doc)
                // Use reset (not setValue) so _defaultValues is updated too.
                // register() initialises each checkbox from _defaultValues; setValue
                // only updates the store and leaves _defaultValues stale, which means
                // newly-mounted checkboxes always render unchecked.
                const initialValues: Record<string, boolean> = {}
                doc.items.forEach((item) => {
                    initialValues[item.id] = item.packed
                })
                reset({ items: initialValues })
                hasLoadedRef.current = true
                setIsLoading(false)
            } catch (err) {
                setLocalCopyChecked(true)
                const isNotFound = typeof err === 'object' && err !== null && (err as { name?: string }).name === 'not_found'
                if (isNotFound) {
                    // Not an error: the list simply isn't on this device — a
                    // fresh browser, or a link to a list made on another one.
                    // On a foreign pod the first poll is the only place it can
                    // come from, so hold the spinner and let that poll (or its
                    // error handler) end the wait. On our own pod the local read
                    // is done, which is all isLoading tracks; whether that means
                    // "gone" or "not here yet" is settled at render time. Never
                    // reported either way — a missing list is a normal outcome.
                    if (!foreignPodUrl) setIsLoading(false)
                    return
                }
                reportError(err, 'Error fetching packing list')
                setIsLoading(false)
            }
        }

        return fetchPackingList()
    }, [db, id, foreignPodUrl])

    const handleItemChange = useDebouncedCallback(async () => {
        if (!packingList) {
            console.log('handleItemChange: packingList is null, skipping')
            return
        }

        try {
            const currentFormValues = getValues('items')
            console.log('handleItemChange: checking for changes', {
                itemCount: packingList.items.length,
                formValueCount: Object.keys(currentFormValues).length
            })

            // Check if any items have actually changed
            const hasChanges = packingList.items.some(item => {
                const currentPacked = currentFormValues[item.id] ?? false
                const changed = item.packed !== currentPacked
                if (changed) {
                    console.log('handleItemChange: detected change', {
                        itemId: item.id,
                        itemText: item.itemText,
                        oldPacked: item.packed,
                        newPacked: currentPacked
                    })
                }
                return changed
            })

            // Only save if there are actual changes
            if (!hasChanges) {
                console.log('handleItemChange: No changes detected, skipping save')
                return
            }

            console.log('handleItemChange: Changes detected, saving...')
            setAutoSaveStatus('saving')
            const now = new Date().toISOString()
            const updatedPackingList: PackingList = {
                ...packingList,
                items: packingList.items.map(item => {
                    const newPacked = currentFormValues[item.id] ?? false
                    if (item.packed === newPacked) return item
                    return { ...item, packed: newPacked, lastModified: now }
                })
            }

            // Save with sync prevention (handles local DB + Pod save).
            // Also applies when not logged in but viewing a foreign pod — saveToPod
            // will use globalThis.fetch for anonymous writes to publicly-shared resources.
            if (isLoggedIn || foreignPodUrl) {
                console.log('handleItemChange: Saving to local DB and Pod...')
                const savedPackingList = await saveWithSyncPrevention(updatedPackingList, saveToPod);
                if (savedPackingList) {
                    setPackingList(savedPackingList);
                    console.log('handleItemChange: Saved to local DB and Pod')
                }
            } else {
                // Not logged in and no pod target — local only
                const dataWithTimestamp = {
                    ...updatedPackingList,
                    lastModified: new Date().toISOString()
                };
                const dbResult = await db.savePackingList(dataWithTimestamp);
                const savedPackingList = {
                    ...dataWithTimestamp,
                    _rev: dbResult.rev
                };
                setPackingList(savedPackingList);
                console.log('handleItemChange: Saved to local DB only')
            }

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000) // Show "saved" for 2 seconds
        } catch (err) {
            reportError(err, 'handleItemChange: Error saving packing list')
            setAutoSaveStatus('error')
        }
    }, 800) // Reduced to 800ms for faster saves while still batching rapid changes

    // Trigger auto-save when form values change (not when packingList state changes from sync)
    useEffect(() => {
        console.log('=== AUTO-SAVE EFFECT TRIGGERED ===', {
            hasPackingList: !!packingList,
            watchedItems: watchedItems,
            watchedItemsCount: Object.keys(watchedItems).length,
            watchedItemsKeys: Object.keys(watchedItems)
        })
        if (packingList) {
            console.log('Calling handleItemChange...')
            handleItemChange()
        } else {
            console.log('Skipping handleItemChange - packingList is null')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- packingList intentionally excluded: only trigger on form value changes
    }, [watchedItems, handleItemChange])

    const persistPackingList = async (updatedPackingList: PackingList) => {
        // Show the change now. What follows is only writing down what is already
        // on screen, and holding the render until the database (let alone the
        // pod) comes back leaves the item the user just deleted sitting there
        // while it happens. The saves below correct the state when they land,
        // and report their own failures.
        setPackingList(updatedPackingList)

        if (isLoggedIn || foreignPodUrl) {
            const savedPackingList = await saveWithSyncPrevention(updatedPackingList, saveToPod)
            if (savedPackingList) {
                setPackingList(savedPackingList)
            }
        } else {
            // No pod target — save locally only
            const dataWithTimestamp = { ...updatedPackingList, lastModified: new Date().toISOString() }
            const dbResult = await db.savePackingList(dataWithTimestamp)
            setPackingList({ ...dataWithTimestamp, _rev: dbResult.rev })
        }
    }

    const handleOpenQuestionUpdate = async () => {
        if (!packingList) return
        try {
            // No question set on this device is a state, not a failure: say so
            // and take the button away, rather than letting the generator throw
            // on `questionSet.people` and reporting it as an error.
            const questionSet = await db.getQuestionSet().catch(() => null)
            if (!questionSet) {
                setHasQuestionSet(false)
                showToast('There are no questions saved on this device to update from', 'error')
                return
            }
            const changes = computeQuestionSetChanges(packingList, questionSet)
            if (changes.length === 0) {
                showToast('This list already matches your questions', 'success')
                return
            }
            setQuestionUpdateChanges(changes)
        } catch (err) {
            const details = reportError(err, 'Error computing question updates')
            showToast('Failed to check for question updates', 'error', details)
        }
    }

    const handleConfirmQuestionUpdate = async (selected: QuestionSetChange[]) => {
        if (!packingList || selected.length === 0) {
            setQuestionUpdateChanges(null)
            return
        }
        // Close the preview first. The items change on the list as soon as they
        // are applied now, and leaving the preview up over a list that already
        // shows them reads as the click not having worked.
        setQuestionUpdateChanges(null)
        try {
            const updatedList = applyQuestionSetChanges(packingList, selected)
            // Items the questions no longer produce come off without a tombstone
            // (see QuestionSetChange), so drop any stale form entries by hand.
            const formValues = getValues('items')
            for (const change of selected) {
                for (const removedId of change.removedIds) delete formValues[removedId]
            }
            for (const change of selected) {
                for (const addition of change.additions) formValues[addition.id] = addition.packed
            }
            setValue('items', formValues)
            await persistPackingList(updatedList)
            showToast(questionUpdateSummary(selected), 'success')
        } catch (err) {
            const details = reportError(err, 'Error applying question updates')
            showToast('Failed to update the list', 'error', details)
        }
    }

    const handleDeleteItem = async (itemId: string) => {
        if (!packingList) return

        profileEvent('delete.click', { itemId, itemCount: packingList.items.length })
        try {
            setAutoSaveStatus('saving')

            const item = packingList.items.find(i => i.id === itemId)
            const updatedItems = packingList.items.filter(i => i.id !== itemId)

            // Track deletions for question-set items so the user can be prompted later
            const deletedAt = new Date().toISOString()
            const newDeletedItems = item && item.questionId !== ''
                ? [...(packingList.deletedItems ?? []), { ...item, reviewed: false, lastModified: deletedAt }]
                : (packingList.deletedItems ?? [])

            const updatedPackingList: PackingList = {
                ...packingList,
                items: updatedItems,
                deletedItems: newDeletedItems,
            }

            // Remove from form values
            const currentFormValues = getValues('items')
            delete currentFormValues[itemId]
            profile('delete.setFormValues', () => setValue('items', currentFormValues))

            await profile('delete.persist', () => persistPackingList(updatedPackingList))

            profileEvent('delete.done', { itemId })
            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000)
        } catch (err) {
            reportError(err, 'Error deleting item')
            setAutoSaveStatus('error')
        }
    }

    /**
     * Move an item into the last minute card, or back out of it.
     *
     * The flag is deleted rather than set to false when it comes off: an item
     * that was never marked and one that was unmarked are the same item, and
     * carrying `lastMinute: false` around would only make them look different
     * to the pod and to the merge.
     */
    const handleToggleLastMinute = async (item: PackingListItem) => {
        if (!packingList) return
        const nowLastMinute = !item.lastMinute

        try {
            setAutoSaveStatus('saving')
            const now = new Date().toISOString()
            const updatedItems = packingList.items.map(existing => {
                if (existing.id !== item.id) return existing
                const { lastMinute: _wasLastMinute, ...rest } = existing
                return {
                    ...rest,
                    ...(nowLastMinute ? { lastMinute: true } : {}),
                    lastModified: now,
                }
            })

            // The item has just moved to the other end of the list, so open the
            // card it landed in and mark the row — but stay where the user is
            // reading: they are working down the list, not following the item.
            if (nowLastMinute) {
                setCollapsedSections(prev => {
                    if (!prev.has(LAST_MINUTE_SECTION_KEY)) return prev
                    const next = new Set(prev)
                    next.delete(LAST_MINUTE_SECTION_KEY)
                    return next
                })
            }
            setHighlightedItem({ id: item.id, bringIntoView: false })
            setTimeout(() => setHighlightedItem(null), 2000)

            await persistPackingList({ ...packingList, items: updatedItems })

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000)
        } catch (err) {
            reportError(err, 'Error changing last minute status')
            setAutoSaveStatus('error')
        }
    }

    /**
     * Everything a row of the category grid can be asked to do, in one place.
     *
     * Each of these rewrites the whole list once. Calling the single-item
     * handlers in a loop would not: they each close over `packingList` and each
     * persist a fresh copy of it, so three calls in one tick all start from the
     * same snapshot and the last one to land is the only one that survives.
     */
    const persistItemChanges = async (
        change: (list: PackingList) => PackingList,
        errorContext: string,
    ) => {
        if (!packingList) return
        try {
            setAutoSaveStatus('saving')
            await persistPackingList(change(packingList))
            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000)
        } catch (err) {
            reportError(err, errorContext)
            setAutoSaveStatus('error')
        }
    }

    /**
     * The name belongs to the row rather than to any one copy of it: the same
     * item spelled two ways for two people is a mistake, not a distinction.
     * Quantities are the opposite — they're per person by construction — so this
     * touches nothing but the text.
     */
    const handleRenameRow = (row: GridRow, text: string) => {
        const trimmed = text.trim()
        if (!trimmed || trimmed === row.label) return
        const ids = new Set(row.items.map(item => item.id))
        const now = new Date().toISOString()
        return persistItemChanges(
            list => ({
                ...list,
                items: list.items.map(item => ids.has(item.id)
                    // The name is now the user's, not the question set's. Without
                    // this, updating from questions could not tell a rename the
                    // user made here from one they made in their questions, and
                    // would offer to undo this one. See `buildUpdate`.
                    ? { ...item, itemText: trimmed, ...(item.questionId !== '' ? { textEdited: true } : {}), lastModified: now }
                    : item),
            }),
            'Error renaming item',
        )
    }

    const handleSetItemQuantity = (target: PackingListItem, quantity: number | undefined) => {
        const now = new Date().toISOString()
        return persistItemChanges(
            list => ({
                ...list,
                items: list.items.map(item => {
                    if (item.id !== target.id) return item
                    // Absent rather than 1: an explicit 1 says nothing the default
                    // doesn't, and it would travel to the pod saying it.
                    const { quantity: _previous, ...rest } = item
                    // Hand-set amounts belong to the trip, not to the questions;
                    // the same reasoning as `textEdited` above.
                    return {
                        ...rest,
                        ...(quantity !== undefined && quantity > 1 ? { quantity } : {}),
                        ...(item.questionId !== '' ? { quantityEdited: true } : {}),
                        lastModified: now,
                    }
                }),
            }),
            'Error saving quantity',
        )
    }

    /** Removing every copy on a row, which is one write however many people it covers. */
    const handleDeleteRowItems = (rowItems: PackingListItem[]) => {
        const ids = new Set(rowItems.map(item => item.id))
        const deletedAt = new Date().toISOString()
        const currentFormValues = getValues('items')
        for (const id of ids) delete currentFormValues[id]
        setValue('items', currentFormValues)
        return persistItemChanges(
            list => ({
                ...list,
                items: list.items.filter(item => !ids.has(item.id)),
                // Same bookkeeping as deleting one: items that came from the
                // question set are remembered, so the user can be asked about
                // them the next time the list is updated from their questions.
                deletedItems: [
                    ...(list.deletedItems ?? []),
                    ...rowItems
                        .filter(item => item.questionId !== '')
                        .map(item => ({ ...item, reviewed: false, lastModified: deletedAt })),
                ],
            }),
            'Error removing items',
        )
    }

    const handleAddItem = async (target: AddItemTarget, itemText: string, quantity?: number) => {
        if (!packingList) return

        const newItemText = itemText.trim()
        if (!newItemText) return

        try {
            setAutoSaveStatus('saving')

            const maxOrder = Math.max(-1, ...packingList.items.map(i => i.order ?? -1))
            const newItem: PackingListItem = {
                id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                itemText: newItemText,
                personName: target.communal ? '' : target.personName,
                personId: target.communal ? '' : target.personId,
                questionId: '',
                optionId: '',
                packed: false,
                ...(target.communal ? { communal: true } : {}),
                ...(target.lastMinute ? { lastMinute: true } : {}),
                ...(target.category ? { category: target.category } : {}),
                // A quantity of one is what an absent quantity already means.
                ...(quantity && quantity > 1 ? { quantity } : {}),
                order: maxOrder + 1,
                lastModified: new Date().toISOString(),
            }

            setValue(`items.${newItem.id}`, false)

            // Make sure the group the item lands in is expanded, so an item
            // filed into a collapsed section isn't added into thin air. The two
            // views key the same group the opposite way round.
            const sectionKey = target.lastMinute
                ? LAST_MINUTE_SECTION_KEY
                : target.communal ? SHARED_SECTION_KEY : target.personName
            const categoryLabel = target.category ?? UNCATEGORISED_LABEL
            const groupKey = target.communal ? SHARED_SECTION_KEY : (target.personName || UNASSIGNED_LABEL)
            setCollapsedGroups(prev => {
                // A last minute item lands in the one card, grouped by person,
                // whatever section it would otherwise have belonged to.
                const keysToExpand = target.lastMinute
                    ? [`${LAST_MINUTE_SECTION_KEY}::${groupKey}`]
                    : [`${sectionKey}::${categoryLabel}`, `${categoryLabel}::${groupKey}`]
                if (!keysToExpand.some(k => prev.has(k))) return prev
                const next = new Set(prev)
                for (const k of keysToExpand) next.delete(k)
                return next
            })
            setCollapsedSections(prev => {
                const sectionsToExpand = target.lastMinute ? [sectionKey] : [sectionKey, categoryLabel]
                if (!sectionsToExpand.some(key => prev.has(key))) return prev
                const next = new Set(prev)
                for (const key of sectionsToExpand) next.delete(key)
                return next
            })

            await persistPackingList({ ...packingList, items: [...packingList.items, newItem] })

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000)

            setHighlightedItem({ id: newItem.id, bringIntoView: true })
            setTimeout(() => setHighlightedItem(null), 2000)
        } catch (err) {
            reportError(err, 'Error adding item')
            setAutoSaveStatus('error')
        }
    }

    // The composers are memoised, so their onAdd has to keep the same identity
    // across renders or every tick of a checkbox would re-render every one of
    // them. The ref carries the current list to a callback that never changes.
    const addItemRef = useRef(handleAddItem)
    useEffect(() => { addItemRef.current = handleAddItem })
    const handleComposerAdd = useCallback(
        (target: AddItemTarget, itemText: string, quantity?: number) => {
            addItemRef.current(target, itemText, quantity)
        }, [])
    // The name arrives trimmed and non-empty from the strip's own field; this
    // end only has to put the guest on the list.
    const handleAddGuest = async (name: string) => {
        if (!packingList) return
        const guest = { id: crypto.randomUUID(), name }
        await persistPackingList({
            ...packingList,
            guests: [...(packingList.guests ?? []), guest],
        })
    }

    const handleRenameGuest = async (guestId: string, newName: string) => {
        if (!packingList) return
        const trimmed = newName.trim()
        setRenamingGuestId(null)
        setRenamingGuestName('')
        if (!trimmed) return
        const oldGuest = (packingList.guests ?? []).find(g => g.id === guestId)
        if (!oldGuest || trimmed === oldGuest.name) return
        // The filter holds names. Leave the old one in it and the page stays
        // filtered to somebody no chip names any more — every card empty, no
        // chip pressed, and nothing on screen to undo it.
        setSelectedPeople(prev => {
            if (!prev.has(oldGuest.name)) return prev
            const next = new Set(prev)
            next.delete(oldGuest.name)
            next.add(trimmed)
            return next
        })
        await persistPackingList({
            ...packingList,
            guests: (packingList.guests ?? []).map(g => g.id === guestId ? { ...g, name: trimmed } : g),
            items: packingList.items.map(item => item.personId === guestId ? { ...item, personName: trimmed } : item),
            deletedItems: (packingList.deletedItems ?? []).map(item => item.personId === guestId ? { ...item, personName: trimmed } : item),
        })
    }

    const handleRemoveGuest = async (guestId: string) => {
        if (!packingList) return
        const guest = (packingList.guests ?? []).find(g => g.id === guestId)
        if (guest) {
            setSelectedPeople(prev => {
                if (!prev.has(guest.name)) return prev
                const next = new Set(prev)
                next.delete(guest.name)
                return next
            })
        }
        await persistPackingList({
            ...packingList,
            guests: (packingList.guests ?? []).filter(g => g.id !== guestId),
            items: packingList.items.filter(item => item.personId !== guestId),
            deletedItems: (packingList.deletedItems ?? []).filter(item => item.personId !== guestId),
        })
    }

    const listItems = packingList?.items
    const totalCount = listItems?.length ?? 0
    const packedCount = useMemo(
        () => listItems?.filter(item => watchedItems[item.id]).length ?? 0,
        [listItems, watchedItems],
    )
    const allPacked = totalCount > 0 && packedCount === totalCount
    // The form hydrates a beat after the list loads; until it does every item
    // looks unpacked, and acting on that would fold nothing and celebrate
    // nothing on a list that is in fact half done.
    const formHydrated = totalCount === 0 || Object.keys(watchedItems).length > 0

    // Stats per category, used by question-centric top-level sections. Communal
    // items count here too: question view files them under their category
    // alongside everyone else's, so a section's total has to include them.
    const categoryStats = useMemo(() => {
        const stats: Record<string, SectionStats> = {}
        for (const item of listItems ?? []) {
            // The last minute card is a section in both views, and its items
            // are counted there rather than in the section they came from.
            const key = item.lastMinute ? LAST_MINUTE_SECTION_KEY : (item.category ?? UNCATEGORISED_LABEL)
            stats[key] ??= { packed: 0, total: 0 }
            stats[key].total++
            if (watchedItems[item.id]) stats[key].packed++
        }
        return stats
    }, [listItems, watchedItems])

    // Which top-level sections have nothing left to pack, keyed the way the
    // active view keys them. Sorted so the value is stable enough to compare.
    const completeSectionKeys = useMemo(() => {
        // A filter narrows a card to one person's part of it, and one person
        // finishing their share of Toiletries is not Toiletries being done.
        // Folding on it would also write the fold to storage, so a filter used
        // once would leave the list folded up for good.
        if (filtering) return []
        return Object.entries(categoryStats)
            .filter(([, sectionStat]) => isSectionComplete(sectionStat))
            .map(([key]) => key)
            .sort()
    }, [filtering, categoryStats])
    // Depending on the joined form rather than the array keeps the fold timer
    // below from being cancelled and restarted by every unrelated re-render.
    const completeSectionSignature = completeSectionKeys.join(KEY_SEPARATOR)

    // A list long enough to arrive as a wall of cards opens folded — but only
    // the very first time it is seen on this device. Every open after that is
    // the user's own arrangement, including the arrangement "everything open",
    // so this can never override a choice they've made. Short lists are left
    // alone: a freshly generated list is a thing worth showing someone, and
    // folding it would trade the payoff for tidiness it doesn't need.
    useLayoutEffect(() => {
        if (hasSeededFoldRef.current || !listItems) return
        if (listItems.length <= FOLD_ON_OPEN_MIN_ITEMS) return

        // Keyed the way the view the list is about to open in keys them —
        // folding people away while the page is showing categories folds
        // nothing at all.
        const sectionKeys = new Set(listItems.map(item => (
            item.lastMinute ? LAST_MINUTE_SECTION_KEY : (item.category ?? UNCATEGORISED_LABEL)
        )))

        // A list last left in the old person view has people's names folded
        // away, and not one of them names a card any more — so it would open as
        // a wall of everything, which is exactly what the fold exists to spare
        // the user. Seeding once more puts it back the way they left it in the
        // only sense that survives: folded.
        const foldingAfterPersonView = listSeenBefore
            && hasStalePersonViewSections(storedPreferences, [...sectionKeys])
        if (listSeenBefore && !foldingAfterPersonView) return
        // Nothing to fold *into* — one long section stays open, since folding it
        // would leave the user looking at a single closed box.
        if (sectionKeys.size < 2) return

        hasSeededFoldRef.current = true
        setCollapsedSections(prev => new Set([...prev, ...sectionKeys]))
        setFoldedOnOpen(true)
    }, [listSeenBefore, listItems, storedPreferences])

    // Showing packed items is a request to see everything, so it hands back the
    // sections this page folded away — but not the ones the user folded, which
    // are none of our business.
    useEffect(() => {
        if (!showPacked || autoFoldedRef.current.size === 0) return
        const unfold = [...autoFoldedRef.current]
        autoFoldedRef.current.clear()
        setCollapsedSections(prev => {
            if (!unfold.some(key => prev.has(key))) return prev
            const next = new Set(prev)
            for (const key of unfold) next.delete(key)
            return next
        })
    }, [showPacked])

    // A section with everything packed and packed items hidden is an empty card
    // taking up a column — on a family list that's most of the page by the end
    // of the evening. Fold it down to its header, where the count and the
    // celebration still are, and leave it one tap from opening.
    //
    // Laid out before paint rather than after: a list opened with three people
    // already done would otherwise show their full cards for a frame and then
    // snatch them away, which reads as a glitch rather than as tidying up.
    useLayoutEffect(() => {
        if (!formHydrated || showPacked) return
        // The whole list finishing has its own choreography; folding sections
        // out from under it would fight the fold-away and the banner.
        if (allPacked) return

        const complete = new Set(completeSectionSignature ? completeSectionSignature.split(KEY_SEPARATOR) : [])
        // Unpacking something makes a section eligible to fold again later
        for (const key of autoFoldedRef.current) {
            if (!complete.has(key)) autoFoldedRef.current.delete(key)
        }
        const toFold = [...complete].filter(key => !autoFoldedRef.current.has(key))
        if (toFold.length === 0) return

        const fold = () => {
            for (const key of toFold) autoFoldedRef.current.add(key)
            setCollapsedSections(prev => {
                const next = new Set(prev)
                for (const key of toFold) next.add(key)
                return next
            })
        }

        // Sections already finished when the list opened have no moment to
        // watch, so they're folded before the first paint the user sees. One
        // finished in front of them gets its beat first.
        if (!hasFoldedOnOpenRef.current) {
            hasFoldedOnOpenRef.current = true
            fold()
            return
        }
        const timer = setTimeout(fold, SECTION_FOLD_DELAY_MS)
        return () => clearTimeout(timer)
    }, [completeSectionSignature, formHydrated, showPacked, allPacked])

    // Nothing to show yet, but somewhere still to hear from: the pod sync may
    // be about to write this list locally. Calling it missing before then would
    // be a lie the page has to take back a moment later.
    const listStillOnItsWay = !packingList && isCheckingPod

    if (isLoading || listStillOnItsWay) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <LoadingState message="Loading packing list..." rows={3} />
            </div>
        )
    }

    if (!packingList) {
        return <div className="max-w-4xl mx-auto py-8 px-4">Packing list not found</div>
    }

    const filteredItems = packingList.items.filter(item => {
        if (showPacked) {
            return true
        }
        // A just-ticked item keeps its place until the flourish has played —
        // otherwise the row it belongs to vanishes in the same frame and the
        // feedback has nothing to happen to.
        if (item.id === flourish?.itemId) return true
        return !watchedItems[item.id]
    })

    const percentComplete = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0
    // A sliver of fill so the first item packed is visibly worth something, but
    // nothing at all while the list is untouched
    const progressWidth = packedCount === 0 ? 0 : Math.max(percentComplete, 4)
    // The finished state has its own celebration; milestones step aside for it
    const milestoneMessage = !allPacked && milestone !== null ? MILESTONE_MESSAGES[milestone] : null
    // Asking to see packed items always wins — otherwise a finished list would
    // offer no way back to its own contents.
    const sectionsExiting = completionStage === 'exiting' && !showPacked
    const sectionsPackedAway = completionStage === 'packed-away' && !showPacked
    // Only the moment itself earns the big entrance — and only when the fold
    // actually cleared a space for the banner to rise into.
    const bannerRises = justCelebrated && !showPacked
    // The effect that starts the fold only runs *after* this render, so on the
    // render where the last item lands the stage is still 'none'. Consult the ref
    // directly, otherwise the banner appears for a frame with its gentle entrance,
    // gets pulled for the fold, and the rise never plays.
    const foldPending = allPacked && wasAllPackedRef.current === false && !showPacked
    const bannerHidden = sectionsExiting || foldPending

    // A section's card asks who an item is for, and "the whole group" is one of
    // the answers — it is how a shared item gets added in question view, where
    // there is no shared card to type into. Last, so the picker still opens on a
    // person: most items are somebody's.
    const sectionPeopleChoices: PersonOption[] = [...peopleOptions, { name: SHARED_GROUP_LABEL, id: '', communal: true }]


    // The one card that outranks both groupings: whatever it is grouped by, an
    // item you can't pack yet doesn't belong among the ones you can. It comes
    // last, where it is read last — the final stop on the way out of the door.
    const lastMinuteItems = packingList.items.filter(i => i.lastMinute)
    const lastMinuteSections: ListSection[] = lastMinuteItems.length > 0
        ? [{
            key: LAST_MINUTE_SECTION_KEY,
            title: LAST_MINUTE_TITLE,
            name: '',
            lastMinute: true,
            items: filteredItems.filter(i => i.lastMinute),
            rows: buildCategoryRows(lastMinuteItems, gridColumns),
        }]
        : []

    // Communal items are filed by category, same as everyone else's — they sit
    // among the rows of the section they belong to rather than in a card of
    // their own.
    //
    // Every item goes into the grid, packed ones included: a cell that
    // disappeared when it was ticked would leave a gap indistinguishable from a
    // person who never needed the item, and telling those two apart is the whole
    // of what the grid is for. Hiding what's packed is decided a row at a time,
    // inside the grid.
    const allCategorySections: ListSection[] = groupByCategory(packingList.items.filter(i => !i.lastMinute), sectionOrder)
        .map(({ label, items }) => ({
            key: label,
            title: sectionHeading(label),
            name: '',
            items,
            isCategory: true,
            rows: buildCategoryRows(items, gridColumns),
        }))

    /**
     * A category holds something for the people being packed for.
     *
     * Shared items don't count. "What is left for the baby in Camping?" is not
     * a question the group's tent answers, and a card kept alive by one is a
     * card the user opens to find nothing of what they were looking for.
     */
    const hasSomethingForFilter = (section: ListSection) => !filtering || (section.rows ?? []).some(row => (
        row.communal
            ? sharedSelected(selectedPeople)
            : row.items.some(item => selectedPeople.has(item.personName || UNASSIGNED_COLUMN_KEY))
    ))

    // Under a filter the empty ones go rather than staying as muted headers.
    // Person view used to answer "what is left for Alice?" with one card; the
    // same question answered with three real cards adrift in nine empty ones
    // would be a worse list, not a simpler app. What is missing is said in one
    // line under the cards instead, and that line puts them back.
    const categorySections = filtering ? allCategorySections.filter(hasSomethingForFilter) : allCategorySections
    const listSections: ListSection[] = [...categorySections, ...lastMinuteSections]

    const soleGuest = solePerson === undefined
        ? undefined
        : (packingList.guests ?? []).find(guest => guest.name === solePerson.name)
    const solePersonItems = solePerson === undefined
        ? []
        : packingList.items.filter(item => !item.communal && item.personName === solePerson.name)
    const solePersonTotal = solePersonItems.length
    const solePersonUnpacked = solePersonItems.filter(item => !watchedItems[item.id]).length
    const filterAnnouncement = filterSummary(selectedPeople, categorySections.length, allCategorySections.length)

    /**
     * " for Alice" — what makes a filtered count a number about somebody.
     *
     * Only ever one name: past that it says how many, because a comma-joined
     * list beside a fraction reads as a truncated list, and on a phone it runs
     * straight under the button beside it. The strip above says which people.
     */
    const filterQualifier = filtering ? ` for ${filterLabel(selectedPeople)}` : ''

    /**
     * What "Check all" on a card ticks: what the card is showing. Under a
     * filter that is the selected people's items and not the group's tent —
     * packing Alice's bag should never quietly pack for everyone.
     */
    const checkableItemsOf = (section: ListSection) => (section.rows ?? []).flatMap(row => (
        row.communal
            ? (!filtering || sharedSelected(selectedPeople) ? row.items : [])
            : row.items.filter(item => !filtering || selectedPeople.has(item.personName || UNASSIGNED_COLUMN_KEY))
    ))

    /** What a card holds for the people being packed for, not for everybody. */
    const filteredStatsFor = (section: ListSection) => {
        let packed = 0
        let total = 0
        for (const row of section.rows ?? []) {
            // Shared items belong to no one person, so counting them against a
            // person would put the tent in Alice's total and in Bob's. Counted
            // only when the group's own chip is what is asking.
            if (row.communal) {
                if (!sharedSelected(selectedPeople)) continue
                for (const item of row.items) {
                    total += 1
                    if (watchedItems[item.id]) packed += 1
                }
                continue
            }
            for (const item of row.items) {
                if (!selectedPeople.has(item.personName || UNASSIGNED_COLUMN_KEY)) continue
                total += 1
                if (watchedItems[item.id]) packed += 1
            }
        }
        return { packed, total }
    }

    // How much of the list the grid is holding back: the items on rows where
    // every cell is already packed, which are the only ones it hides.
    const hiddenGridItemCount = showPacked
        ? 0
        : listSections.reduce((count, section) => count + (section.rows ?? []).reduce(
            (rowCount, row) => {
                // Counted the way the grid hides them: over the cells actually
                // on screen, so a filter's numbers describe the filter.
                const shown = !filtering
                    ? row.items
                    : row.communal
                        ? (sharedSelected(selectedPeople) ? row.items : [])
                        : row.items.filter(item => selectedPeople.has(item.personName || UNASSIGNED_COLUMN_KEY))
                return rowCount + (shown.length > 0 && shown.every(item => watchedItems[item.id]) ? shown.length : 0)
            },
            0,
        ), 0)

    // What the banner offers to bring back has to be what is actually missing.
    // A row is hidden only once every cell on it is packed, so most of a
    // half-packed list is still on screen and counting all of it would send the
    // user looking for items that are right in front of them.
    const hiddenPackedCount = showPacked ? 0 : hiddenGridItemCount

    // The panel shows a row that is rebuilt from the list on every render, so it
    // has to be found again each time rather than held. By key first; by one of
    // the items it opened on when the key has moved under it — renaming a row
    // changes its key, and the panel is where renaming happens.
    const openRowSection = openRowKeys ? listSections.find(section => section.key === openRowKeys.sectionKey) : undefined
    const openRow = openRowKeys
        ? openRowSection?.rows?.find(row => row.key === openRowKeys.rowKey)
            ?? openRowSection?.rows?.find(row => row.items.some(item => item.id === openRowKeys.anchorItemId))
            ?? null
        : null

    const tripDates = formatTripDates(packingList.startDate, packingList.endDate)

    // The countdown names the destination itself, so the details row shows the
    // destination separately only when there is no countdown to carry it.
    const tripCountdown = formatTripCountdown(packingList, totalCount - packedCount)

    // One tap between "show me only what I'm packing right now" and the whole
    // list laid out. Worth a control of its own only once there is more than one
    // card to fold.
    const foldableSections = listSections.filter(section => !collapsedSections.has(section.key))
    const everySectionFolded = listSections.length > 0 && foldableSections.length === 0
    const showFoldAllControl = listSections.length > 1
    const toggleAllSections = () => {
        setFoldedOnOpen(false)
        if (everySectionFolded) {
            // Expanding by hand settles the matter: sections that are already
            // finished are marked as dealt with so they don't fold straight back.
            for (const key of completeSectionKeys) autoFoldedRef.current.add(key)
            setCollapsedSections(prev => {
                const next = new Set(prev)
                for (const section of listSections) next.delete(section.key)
                return next
            })
            return
        }
        setCollapsedSections(prev => {
            const next = new Set(prev)
            for (const section of listSections) next.add(section.key)
            return next
        })
    }

    return (
        <>
        <div className="w-full flex flex-col items-center py-8 px-0 sm:px-4">
            {/* Non-sticky header: name, actions */}
            <div className="w-full max-w-screen-2xl mb-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        {/* Going up a level is navigation, not an action: a
                            breadcrumb's weight, in the place a breadcrumb sits.
                            The nav bar already carries "Lists" — this said it a
                            second time in a filled button three times the size. */}
                        <button
                            type="button"
                            onClick={() => navigate(backPath)}
                            aria-label="Back to lists"
                            title="Back to lists"
                            className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
                        >
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
                                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1 .02 1.06L9.06 10l3.75 3.71a.75.75 0 1 1-1.06 1.06l-4.25-4.24a.75.75 0 0 1 0-1.06l4.25-4.24a.75.75 0 0 1 1.04 0Z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{packingList.name}</h1>
                        {foreignPodUrl && (
                            <span className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-full px-2 py-0.5 shrink-0">
                                Shared list
                            </span>
                        )}
                        {isLoggedIn && syncingFromPod && (
                            <span className="text-xs text-blue-600 dark:text-blue-400 shrink-0">Syncing…</span>
                        )}
                        <div className={`flex items-center gap-1 transition-opacity duration-200 shrink-0 ${autoSaveStatus === 'idle' ? 'opacity-0' : 'opacity-100'}`}>
                            {autoSaveStatus === 'saving' && <span className="text-xs text-blue-500 dark:text-blue-400">Saving…</span>}
                            {autoSaveStatus === 'saved' && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
                            {autoSaveStatus === 'error' && <span className="text-xs text-red-600 dark:text-red-400">Error saving</span>}
                        </div>
                    </div>
                    {/* What is left of a row of four filled buttons. None of
                        these is what the page is for — the page is for ticking
                        items off — and rendering them at full weight above the
                        list put the loudest thing on the screen on the least
                        frequent action. "Add guest" went to the people strip,
                        where the people are; "back" is the chevron above. */}
                    {!foreignPodUrl && (
                        <ActionMenu label="List actions">
                            <ActionMenuItem
                                icon="🔗"
                                disabled={isLoggedIn && !ownPodUrl}
                                onSelect={() => {
                                    if (isLoggedIn) setShareModalOpen(true)
                                    else setSignInToSharePromptOpen(true)
                                }}
                            >
                                Share
                            </ActionMenuItem>
                            {hasQuestionSet && (
                                <ActionMenuItem
                                    icon="🔄"
                                    onSelect={handleOpenQuestionUpdate}
                                >
                                    Update from questions
                                </ActionMenuItem>
                            )}
                        </ActionMenu>
                    )}
                </div>
                {(packingList.destination || tripDates) && (
                    <div
                        data-testid="trip-details"
                        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400"
                    >
                        {/* Countdown first: how soon the trip is is what the
                            traveller came to know; the dates back it up. */}
                        <TripCountdownBadge countdown={tripCountdown} />
                        {packingList.destination && !tripCountdown && <span>📍 {packingList.destination}</span>}
                        {tripDates && <span>📅 {tripDates}</span>}
                    </div>
                )}
            </div>

            {/* What's below is this device's copy of the list. Say so while
                the pod is still being read, so anything that changes under the
                user a moment later makes sense. */}
            {isCheckingPod && (
                <div className="w-full max-w-screen-2xl">
                    <PodSyncIndicator subject="this list" />
                </div>
            )}

            {/* Persistent "viewing someone else's list" indicator */}
            {foreignPodUrl && !foreignPodCtx && (
                <div className="w-full max-w-screen-2xl mb-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3">
                    <p className="text-sm text-indigo-800 dark:text-indigo-200 font-medium">
                        👤 Viewing a list from <span className="font-semibold">{resolveOwnerDisplayName(ownerDisplayName, effectiveOwnerWebId, foreignPodUrl)}</span>
                    </p>
                </div>
            )}

            {/* Slim sticky progress strip */}
            <div className="sticky top-0 z-50 w-full mb-4 flex justify-center">
                <div className="w-full max-w-screen-2xl">
                    <div className="backdrop-blur-md bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg px-4 py-2">
                        {/* Counts and bar share a line with the controls where there is
                            room; at 390px the controls drop to a line of their own
                            rather than squeezing everything into wrapped fragments. */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span className={`text-sm font-medium whitespace-nowrap ${allPacked ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}`}>
                                {allPacked ? '🎉 All packed!' : `${packedCount} / ${totalCount} packed (${percentComplete}%)`}
                            </span>
                            {/* The bar shrinks to its minimum before the encouragement
                                gives way, and at 320px the encouragement takes a line of
                                its own rather than running off the side of the phone. */}
                            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <div
                                    role="progressbar"
                                    aria-label="Packing progress"
                                    aria-valuenow={percentComplete}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    className="flex-1 min-w-8 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden"
                                >
                                    <div
                                        data-testid="packing-progress-fill"
                                        className={`progress-bar-fill h-full rounded-full ${allPacked ? 'bg-emerald-500' : 'bg-gradient-primary'}`}
                                        style={{ width: `${progressWidth}%` }}
                                    ></div>
                                </div>
                                {milestoneMessage && (
                                    <span data-testid="progress-milestone" className="text-xs font-semibold text-primary-700 dark:text-primary-300 whitespace-nowrap">
                                        {milestoneMessage}
                                    </span>
                                )}
                            </div>
                            <div className="w-full sm:w-auto flex flex-wrap items-center justify-end gap-2">
                                {showFoldAllControl && (
                                    <button
                                        type="button"
                                        onClick={toggleAllSections}
                                        title={everySectionFolded ? 'Open every section' : 'Fold every section down to its header'}
                                        className="shrink-0 flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                        {/* Same glyph the section headers use for the same
                                            state, so the toolbar and the cards never point
                                            opposite ways at each other. */}
                                        <span aria-hidden="true" className="text-xs text-gray-400 dark:text-gray-500">{everySectionFolded ? '▶' : '▼'}</span>
                                        {/* The word "all" is what tips this row onto a second
                                            line on a phone, and the icon already says it. */}
                                        {everySectionFolded ? (isDesktop ? 'Expand all' : 'Expand') : (isDesktop ? 'Collapse all' : 'Collapse')}
                                    </button>
                                )}
                                {/* Loud only while there is something behind it:
                                    with nothing packed yet this button reveals
                                    an empty set, and it was the brightest thing
                                    on the screen for it. */}
                                <Button
                                    type="button"
                                    variant={hiddenPackedCount > 0 ? 'primary' : 'subtle'}
                                    onClick={() => setShowPacked(!showPacked)}
                                >
                                    {showPacked ? 'Hide Packed' : 'Show Packed'}
                                </Button>
                            </div>
                        </div>
                        {/* Which coloured initial is whose — and, since it already
                            names everyone the cards can show, which of them the
                            user is packing for. */}
                        <div data-testid="people-key">
                            <PeopleFilterBar
                                columns={gridColumns}
                                selected={selectedPeople}
                                totals={peopleTotals}
                                sharedStat={sharedStat.total > 0 ? sharedStat : undefined}
                                personIdentity={personIdentity}
                                onToggle={handleTogglePerson}
                                controlsId={LIST_SECTIONS_ID}
                                onAddGuest={foreignPodUrl ? undefined : handleAddGuest}
                            />
                        </div>
                        {/* Only while a filter is on: unfiltered it held a line
                            of grey text restating the strip above it, which is a
                            36th of a phone screen spent on nothing. Within a
                            filter its height doesn't change, so moving between
                            people never shifts the cards. It scrolls rather than
                            wraps for the same reason the strip does — a guest's
                            row of controls is wider than a phone. */}
                        {filtering && (
                            <div className="mt-1.5 flex min-h-[2.75rem] items-center gap-2 overflow-x-auto border-t border-gray-100 dark:border-gray-800 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                <button
                                    type="button"
                                    onClick={handleClearFilter}
                                    className="shrink-0 rounded-full border border-blue-200 dark:border-blue-800 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                >
                                    Clear
                                </button>
                                {solePerson !== undefined && (
                                    <>
                                        {soleGuest && renamingGuestId === soleGuest.id ? (
                                            <input
                                                type="text"
                                                aria-label={`Rename ${soleGuest.name}`}
                                                value={renamingGuestName}
                                                onChange={(e) => setRenamingGuestName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') { e.preventDefault(); handleRenameGuest(soleGuest.id, renamingGuestName) }
                                                    if (e.key === 'Escape') { setRenamingGuestId(null); setRenamingGuestName('') }
                                                }}
                                                onBlur={() => handleRenameGuest(soleGuest.id, renamingGuestName)}
                                                autoFocus
                                                className="w-40 shrink-0 rounded-md border border-blue-400 dark:border-blue-600 px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        ) : (
                                            <>
                                                <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-300">{solePerson.name}</span>
                                                {/* On a phone the chips are faces
                                                    with no names on them, so the
                                                    numbers come off the chip and
                                                    land here beside the name. */}
                                                <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400 sm:hidden">
                                                    {solePersonTotal - solePersonUnpacked}/{solePersonTotal}
                                                </span>
                                            </>
                                        )}
                                        {soleGuest && renamingGuestId !== soleGuest.id && (
                                            <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Guest</span>
                                        )}
                                        {/* One person finishing their bag is a
                                            real thing to have done. The trip's
                                            own celebration stays for the trip,
                                            but this shouldn't pass in silence. */}
                                        {solePersonUnpacked === 0 && solePersonTotal > 0 ? (
                                            <span className="shrink-0 whitespace-nowrap rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                                🎉 {solePerson.name}'s bag is packed!
                                            </span>
                                        ) : solePersonUnpacked > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => handlePackAllFor(solePerson.name)}
                                                className="shrink-0 whitespace-nowrap rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/40"
                                            >
                                                {/* The number is in the button, where it
                                                    is read before the tap rather than in a
                                                    dialog after it. */}
                                                Pack all {solePersonUnpacked} of {solePerson.name}'s
                                            </button>
                                        )}
                                        {soleGuest && !foreignPodUrl && renamingGuestId !== soleGuest.id && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => { setRenamingGuestId(soleGuest.id); setRenamingGuestName(soleGuest.name) }}
                                                    className="shrink-0 rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                                                >
                                                    Rename
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setGuestToRemove(soleGuest.id)}
                                                    className="shrink-0 rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300"
                                                >
                                                    Remove
                                                </button>
                                            </>
                                        )}
                                    </>
                                )}
                                {/* Which faces are pressed, in words. The strip
                                    above says it in colour, which is no answer
                                    on a phone where the chips carry no names. */}
                                {solePerson === undefined && (
                                    <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-300">
                                        {filterNames(selectedPeople)}
                                    </span>
                                )}
                            </div>
                        )}
                        {/* Announced rather than shown: the strip above says the
                            same thing in colour and position. */}
                        <p role="status" aria-live="polite" className="sr-only">{filterAnnouncement}</p>
                    </div>
                </div>
            </div>

            {/* All packed celebration banner. When the list is finished in front of
                the user it waits for the cards to fold away and then rises into the
                cleared space — arriving mid-fold meant competing with the confetti
                and the collapsing layout. Revisits keep the original gentle
                entrance, and with packed items shown nothing folds, so there's no
                stage to clear and it just appears. */}
            {allPacked && !bannerHidden && (
                <div
                    data-testid="completion-banner"
                    className={`w-full max-w-screen-2xl mb-4 ${bannerRises ? 'celebration-banner-rising' : 'celebration-banner'}`}
                >
                    <div className="relative overflow-hidden rounded-xl px-6 py-6 text-center shadow-lg celebration-bg">
                        {/* Decorative only, and there isn't room for them beside the
                            headline on a phone — they land right on top of the text */}
                        <span aria-hidden="true" className="celebration-emoji hidden sm:block" style={{ left: '4%', animationDelay: '0s' }}>🎊</span>
                        <span aria-hidden="true" className="celebration-emoji hidden sm:block" style={{ left: '12%', animationDelay: '0.5s' }}>✈️</span>
                        <span aria-hidden="true" className="celebration-emoji hidden sm:block" style={{ right: '12%', animationDelay: '0.8s' }}>🌍</span>
                        <span aria-hidden="true" className="celebration-emoji hidden sm:block" style={{ right: '4%', animationDelay: '0.3s' }}>🎉</span>
                        <div className="relative z-10">
                            <div className={`text-4xl mb-2 ${bannerRises ? 'celebration-suitcase-pop' : ''}`}>🧳</div>
                            <p className="text-2xl font-bold text-white drop-shadow-sm">You're all packed!</p>
                            <p className="text-emerald-100 mt-1 text-sm font-medium">Everything's ready — time for adventure!</p>
                        </div>
                    </div>
                </div>
            )}

            {/* The one time the page arranges the list for the user, it says so and
                hands back the undo in the same breath — same bargain as the hidden
                packed items note below. It goes the moment they arrange anything
                themselves, so it never becomes furniture. */}
            {foldedOnOpen && everySectionFolded && (
                <div data-testid="folded-on-open-note" className="w-full max-w-screen-2xl mb-4">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-3">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                            A long list, so all {listSections.length} sections start folded — tap any heading to open one.
                        </p>
                        <button
                            type="button"
                            onClick={toggleAllSections}
                            className="shrink-0 rounded-md border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-semibold text-blue-700 dark:text-blue-300 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/40"
                        >
                            Expand all
                        </button>
                    </div>
                </div>
            )}

            {/* Hidden packed items banner — at 100% it's just noise next to the
                celebration, and the Show Packed button is right there anyway */}
            {hiddenPackedCount > 0 && !allPacked && (
                <div className="w-full max-w-screen-2xl mb-4">
                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                            {hiddenPackedCount} packed item{hiddenPackedCount !== 1 ? 's' : ''} hidden — tap <strong>Show Packed</strong> to see them.
                        </p>
                    </div>
                </div>
            )}

            {/* Main content */}
            <div className="w-full">
                <div>
                    {/* Once everything is packed the cards hold nothing but empty
                        celebrations, so they fold away and leave the banner as the
                        last thing standing — the fold itself is the celebration.
                        Showing packed items brings them straight back. */}
                    {/* A grid card is a table that has to be read across, so the
                        cards stack rather than flowing into masonry columns —
                        two abreast once there is room for two tables. */}
                    {!sectionsPackedAway && <div
                        id={LIST_SECTIONS_ID}
                        className={`${sectionsExiting ? 'sections-packing-away' : ''} grid grid-cols-1 items-start gap-4 xl:grid-cols-2`}
                    >
                        {listSections.map((section) => {
                            const { key: sectionKey, title, items } = section
                            const unfilteredStats = categoryStats[sectionKey] ?? { packed: 0, total: 0 }
                            // A card says what is on it. Under a filter that is
                            // one person's part of the category, so the count
                            // says whose — an unqualified "2 / 5" beside a page
                            // total of "24 / 58" is a number with no referent.
                            const stats = filtering ? filteredStatsFor(section) : unfilteredStats
                            const isLastMinute = section.lastMinute === true
                            // A card is finished when the part of it on screen
                            // is finished — packing for Alice, Toiletries is
                            // done when hers are, whatever Bob still owes. The
                            // fold-away is the one part of the celebration a
                            // filter doesn't get: folding writes to storage, and
                            // a filter used once would leave the list folded up
                            // for good (see `completeSectionKeys`).
                            const isComplete = isSectionComplete(stats)
                            const completeLabel = title
                            const collapseLabelTarget = isLastMinute ? 'the last minute items' : title
                            // Every card is a grid now: the name down the side,
                            // the people across it. There are no groups folded
                            // inside one any more — the people filter above the
                            // cards is what narrows a card to somebody.
                            const isGridSection = true
                            const isSectionCollapsed = collapsedSections.has(sectionKey)
                            const sectionBorder = isComplete
                                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40'
                                // Amber, because the card is a reminder rather than
                                // a pile: nothing in it can be dealt with yet.
                                : isLastMinute
                                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'
                                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                            return (
                            <div key={sectionKey} data-testid="list-section" className={`border rounded-lg p-3 shadow-sm transition-colors duration-300 sm:p-4 ${sectionBorder}`} style={{ breakInside: 'avoid' }}>
                                {/* The rule under the heading separates it from the items
                                    below; a folded card has none, so it would just be a
                                    line ruling off empty space. */}
                                <div className={isSectionCollapsed ? undefined : 'mb-4 pb-2 border-b border-gray-200 dark:border-gray-700'}>
                                    <div className="flex flex-wrap items-center gap-1 min-h-[2rem]">
                                        <button
                                            type="button"
                                            aria-label={`${isSectionCollapsed ? 'Expand' : 'Collapse'} ${collapseLabelTarget} list`}
                                            onClick={() => toggleSection(sectionKey)}
                                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                        >
                                            <span className="shrink-0 text-sm text-gray-400 dark:text-gray-500">{isSectionCollapsed ? '▶' : '▼'}</span>
                                            <span className="text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</span>
                                            {/* Never let a count break across lines — "9 /" above "9" is
                                                a fraction the eye has to reassemble. */}
                                            <span className="ml-1 shrink-0 whitespace-nowrap text-sm font-normal text-gray-500 dark:text-gray-400">
                                                {stats.packed} / {stats.total}{filterQualifier}
                                            </span>
                                        </button>
                                        {isComplete && (
                                            <span
                                                aria-label={`All packed for ${completeLabel}${filterQualifier}`}
                                                className="animate-pop-in text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5 shrink-0"
                                            >
                                                🎉 All packed!
                                            </span>
                                        )}
                                        {/* Used to sit on each folded group inside a card. The
                                            groups have gone, so it works on the card — and with
                                            the filter above, "check all of Alice's toiletries"
                                            is this button with Alice selected. */}
                                        {!isSectionCollapsed && stats.packed < stats.total && (
                                            <button
                                                type="button"
                                                aria-label={`Check all${filterQualifier} in ${title}`}
                                                onClick={() => handleCheckAll(checkableItemsOf(section))}
                                                className="shrink-0 rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                            >
                                                Check all
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {!isSectionCollapsed && <div>
                                    {/* The card is the only one whose items can't be dealt with
                                        yet, so it says why rather than leaving that to the name. */}
                                    {isLastMinute && (
                                        <p className="-mt-2 mb-3 text-sm text-amber-800 dark:text-amber-200">{LAST_MINUTE_HINT}</p>
                                    )}
                                    {/* Every card can be typed into directly. What varies is which
                                        part of the target the card already knows: a person's card
                                        knows who, and asks which section; a section's card knows
                                        which section, and asks who. */}
                                    <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                                        {/* The card knows which section it is;
                                            who it is for follows the filter when
                                            the filter names one person, so an
                                            item typed while packing Alice's bag
                                            doesn't land somewhere she can't see
                                            it. */}
                                        <AddItemComposer
                                            personName={solePerson?.name ?? ''}
                                            personId={solePerson?.personId ?? ''}
                                            category={isLastMinute ? undefined : categoryFromLabel(sectionKey)}
                                            lastMinute={isLastMinute}
                                            peopleOptions={sectionPeopleChoices}
                                            suggestions={suggestionIndex}
                                            targetLabel={isLastMinute ? 'last minute items' : title}
                                            onAdd={handleComposerAdd}
                                        />
                                    </div>
                                    {isComplete && items.length === 0 && !isGridSection && (
                                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                            Nothing left to pack 🎒
                                        </p>
                                    )}
                                    {isGridSection && (
                                        <CategoryItemGrid
                                            columns={gridColumns}
                                            visibleColumnKeys={visibleColumnKeys}
                                            rows={section.rows ?? []}
                                            personIdentity={personIdentity}
                                            packedById={watchedItems}
                                            // The names go when there isn't room
                                            // for them; the legend above the
                                            // cards decodes the initials instead.
                                            hidePacked={!showPacked}
                                            flourish={flourish}
                                            highlightedItemId={highlightedItem?.id}
                                            onToggleItem={handleGridToggle}
                                            registerCellRef={registerCellRef}
                                            onOpenRow={(row) => setOpenRowKeys({ sectionKey, rowKey: row.key, anchorItemId: row.items[0]?.id })}
                                        />
                                    )}
                                </div>}
                            </div>
                        )})}
                    </div>}
                    {!sectionsPackedAway && listSections.length === 0 && filtering && (
                        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-6 text-center">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Nothing on this list is{filterQualifier} yet.
                            </p>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Clear the filter to add the first thing{filterQualifier}, or pick somebody else.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
        {showConfetti && (
            <div
                data-testid="completion-confetti"
                aria-hidden="true"
                className="fixed inset-0 z-[60] pointer-events-none overflow-hidden"
            >
                {CONFETTI_PIECES.map((piece, i) => (
                    <span
                        key={i}
                        className="confetti-piece"
                        style={{ left: piece.left, animationDelay: piece.delay }}
                    >
                        {piece.emoji}
                    </span>
                ))}
            </div>
        )}
        <ConfirmationDialog
            isOpen={itemToDelete !== null}
            onClose={() => setItemToDelete(null)}
            onConfirm={() => { handleDeleteItem(itemToDelete!); setItemToDelete(null) }}
            title="Remove item"
            message="Are you sure you want to remove this item?"
            confirmText="Remove"
            confirmVariant="danger"
        />
        <ItemRowPanel
            isOpen={openRow !== null}
            onClose={() => setOpenRowKeys(null)}
            row={openRow}
            columns={gridColumns}
            sectionTitle={openRowSection?.title ?? ''}
            personIdentity={personIdentity}
            packedById={watchedItems}
            onRename={handleRenameRow}
            onSetQuantity={handleSetItemQuantity}
            onToggleLastMinute={handleToggleLastMinute}
            onAddFor={(row, column) => handleAddItem({
                personName: column.unassigned ? '' : column.name,
                personId: column.unassigned ? '' : column.personId,
                // A category card's section *is* the category. The last minute
                // card's isn't: its items keep the section they came from, so a
                // copy made there takes it from the item beside it.
                category: openRowSection?.isCategory
                    ? categoryFromLabel(openRowSection.key)
                    : row.items[0]?.category,
                lastMinute: openRowSection?.lastMinute,
            }, row.label, row.quantity)}
            onRemove={(item) => handleDeleteItem(item.id)}
            onDeleteRow={(row) => {
                setOpenRowKeys(null)
                if (row.items.length === 1) { setItemToDelete(row.items[0].id); return }
                setRowToDelete({
                    label: row.label,
                    items: row.items,
                    who: row.items.map(item => item.personName || UNASSIGNED_LABEL).join(', '),
                })
            }}
        />
        <ConfirmationDialog
            isOpen={rowToDelete !== null}
            onClose={() => setRowToDelete(null)}
            onConfirm={() => { if (rowToDelete) handleDeleteRowItems(rowToDelete.items); setRowToDelete(null) }}
            title="Remove item"
            message={rowToDelete
                ? `Remove ${rowToDelete.label} for ${rowToDelete.who}?`
                : ''}
            confirmText="Remove"
            confirmVariant="danger"
        />
        <ConfirmationDialog
            isOpen={guestToRemove !== null}
            onClose={() => setGuestToRemove(null)}
            onConfirm={() => { handleRemoveGuest(guestToRemove!); setGuestToRemove(null) }}
            title="Remove guest"
            message="Remove this guest and all their items from this list?"
            confirmText="Remove"
            confirmVariant="danger"
        />
        <SolidPodPrompt
            isOpen={signInToSharePromptOpen}
            onClose={() => setSignInToSharePromptOpen(false)}
            title="Sign in to share this list"
            message="Sharing sends your friend a link to this list, so it needs somewhere online to live. Sign in with a Solid Pod and we'll bring you straight back here to share."
            benefitsTitle="What signing in unlocks:"
            benefits={[
                { label: 'Share this list', text: 'Send a friend a link, or invite them by WebID' },
                { label: 'Pack together', text: 'You both tick items off the same list' },
                { label: 'Free', text: 'All major Pod providers are free to sign up' },
                { label: 'You own your data', text: 'Your lists stay in your personal storage' },
            ]}
            confirmLabel="🔗 Sign in to share"
            dismissLabel="Not now"
            onBeforeLogin={() => { if (id) setPendingSignInAction({ type: 'share', listId: id }) }}
        />
        {session && ownPodUrl && id && (
            <SharePackingListModal
                isOpen={shareModalOpen}
                onClose={() => setShareModalOpen(false)}
                session={session}
                fileUrl={`${ownPodUrl}${POD_CONTAINERS.PACKING_LISTS}${id}.ttl`}
                listId={id}
                sharerPodUrl={ownPodUrl}
                saveListToPod={packingList ? async () => {
                    await saveRdfToPod({
                        session,
                        fileUrl: `${ownPodUrl}${POD_CONTAINERS.PACKING_LISTS}${id}.ttl`,
                        data: packingList,
                        serializer: packingListToDataset,
                    })
                } : undefined}
            />
        )}
        <UpdateFromQuestionsModal
            isOpen={questionUpdateChanges !== null}
            onClose={() => setQuestionUpdateChanges(null)}
            changes={questionUpdateChanges ?? NO_QUESTION_UPDATES}
            onConfirm={handleConfirmQuestionUpdate}
        />
        </>
    )
}
