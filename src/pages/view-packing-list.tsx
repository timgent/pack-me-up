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
import { POD_CONTAINERS, getPrimaryPodUrl, saveRdfToPod, resolveOwnerDisplayName, deriveWebIdFromPodUrl } from '../services/solidPod'
import { useOwnerDisplayName } from '../hooks/useOwnerDisplayName'
import { packingListToDataset, datasetToPackingList } from '../services/rdfSerialization'
import { SharePackingListModal } from '../components/SharePackingListModal'
import { SolidPodPrompt } from '../components/SolidPodPrompt'
import { UpdateFromQuestionsModal } from '../components/UpdateFromQuestionsModal'
import { useForeignPod } from '../components/ForeignPodContext'
import { useSharedListsSync } from '../hooks/useSharedListsSync'
import { mergePackingLists } from '../utils/mergePackingLists'
import { computeQuestionSetAdditions } from '../create-packing-list/updateFromQuestions'
import { MILESTONE_MESSAGES, resolveMilestone } from './packing-milestones'
import { formatTripDates } from '../create-packing-list/tripDetails'
import { tapFeedback } from '../utils/haptics'
import { prefersReducedMotion } from '../utils/prefersReducedMotion'
import { groupItemsByCategory, sortByOrder, type CategoryAccessors } from '../utils/groupByCategory'
import { CATEGORY_ORDER } from '../edit-questions/item-sections'
import { useSectionOrder } from '../hooks/useSectionOrder'
import { clearPendingSignInAction, getPendingSignInAction, setPendingSignInAction } from '../utils/pendingSignInAction'
import { usePersonColors } from '../hooks/usePersonColors'
import { PersonAvatar } from '../components/PersonAvatar'
import { AddItemComposer, UNCATEGORISED_LABEL, type AddItemTarget, type PersonOption } from '../components/AddItemComposer'
import { CategoryItemGrid } from '../components/CategoryItemGrid'
import { ItemRowPanel } from '../components/ItemRowPanel'
import { buildCategoryRows, buildGridColumns, type GridRow } from '../utils/categoryItemGrid'
import { buildSuggestionIndex } from '../utils/itemSuggestions'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { loadListViewPreferences, saveListViewPreferences, hasStoredListViewPreferences, type ListViewMode } from '../utils/listViewPreferences'
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
    key: string
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


/**
 * Which top-level card an item belongs to in person view. Last minute wins over
 * everything: the point of marking an item is that it leaves the card it was in.
 */
function personViewSectionKey(item: PackingListItem): string {
    if (item.lastMinute) return LAST_MINUTE_SECTION_KEY
    return item.communal ? SHARED_SECTION_KEY : item.personName
}

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
    // Additions computed from the question set; non-null opens the preview modal.
    const [questionUpdateAdditions, setQuestionUpdateAdditions] = useState<PackingListItem[] | null>(null)
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
    const [viewMode, setViewMode] = useState<ListViewMode>(storedPreferences.viewMode)
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    // Which section has an add-item composer open inside it. Only one is mounted
    // at a time: a composer per group would put an input in front of every
    // heading on the page, which is what the list already pays for in item rows.
    const [openComposerKey, setOpenComposerKey] = useState<string | null>(null)
    const [itemToDelete, setItemToDelete] = useState<string | null>(null)
    // Which row of the category grid has its "who needs this?" panel open, held
    // as keys rather than as the row itself: the row is rebuilt whenever the
    // list changes, and a panel holding the old one would keep showing the state
    // before the change it was used to make.
    const [openRowKeys, setOpenRowKeys] = useState<{ sectionKey: string; rowKey: string; anchorItemId?: string } | null>(null)
    // A row can hold one item or one each for four people; removing the second
    // kind is worth naming who it affects.
    const [rowToDelete, setRowToDelete] = useState<{ label: string; items: PackingListItem[]; who: string } | null>(null)
    const [editingItemId, setEditingItemId] = useState<string | null>(null)
    const [editingItemText, setEditingItemText] = useState<string>('')
    const [editingItemQuantity, setEditingItemQuantity] = useState<string>('')
    // Groups within a section, keyed `sectionKey::groupLabel`
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(storedPreferences.collapsedGroups))
    // Top-level sections: a person, a category, or the shared section
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
    const [showAddGuest, setShowAddGuest] = useState(false)
    // Reveals an empty Shared Items section on lists that have no communal
    // items yet; once an item is added the section persists from the data.
    const [showSharedSection, setShowSharedSection] = useState(false)
    const [newGuestName, setNewGuestName] = useState('')
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
            viewMode,
            showPacked,
            collapsedSections: [...collapsedSections],
            collapsedGroups: [...collapsedGroups],
        })
    }, [id, viewMode, showPacked, collapsedSections, collapsedGroups])


    const toggleGroup = (key: string) =>
        setCollapsedGroups(prev => {
            const next = new Set(prev)
            if (next.has(key)) { next.delete(key) } else { next.add(key) }
            return next
        })

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

    // The sections a new item can be filed into: the ones this list already
    // shows, in the order it shows them, plus the catch-all. Offering sections
    // the list doesn't use would invent cards no one asked for — new sections
    // belong to the question set, where they can be arranged.
    const categoryOptions = useMemo(() => {
        const labels = groupByCategory(packingList?.items ?? [], sectionOrder).map(group => group.label)
        return labels.includes(UNCATEGORISED_LABEL) ? labels : [...labels, UNCATEGORISED_LABEL]
    }, [packingList?.items, sectionOrder])

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
    const personColor = usePersonColors(db, peopleOptions)

    // The columns every category card uses — the whole list's people, not the
    // ones a particular category happens to mention, so a person is in the same
    // place on every card and a column of gaps is an answer rather than an
    // absence: nobody has packed a thing for the baby in here.
    const gridColumns = useMemo(
        () => buildGridColumns(peopleOptions, packingList?.items ?? []),
        [peopleOptions, packingList?.items],
    )


    const { register, setValue, getValues, control, reset } = useForm<FormData>({
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
    const handleSaveError = useCallback((error: string) => {
        const details = reportError(error, 'Save to Pod error');
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
            const questionSet = await db.getQuestionSet()
            const additions = computeQuestionSetAdditions(packingList, questionSet)
            if (additions.length === 0) {
                showToast('This list already matches your questions', 'success')
                return
            }
            setQuestionUpdateAdditions(additions)
        } catch (err) {
            const details = reportError(err, 'Error computing question updates')
            showToast('Failed to check for question updates', 'error', details)
        }
    }

    const handleConfirmQuestionUpdate = async (selected: PackingListItem[]) => {
        if (!packingList || selected.length === 0) {
            setQuestionUpdateAdditions(null)
            return
        }
        // Close the preview first. The items appear on the list as soon as they
        // are added now, and leaving the preview up over a list that already has
        // them reads as the click not having worked.
        setQuestionUpdateAdditions(null)
        try {
            const updatedList: PackingList = {
                ...packingList,
                items: [...packingList.items, ...selected],
            }
            await persistPackingList(updatedList)
            showToast(`Added ${selected.length} item${selected.length === 1 ? '' : 's'} from your questions`, 'success')
        } catch (err) {
            const details = reportError(err, 'Error adding question updates')
            showToast('Failed to add items', 'error', details)
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

    const handleStartEdit = (item: PackingListItem) => {
        setEditingItemId(item.id)
        setEditingItemText(item.itemText)
        setEditingItemQuantity(item.quantity !== undefined ? String(item.quantity) : '')
    }

    const handleCancelEdit = () => {
        setEditingItemId(null)
        setEditingItemText('')
        setEditingItemQuantity('')
    }

    const handleSaveEdit = async (itemId: string) => {
        const trimmed = editingItemText.trim()
        if (!trimmed) {
            handleCancelEdit()
            return
        }
        if (!packingList) return

        const parsedQuantity = parseInt(editingItemQuantity, 10)
        const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : undefined

        try {
            setAutoSaveStatus('saving')

            const now = new Date().toISOString()
            const updatedItems = packingList.items.map(item =>
                item.id === itemId
                    ? { ...item, itemText: trimmed, quantity, lastModified: now }
                    : item
            )
            await persistPackingList({ ...packingList, items: updatedItems })

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000)
        } catch (err) {
            reportError(err, 'Error saving item name')
            setAutoSaveStatus('error')
        } finally {
            setEditingItemId(null)
            setEditingItemText('')
            setEditingItemQuantity('')
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
                items: list.items.map(item => ids.has(item.id) ? { ...item, itemText: trimmed, lastModified: now } : item),
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
                    return { ...rest, ...(quantity !== undefined && quantity > 1 ? { quantity } : {}), lastModified: now }
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
    const closeComposer = useCallback(() => setOpenComposerKey(null), [])

    const handleAddGuest = async () => {
        if (!packingList || !newGuestName.trim()) return
        const guest = { id: crypto.randomUUID(), name: newGuestName.trim() }
        await persistPackingList({
            ...packingList,
            guests: [...(packingList.guests ?? []), guest],
        })
        setNewGuestName('')
        setShowAddGuest(false)
    }

    const handleRenameGuest = async (guestId: string, newName: string) => {
        if (!packingList) return
        const trimmed = newName.trim()
        setRenamingGuestId(null)
        setRenamingGuestName('')
        if (!trimmed) return
        const oldGuest = (packingList.guests ?? []).find(g => g.id === guestId)
        if (!oldGuest || trimmed === oldGuest.name) return
        await persistPackingList({
            ...packingList,
            guests: (packingList.guests ?? []).map(g => g.id === guestId ? { ...g, name: trimmed } : g),
            items: packingList.items.map(item => item.personId === guestId ? { ...item, personName: trimmed } : item),
            deletedItems: (packingList.deletedItems ?? []).map(item => item.personId === guestId ? { ...item, personName: trimmed } : item),
        })
    }

    const handleRemoveGuest = async (guestId: string) => {
        if (!packingList) return
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

    // Per-section and per-group stats are wanted by the auto-fold effect as well
    // as by the rendering below, so they're derived here rather than inline in
    // the JSX — effects can't live after the early returns.
    const sectionStats = useMemo(() => {
        const stats: Record<string, SectionStats> = {}
        for (const item of listItems ?? []) {
            const key = personViewSectionKey(item)
            stats[key] ??= { packed: 0, total: 0 }
            stats[key].total++
            if (watchedItems[item.id]) stats[key].packed++
        }
        return stats
    }, [listItems, watchedItems])

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

    // Stats for the groups *inside* a section. Both views are keyed here because
    // both are one toggle away: person view groups a person's items by category,
    // question view groups a category's items by person (communal items under
    // the shared key), and the person-view shared card groups by category.
    const groupStats = useMemo(() => {
        const stats: Record<string, SectionStats> = {}
        const count = (key: string, packed: boolean) => {
            stats[key] ??= { packed: 0, total: 0 }
            stats[key].total++
            if (packed) stats[key].packed++
        }
        for (const item of listItems ?? []) {
            const category = item.category ?? UNCATEGORISED_LABEL
            const packed = !!watchedItems[item.id]
            // The last minute card groups by person, and holds its items whole:
            // they are not also counted under the section they were lifted from.
            if (item.lastMinute) {
                const personKey = item.communal ? SHARED_SECTION_KEY : (item.personName || UNASSIGNED_LABEL)
                count(`${LAST_MINUTE_SECTION_KEY}::${personKey}`, packed)
                continue
            }
            if (item.communal) {
                count(`${SHARED_SECTION_KEY}::${category}`, packed)
                count(`${category}::${SHARED_SECTION_KEY}`, packed)
                continue
            }
            count(`${item.personName}::${category}`, packed)
            count(`${category}::${item.personName || UNASSIGNED_LABEL}`, packed)
        }
        return stats
    }, [listItems, watchedItems])

    // Which top-level sections have nothing left to pack, keyed the way the
    // active view keys them. Sorted so the value is stable enough to compare.
    const completeSectionKeys = useMemo(() => {
        const stats = viewMode === 'person' ? sectionStats : categoryStats
        return Object.entries(stats)
            .filter(([, sectionStat]) => isSectionComplete(sectionStat))
            .map(([key]) => key)
            .sort()
    }, [viewMode, sectionStats, categoryStats])
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
        if (listSeenBefore || hasSeededFoldRef.current || !listItems) return
        if (listItems.length <= FOLD_ON_OPEN_MIN_ITEMS) return

        // Keyed the way the view the list is about to open in keys them —
        // folding people away while the page is showing categories folds
        // nothing at all.
        const sectionKeys = new Set(listItems.map(item => viewMode === 'category'
            ? (item.lastMinute ? LAST_MINUTE_SECTION_KEY : (item.category ?? UNCATEGORISED_LABEL))
            : personViewSectionKey(item)))
        // Guests with nothing in them yet still have a card to fold
        if (viewMode === 'person') {
            for (const guest of packingList?.guests ?? []) sectionKeys.add(guest.name)
        }
        // Nothing to fold *into* — one long section stays open, since folding it
        // would leave the user looking at a single closed box.
        if (sectionKeys.size < 2) return

        hasSeededFoldRef.current = true
        setCollapsedSections(prev => new Set([...prev, ...sectionKeys]))
        setFoldedOnOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewMode is read once, when the list first opens
    }, [listSeenBefore, listItems, packingList?.guests])

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

    const guestNames = new Set((packingList.guests ?? []).map(g => g.name))
    const personIdByName = new Map(peopleOptions.map(person => [person.name, person.id]))
    // Only worth offering a section picker once the list has sections to pick.
    const sectionChoices = categoryOptions.length > 1 ? categoryOptions : undefined
    // A section's card asks who an item is for, and "the whole group" is one of
    // the answers — it is how a shared item gets added in question view, where
    // there is no shared card to type into. Last, so the picker still opens on a
    // person: most items are somebody's.
    const sectionPeopleChoices: PersonOption[] = [...peopleOptions, { name: SHARED_GROUP_LABEL, id: '', communal: true }]

    // Build grouped item map, seeding guest names so their sections exist even when empty
    const groupedItems: Record<string, PackingListItem[]> = {}
    for (const guest of (packingList.guests ?? [])) groupedItems[guest.name] = []
    // Seed fully packed people too, so finishing someone off leaves a celebration
    // behind rather than silently removing their card along with their last item.
    for (const [name, stats] of Object.entries(sectionStats)) {
        if (name === SHARED_SECTION_KEY || name === LAST_MINUTE_SECTION_KEY) continue
        if (isSectionComplete(stats)) groupedItems[name] ??= []
    }
    for (const item of filteredItems) {
        if (item.communal || item.lastMinute) continue
        if (!groupedItems[item.personName]) groupedItems[item.personName] = []
        groupedItems[item.personName].push(item)
    }

    // Person view gives communal items a card of their own, first, because they
    // are the one part of the list that is nobody's. Question view has no use
    // for it: there the sections are the question set's, and a shared item
    // belongs to its section as much as anyone's does — see below.
    const hasCommunalItems = packingList.items.some(i => i.communal && !i.lastMinute)
    const visibleCommunalItems = filteredItems.filter(i => i.communal && !i.lastMinute)
    // Like person sections, the shared section disappears when all its items are
    // packed and packed items are hidden.
    const sharedSections: ListSection[] = (visibleCommunalItems.length > 0 || showSharedSection || isSectionComplete(sectionStats[SHARED_SECTION_KEY]))
        ? [{
            key: SHARED_SECTION_KEY,
            title: 'Shared Items',
            name: '',
            communal: true,
            items: visibleCommunalItems,
        }]
        : []

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
            // Person view reads the filtered items directly; the grid takes all
            // of them and decides row by row what to show — see below.
            items: filteredItems.filter(i => i.lastMinute),
            ...(viewMode === 'category'
                ? { rows: buildCategoryRows(lastMinuteItems, gridColumns) }
                : {}),
        }]
        : []

    let listSections: ListSection[]
    if (viewMode === 'person') {
        // Regular people (from question set) alphabetically, then guests in add-order
        const regularSections: ListSection[] = Object.entries(groupedItems)
            .filter(([name]) => !guestNames.has(name))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, items]) => ({ key: name, title: `${name}'s Items`, name, items }))
        const guestSections: ListSection[] = (packingList.guests ?? [])
            .map(g => ({
                key: g.name,
                title: `${g.name}'s Items`,
                name: g.name,
                guestId: g.id,
                items: groupedItems[g.name] ?? [],
            }))
        listSections = [...sharedSections, ...regularSections, ...guestSections, ...lastMinuteSections]
    } else {
        // Communal items are filed by category here, same as everyone else's —
        // they sit among the rows of the section they belong to rather than in a
        // card of their own.
        //
        // Every item goes into the grid, packed ones included: a cell that
        // disappeared when it was ticked would leave a gap indistinguishable
        // from a person who never needed the item, and telling those two apart
        // is the whole of what the grid is for. Hiding what's packed is decided
        // a row at a time, inside the grid.
        const categorySections: ListSection[] = groupByCategory(packingList.items.filter(i => !i.lastMinute), sectionOrder)
            .map(({ label, items }) => ({
                key: label,
                title: label,
                name: '',
                items,
                isCategory: true,
                rows: buildCategoryRows(items, gridColumns),
            }))
        listSections = [...categorySections, ...lastMinuteSections]
    }

    // How much of the list the grid is holding back: the items on rows where
    // every cell is already packed, which are the only ones it hides.
    const hiddenGridItemCount = showPacked || viewMode === 'person'
        ? 0
        : listSections.reduce((count, section) => count + (section.rows ?? []).reduce(
            (rowCount, row) =>
                rowCount + (row.items.length > 0 && row.items.every(item => watchedItems[item.id]) ? row.items.length : 0),
            0,
        ), 0)

    // What the banner offers to bring back has to be what is actually missing.
    // Person view hides every packed item; category view hides a row only once
    // every cell on it is packed, so most of a half-packed list is still on
    // screen and counting all of it would send the user looking for items that
    // are right in front of them.
    const hiddenPackedCount = showPacked
        ? 0
        : viewMode === 'person'
            ? packingList.items.filter(item => watchedItems[item.id]).length
            : hiddenGridItemCount

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
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <h1 className="text-xl font-bold text-gray-900 truncate">{packingList.name}</h1>
                        {foreignPodUrl && (
                            <span className="text-xs font-medium text-blue-700 bg-blue-100 border border-blue-200 rounded-full px-2 py-0.5 shrink-0">
                                Shared list
                            </span>
                        )}
                        {isLoggedIn && syncingFromPod && (
                            <span className="text-xs text-blue-600 shrink-0">Syncing…</span>
                        )}
                        <div className={`flex items-center gap-1 transition-opacity duration-200 shrink-0 ${autoSaveStatus === 'idle' ? 'opacity-0' : 'opacity-100'}`}>
                            {autoSaveStatus === 'saving' && <span className="text-xs text-blue-500">Saving…</span>}
                            {autoSaveStatus === 'saved' && <span className="text-xs text-green-600">Saved</span>}
                            {autoSaveStatus === 'error' && <span className="text-xs text-red-600">Error saving</span>}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* The reveal opens an empty shared *card*, which only
                            person view has — category view offers "Shared" in
                            each section's who-for picker instead. */}
                        {!foreignPodUrl && viewMode === 'person' && !hasCommunalItems && !showSharedSection && (
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setShowSharedSection(true)}
                            >
                                + Add Shared Items
                            </Button>
                        )}
                        {!foreignPodUrl && (
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => { setShowAddGuest(v => !v); setNewGuestName('') }}
                            >
                                + Add Guest
                            </Button>
                        )}
                        {!foreignPodUrl && hasQuestionSet && (
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleOpenQuestionUpdate}
                            >
                                Update from questions
                            </Button>
                        )}
                        {!foreignPodUrl && (
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => isLoggedIn ? setShareModalOpen(true) : setSignInToSharePromptOpen(true)}
                                disabled={isLoggedIn && !ownPodUrl}
                            >
                                Share
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => navigate(backPath)}
                        >
                            Back to Lists
                        </Button>
                    </div>
                </div>
                {(packingList.destination || tripDates) && (
                    <div
                        data-testid="trip-details"
                        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600"
                    >
                        {packingList.destination && <span>📍 {packingList.destination}</span>}
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
                <div className="w-full max-w-screen-2xl mb-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                    <p className="text-sm text-indigo-800 font-medium">
                        👤 Viewing a list from <span className="font-semibold">{resolveOwnerDisplayName(ownerDisplayName, effectiveOwnerWebId, foreignPodUrl)}</span>
                    </p>
                </div>
            )}

            {/* Slim sticky progress strip */}
            <div className="sticky top-0 z-50 w-full mb-4 flex justify-center">
                <div className="w-full max-w-screen-2xl">
                    <div className="backdrop-blur-md bg-white/90 border border-gray-200 shadow-sm rounded-lg px-4 py-2">
                        {/* Counts and bar share a line with the controls where there is
                            room; at 390px the controls drop to a line of their own
                            rather than squeezing everything into wrapped fragments. */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span className={`text-sm font-medium whitespace-nowrap ${allPacked ? 'text-emerald-600' : 'text-gray-600'}`}>
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
                                    className="flex-1 min-w-8 bg-gray-200 rounded-full h-1.5 overflow-hidden"
                                >
                                    <div
                                        data-testid="packing-progress-fill"
                                        className={`progress-bar-fill h-full rounded-full ${allPacked ? 'bg-emerald-500' : 'bg-gradient-primary'}`}
                                        style={{ width: `${progressWidth}%` }}
                                    ></div>
                                </div>
                                {milestoneMessage && (
                                    <span data-testid="progress-milestone" className="text-xs font-semibold text-primary-700 whitespace-nowrap">
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
                                        className="shrink-0 flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                                    >
                                        {/* Same glyph the section headers use for the same
                                            state, so the toolbar and the cards never point
                                            opposite ways at each other. */}
                                        <span aria-hidden="true" className="text-xs text-gray-400">{everySectionFolded ? '▶' : '▼'}</span>
                                        {/* The word "all" is what tips this row onto a second
                                            line on a phone, and the icon already says it. */}
                                        {everySectionFolded ? (isDesktop ? 'Expand all' : 'Expand') : (isDesktop ? 'Collapse all' : 'Collapse')}
                                    </button>
                                )}
                                {/* "View" is what the group is labelled; repeating it in both
                                    buttons is what pushes this row off a 390px screen. The
                                    accessible name keeps the full wording either way. */}
                                <div className="flex shrink-0 items-center rounded-md border border-gray-300 overflow-hidden" role="group" aria-label="View mode">
                                    <button
                                        type="button"
                                        aria-pressed={viewMode === 'person'}
                                        aria-label="Person View"
                                        onClick={() => setViewMode('person')}
                                        className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${viewMode === 'person' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        {isDesktop ? 'Person View' : 'Person'}
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={viewMode === 'category'}
                                        aria-label="Category View"
                                        onClick={() => setViewMode('category')}
                                        className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors border-l border-gray-300 ${viewMode === 'category' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        {isDesktop ? 'Category View' : 'Category'}
                                    </button>
                                </div>
                                <Button
                                    type="button"
                                    variant={hiddenPackedCount > 0 ? 'primary' : 'secondary'}
                                    onClick={() => setShowPacked(!showPacked)}
                                >
                                    {showPacked ? 'Hide Packed' : 'Show Packed'}
                                </Button>
                            </div>
                        </div>
                        {/* Which coloured initial is whose, written once and kept
                            in view rather than repeated on every card — a key is
                            only any use while you are looking at the thing it
                            explains. Nothing here is pressable: the one thing it
                            could do is pack somebody's whole category on a stray
                            tap, and person view has a button that says so. */}
                        {viewMode === 'category' && gridColumns.length > 0 && (
                            <div
                                data-testid="people-key"
                                className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-1.5"
                            >
                                {gridColumns.map(column => (
                                    <span key={column.key} className="flex items-center gap-1 text-[11px] font-medium text-gray-600">
                                        {!column.unassigned && (
                                            <PersonAvatar
                                                name={column.name}
                                                color={personColor({ id: column.personId, name: column.name })}
                                                size="sm"
                                            />
                                        )}
                                        {column.name}
                                    </span>
                                ))}
                            </div>
                        )}
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
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                        <p className="text-sm text-blue-800">
                            A long list, so all {listSections.length} sections start folded — tap any heading to open one.
                        </p>
                        <button
                            type="button"
                            onClick={toggleAllSections}
                            className="shrink-0 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
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
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <p className="text-sm text-amber-800">
                            {hiddenPackedCount} packed item{hiddenPackedCount !== 1 ? 's' : ''} hidden — tap <strong>Show Packed</strong> to see them.
                        </p>
                    </div>
                </div>
            )}

            {/* Main content */}
            <div className="w-full">
                {/* Add Guest inline form — appears just above the grid */}
                {showAddGuest && (
                    <div className="mb-4 flex gap-2 max-w-sm">
                        <input
                            type="text"
                            value={newGuestName}
                            onChange={(e) => setNewGuestName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleAddGuest() }
                                if (e.key === 'Escape') { setShowAddGuest(false); setNewGuestName('') }
                            }}
                            placeholder="Guest name..."
                            autoFocus
                            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button
                            type="button"
                            onClick={handleAddGuest}
                            className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                            Add
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowAddGuest(false); setNewGuestName('') }}
                            className="shrink-0 px-3 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                )}
                <div>
                    {/* Once everything is packed the cards hold nothing but empty
                        celebrations, so they fold away and leave the banner as the
                        last thing standing — the fold itself is the celebration.
                        Showing packed items brings them straight back. */}
                    {/* Person view's cards are narrow and ragged, so they flow
                        into masonry columns. A grid card is a table that has to
                        be read across, so category view stacks them instead —
                        two abreast once there is room for two tables. */}
                    {!sectionsPackedAway && <div
                        className={`${sectionsExiting ? 'sections-packing-away' : ''} ${viewMode === 'category' ? 'grid grid-cols-1 items-start gap-4 xl:grid-cols-2' : ''}`}
                        style={viewMode === 'category' ? undefined : { columnWidth: '300px', columnGap: '1rem' }}
                    >
                        {listSections.map((section) => {
                            const { key: sectionKey, title, items, guestId } = section
                            const isCategorySection = section.isCategory === true
                            const stats = isCategorySection
                                ? (categoryStats[sectionKey] ?? { packed: 0, total: 0 })
                                : (sectionStats[sectionKey] ?? { packed: 0, total: 0 })
                            const isGuest = guestId !== undefined
                            const isShared = section.communal === true
                            const isLastMinute = section.lastMinute === true
                            const isComplete = isSectionComplete(stats)
                            const completeLabel = isShared ? 'shared items' : (isCategorySection || isLastMinute) ? title : section.name
                            const collapseLabelTarget = isShared ? 'the shared items' : isLastMinute ? 'the last minute items' : isCategorySection ? title : `${section.name}'s`
                            // The last minute card holds everybody's, so it groups
                            // by person the way a category card does.
                            // Category view arranges a section as a grid; person
                            // view still folds each card into groups, and so does
                            // the last minute card while it is being read by
                            // person.
                            const isGridSection = viewMode === 'category' && (isCategorySection || isLastMinute)
                            const innerGroups: ItemGroup[] = isGridSection
                                ? []
                                : (isCategorySection || isLastMinute)
                                    ? groupByPerson(items)
                                    : groupByCategory(items, sectionOrder).map(({ label, items: groupItems }) => ({ key: label, label, items: groupItems }))
                            const isSectionCollapsed = collapsedSections.has(sectionKey)
                            // Only a card that belongs to one person can wear
                            // their colour: a category card holds everybody's.
                            const sectionPersonColor = (isShared || isCategorySection || isLastMinute)
                                ? undefined
                                : personColor({ id: guestId ?? personIdByName.get(section.name) ?? '', name: section.name })
                            const sectionBorder = isComplete
                                ? 'border-emerald-300 bg-emerald-50'
                                // Amber, because the card is a reminder rather than
                                // a pile: nothing in it can be dealt with yet.
                                : isLastMinute
                                    ? 'border-amber-300 bg-amber-50'
                                    : `bg-white ${sectionPersonColor?.border ?? (isShared ? 'border-blue-200' : 'border-gray-200')}`
                            return (
                            <div key={sectionKey} data-testid="list-section" className={`border rounded-lg p-3 shadow-sm transition-colors duration-300 sm:p-4 ${viewMode === 'category' ? '' : 'mb-4'} ${sectionBorder}`} style={{ breakInside: 'avoid' }}>
                                {/* The rule under the heading separates it from the items
                                    below; a folded card has none, so it would just be a
                                    line ruling off empty space. */}
                                <div className={isSectionCollapsed ? undefined : 'mb-4 pb-2 border-b border-gray-200'}>
                                    <div className="flex flex-wrap items-center gap-1 min-h-[2rem]">
                                        {isGuest && renamingGuestId === guestId ? (
                                            <>
                                                <span className="text-sm text-gray-400 px-1" aria-hidden>▼</span>
                                                <input
                                                    type="text"
                                                    value={renamingGuestName}
                                                    onChange={(e) => setRenamingGuestName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') { e.preventDefault(); handleRenameGuest(guestId, renamingGuestName) }
                                                        if (e.key === 'Escape') { setRenamingGuestId(null); setRenamingGuestName('') }
                                                    }}
                                                    onBlur={() => handleRenameGuest(guestId, renamingGuestName)}
                                                    autoFocus
                                                    className="flex-1 px-2 py-1 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold text-gray-800"
                                                />
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                aria-label={`${isSectionCollapsed ? 'Expand' : 'Collapse'} ${collapseLabelTarget} list`}
                                                onClick={() => toggleSection(sectionKey)}
                                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                            >
                                                <span className="shrink-0 text-sm text-gray-400">{isSectionCollapsed ? '▶' : '▼'}</span>
                                                {sectionPersonColor && (
                                                    <PersonAvatar name={section.name} color={sectionPersonColor} />
                                                )}
                                                <span className="text-xl font-semibold text-gray-800">{title}</span>
                                                {/* Never let a count break across lines — "9 /" above "9" is
                                                    a fraction the eye has to reassemble. */}
                                                <span className="ml-1 shrink-0 whitespace-nowrap text-sm font-normal text-gray-500">{stats.packed} / {stats.total}</span>
                                            </button>
                                        )}
                                        {isComplete && (
                                            <span
                                                aria-label={`All packed for ${completeLabel}`}
                                                className="animate-pop-in text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5 shrink-0"
                                            >
                                                🎉 All packed!
                                            </span>
                                        )}
                                        {isShared && (
                                            <span className="text-xs font-medium text-blue-700 bg-blue-100 rounded-full px-2 py-0.5 shrink-0" title="Packed once for the whole group">
                                                👥 For everyone
                                            </span>
                                        )}
                                        {isGuest && renamingGuestId !== guestId && (
                                            <>
                                                <span className="text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 shrink-0">Guest</span>
                                                <button
                                                    type="button"
                                                    aria-label={`Rename ${section.name}`}
                                                    onClick={() => { setRenamingGuestId(guestId); setRenamingGuestName(section.name) }}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${section.name}`}
                                                    onClick={() => setGuestToRemove(guestId)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {!isSectionCollapsed && <div>
                                    {/* The card is the only one whose items can't be dealt with
                                        yet, so it says why rather than leaving that to the name. */}
                                    {isLastMinute && (
                                        <p className="-mt-2 mb-3 text-sm text-amber-800">{LAST_MINUTE_HINT}</p>
                                    )}
                                    {/* Every card can be typed into directly. What varies is which
                                        part of the target the card already knows: a person's card
                                        knows who, and asks which section; a section's card knows
                                        which section, and asks who. */}
                                    <div className="mb-4 pb-4 border-b border-gray-200">
                                        <AddItemComposer
                                            personName={(isCategorySection || isLastMinute) ? '' : section.name}
                                            personId={(isCategorySection || isLastMinute) ? '' : (guestId ?? personIdByName.get(section.name) ?? '')}
                                            communal={section.communal}
                                            category={isCategorySection ? categoryFromLabel(title) : undefined}
                                            lastMinute={isLastMinute}
                                            categoryOptions={(isCategorySection || isLastMinute) ? undefined : sectionChoices}
                                            peopleOptions={(isCategorySection || isLastMinute) ? sectionPeopleChoices : undefined}
                                            suggestions={suggestionIndex}
                                            targetLabel={isShared ? 'shared items' : isLastMinute ? 'last minute items' : isCategorySection ? title : `${section.name}'s items`}
                                            onAdd={handleComposerAdd}
                                        />
                                    </div>
                                    {isComplete && items.length === 0 && !isGridSection && (
                                        <p className="text-sm font-medium text-emerald-700">
                                            Nothing left to pack 🎒
                                        </p>
                                    )}
                                    {isGridSection && (
                                        <CategoryItemGrid
                                            columns={gridColumns}
                                            rows={section.rows ?? []}
                                            personColor={personColor}
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
                                    {!isGridSection && innerGroups.map(({ key: groupKey, label, items: catItems, communal: isSharedGroup }) => {
                                        const categoryKey = `${sectionKey}::${groupKey}`
                                        const isCollapsed = collapsedGroups.has(categoryKey)
                                        // Counted over every item in the group, not the ones on
                                        // screen: with packed items hidden, "2" next to a group
                                        // seven-ninths done reads as a group barely started.
                                        const groupStat = groupStats[categoryKey] ?? { packed: catItems.length, total: catItems.length }
                                        // Both views end up describing the same place; only which
                                        // half the card supplies changes.
                                        const groupLabel = (isCategorySection || isLastMinute)
                                            ? `${title} for ${isSharedGroup ? 'shared items' : label}`
                                            : `${label} for ${isShared ? 'shared items' : section.name}`
                                        const groupTarget: AddItemTarget = (isCategorySection || isLastMinute)
                                            ? {
                                                personName: isSharedGroup ? '' : label,
                                                personId: isSharedGroup ? '' : (personIdByName.get(label) ?? ''),
                                                communal: isSharedGroup,
                                                // A last minute item's section is
                                                // the last minute card itself.
                                                ...(isLastMinute
                                                    ? { lastMinute: true }
                                                    : { category: categoryFromLabel(title) }),
                                            }
                                            : {
                                                personName: section.name,
                                                personId: guestId ?? personIdByName.get(section.name) ?? '',
                                                communal: section.communal,
                                                category: categoryFromLabel(label),
                                            }
                                        const composerOpen = openComposerKey === categoryKey
                                        return (
                                            <div key={categoryKey} className="mb-3">
                                                <div className="flex items-center justify-between gap-2 py-1 mb-1">
                                                    <button
                                                        type="button"
                                                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${label}`}
                                                        onClick={() => toggleGroup(categoryKey)}
                                                        className="flex items-center gap-1 text-left text-sm font-semibold text-gray-600 hover:text-gray-900"
                                                    >
                                                        <span>{isCollapsed ? '▶' : '▼'}</span>
                                                        {/* A category card's groups are people, so each one
                                                            gets the same mark its owner's card would have.
                                                            The catch-all and shared groups are nobody's —
                                                            the shared one says so instead. */}
                                                        {isSharedGroup && (
                                                            <span aria-hidden title="Packed once for the whole group">👥</span>
                                                        )}
                                                        {(isCategorySection || isLastMinute) && !isSharedGroup && label !== UNASSIGNED_LABEL && (
                                                            <PersonAvatar
                                                                name={label}
                                                                color={personColor({ id: personIdByName.get(label) ?? '', name: label })}
                                                                size="sm"
                                                            />
                                                        )}
                                                        <span>{label}</span>
                                                        <span className="ml-1 shrink-0 whitespace-nowrap text-xs font-normal text-gray-400">{groupStat.packed} / {groupStat.total}</span>
                                                    </button>
                                                    {!isCollapsed && (
                                                        <div className="flex shrink-0 items-center gap-2">
                                                            {/* Adding straight into a group is the whole point: the
                                                                item lands where it was typed instead of falling
                                                                into the catch-all section. */}
                                                            <button
                                                                type="button"
                                                                aria-label={`Add item to ${groupLabel}`}
                                                                aria-expanded={composerOpen}
                                                                onClick={() => setOpenComposerKey(composerOpen ? null : categoryKey)}
                                                                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${composerOpen ? 'border-blue-300 bg-blue-100 text-blue-800' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                                                            >
                                                                {/* A section name is what the heading is for; on a
                                                                    phone the word "Add" is what pushes it off. */}
                                                                {isDesktop ? '+ Add' : '+'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                aria-label="Check all"
                                                                onClick={() => handleCheckAll(catItems)}
                                                                className="text-xs text-blue-600 hover:text-blue-800"
                                                            >
                                                                Check all
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                {!isCollapsed && composerOpen && (
                                                    <div className="mb-2">
                                                        <AddItemComposer
                                                            personName={groupTarget.personName}
                                                            personId={groupTarget.personId}
                                                            communal={groupTarget.communal}
                                                            category={groupTarget.category}
                                                            lastMinute={groupTarget.lastMinute}
                                                            suggestions={suggestionIndex}
                                                            targetLabel={groupLabel}
                                                            placeholder={`Add to ${label}...`}
                                                            onAdd={handleComposerAdd}
                                                            onClose={closeComposer}
                                                            autoFocus
                                                        />
                                                    </div>
                                                )}
                                                {!isCollapsed && (
                                                    <div className="space-y-2">
                                                        {catItems.map((item) => (
                                                            <div
                                                                key={`${item.id}-${sectionKey}`}
                                                                data-testid={`item-row-${item.id}`}
                                                                ref={(el) => {
                                                                    if (el) itemRowRefs.current.set(item.id, el)
                                                                    else itemRowRefs.current.delete(item.id)
                                                                }}
                                                                className={`relative rounded-lg p-3 transition-colors duration-1000 ${item.id === highlightedItem?.id ? 'bg-green-100 ring-2 ring-green-400' : 'bg-gray-50'} ${item.id === flourish?.itemId ? 'item-row-packed' : ''}`}
                                                            >
                                                                {item.id === flourish?.itemId && (
                                                                    <span
                                                                        key={flourish.nonce}
                                                                        data-testid={`item-tick-${item.id}`}
                                                                        aria-hidden="true"
                                                                        // Themed green rather than text-green-600 — that class is the
                                                                        // "Saved" indicator's, and the e2e suite waits on it by selector
                                                                        // Anchored over the checkbox; the animation owns the transform,
                                                                        // so no translate utilities here. Themed green rather than
                                                                        // text-green-600 — that class belongs to the "Saved" indicator,
                                                                        // which the e2e suite waits on by selector.
                                                                        className="item-packed-tick pointer-events-none absolute left-[22px] top-1/2 z-10 text-xl font-bold text-success-600"
                                                                    >
                                                                        ✓
                                                                    </span>
                                                                )}
                                                                <div className="flex items-center justify-between">
                                                                    <label className="flex items-center space-x-3 cursor-pointer flex-1 min-w-0">
                                                                        <input
                                                                            type="checkbox"
                                                                            {...register(`items.${item.id}`, {
                                                                                onChange: (e) => handleItemToggle(item.id, e.target.checked),
                                                                            })}
                                                                            className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                        />
                                                                        {editingItemId === item.id ? (
                                                                            <span
                                                                                className="flex items-center gap-1 flex-1 min-w-0"
                                                                                onBlur={(e) => {
                                                                                    // Only save when focus leaves both the name and quantity inputs
                                                                                    if (!e.currentTarget.contains(e.relatedTarget)) handleSaveEdit(item.id)
                                                                                }}
                                                                            >
                                                                                <input
                                                                                    type="text"
                                                                                    value={editingItemText}
                                                                                    onChange={(e) => setEditingItemText(e.target.value)}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(item.id) }
                                                                                        if (e.key === 'Escape') { e.preventDefault(); handleCancelEdit() }
                                                                                    }}
                                                                                    autoFocus
                                                                                    aria-label="Edit item name"
                                                                                    className="flex-1 min-w-0 px-2 py-1 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-700"
                                                                                />
                                                                                <input
                                                                                    type="number"
                                                                                    min={1}
                                                                                    value={editingItemQuantity}
                                                                                    onChange={(e) => setEditingItemQuantity(e.target.value)}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(item.id) }
                                                                                        if (e.key === 'Escape') { e.preventDefault(); handleCancelEdit() }
                                                                                    }}
                                                                                    placeholder="Qty"
                                                                                    aria-label="Edit item quantity"
                                                                                    title="How many to pack (leave blank for no quantity)"
                                                                                    className="w-12 sm:w-16 shrink-0 px-1.5 sm:px-2 py-1 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-700"
                                                                                />
                                                                            </span>
                                                                        ) : (
                                                                            <span
                                                                                className={watchedItems[item.id] ? 'text-gray-400 line-through' : 'text-gray-700'}
                                                                                onDoubleClick={() => handleStartEdit(item)}
                                                                            >
                                                                                {item.itemText}
                                                                                {item.quantity !== undefined && item.quantity > 1 && (
                                                                                    <span className="ml-1.5 text-xs font-semibold text-blue-700 bg-blue-100 rounded-full px-1.5 py-0.5 align-middle">
                                                                                        ×{item.quantity}
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        )}
                                                                    </label>
                                                                    {editingItemId !== item.id && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleToggleLastMinute(item)}
                                                                            aria-pressed={item.lastMinute === true}
                                                                            aria-label={item.lastMinute
                                                                                ? `Remove ${item.itemText} from the last minute items`
                                                                                : `Mark ${item.itemText} as a last minute item`}
                                                                            title={item.lastMinute
                                                                                ? 'Packed with everything else after all'
                                                                                : "Can't be packed until just before you go"}
                                                                            className={`ml-1 rounded-md p-1 transition-colors hover:bg-amber-50 hover:text-amber-600 ${item.lastMinute ? 'text-amber-600' : 'text-gray-400'}`}
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.5 2.5a1 1 0 101.414-1.414L11 9.586V6z" clipRule="evenodd" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                    {editingItemId !== item.id && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleStartEdit(item)}
                                                                            className="ml-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md p-1 transition-colors"
                                                                            title="Edit item"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                    {editingItemId !== item.id && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setItemToDelete(item.id)}
                                                                        className="ml-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md p-1 transition-colors"
                                                                        title="Delete item"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>}
                            </div>
                        )})}
                    </div>}
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
            personColor={personColor}
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
                    ? categoryFromLabel(openRowSection.title)
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
            isOpen={questionUpdateAdditions !== null}
            onClose={() => setQuestionUpdateAdditions(null)}
            additions={questionUpdateAdditions ?? []}
            onConfirm={handleConfirmQuestionUpdate}
        />
        </>
    )
}
