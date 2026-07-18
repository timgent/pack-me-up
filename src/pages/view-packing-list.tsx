import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDebouncedCallback } from 'use-debounce'
import { PackingList, PackingListItem } from '../create-packing-list/types'
import { useDatabase } from '../components/DatabaseContext'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { useForm, useWatch } from 'react-hook-form'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { reportError } from '../errorReporting'
import { usePodSync } from '../hooks/usePodSync'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'
import { POD_CONTAINERS, getPrimaryPodUrl, saveRdfToPod, resolveOwnerDisplayName, deriveWebIdFromPodUrl } from '../services/solidPod'
import { useOwnerDisplayName } from '../hooks/useOwnerDisplayName'
import { packingListToDataset, datasetToPackingList } from '../services/rdfSerialization'
import { SharePackingListModal } from '../components/SharePackingListModal'
import { useForeignPod } from '../components/ForeignPodContext'
import { useSharedListsSync } from '../hooks/useSharedListsSync'
import { mergePackingLists } from '../utils/mergePackingLists'

type FormData = {
    items: Record<string, boolean>
}

// Reserved section key for communal items — cannot collide with a person's
// name used as a key for the other sections.
const SHARED_SECTION_KEY = '__shared__'

interface ListSection {
    key: string
    title: string
    items: PackingListItem[]
    // Name used in aria-labels and guest actions; '' for the shared section
    name: string
    guestId?: string
    communal?: boolean
    // True for question-centric top-level sections (grouped by category rather than person)
    isCategory?: boolean
}

function groupByCategory(items: PackingListItem[]) {
    const map = new Map<string, PackingListItem[]>()
    for (const item of items) {
        const cat = item.category ?? 'Other'
        if (!map.has(cat)) map.set(cat, [])
        map.get(cat)!.push(item)
    }
    return [...map.entries()]
        .sort(([a], [b]) => {
            if (a === 'Essentials') return -1
            if (b === 'Essentials') return 1
            if (a === 'Other') return 1
            if (b === 'Other') return -1
            return a.localeCompare(b)
        })
        .map(([category, catItems]) => ({
            label: category,
            items: catItems.sort((a, b) => a.itemText.localeCompare(b.itemText)),
        }))
}

function groupByPerson(items: PackingListItem[]) {
    const map = new Map<string, PackingListItem[]>()
    for (const item of items) {
        const person = item.personName || 'Unassigned'
        if (!map.has(person)) map.set(person, [])
        map.get(person)!.push(item)
    }
    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([person, personItems]) => ({
            label: person,
            items: personItems.sort((a, b) => a.itemText.localeCompare(b.itemText)),
        }))
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
    const [shareModalOpen, setShareModalOpen] = useState(false)
    const [ownPodUrl, setOwnPodUrl] = useState<string | null>(null)
    // Tracks whether initial data has been loaded (local DB or pod).
    // Used to surface a real error to the user instead of hanging on "Loading…"
    // when a foreign-pod fetch fails.
    const hasLoadedRef = useRef(false)
    const [showPacked, setShowPacked] = useState(false)
    const [viewMode, setViewMode] = useState<'person' | 'question'>('person')
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({})
    const [itemToDelete, setItemToDelete] = useState<string | null>(null)
    const [editingItemId, setEditingItemId] = useState<string | null>(null)
    const [editingItemText, setEditingItemText] = useState<string>('')
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
    const [collapsedPersons, setCollapsedPersons] = useState<Set<string>>(new Set())
    const [showAddGuest, setShowAddGuest] = useState(false)
    // Reveals an empty Shared Items section on lists that have no communal
    // items yet; once an item is added the section persists from the data.
    const [showSharedSection, setShowSharedSection] = useState(false)
    const [newGuestName, setNewGuestName] = useState('')
    const [renamingGuestId, setRenamingGuestId] = useState<string | null>(null)
    const [renamingGuestName, setRenamingGuestName] = useState('')
    const [guestToRemove, setGuestToRemove] = useState<string | null>(null)
    const [recentlyAddedItemId, setRecentlyAddedItemId] = useState<string | null>(null)
    const itemRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())


    const toggleCategory = (key: string) =>
        setCollapsedCategories(prev => {
            const next = new Set(prev)
            if (next.has(key)) { next.delete(key) } else { next.add(key) }
            return next
        })

    const togglePerson = (personName: string) =>
        setCollapsedPersons(prev => {
            const next = new Set(prev)
            if (next.has(personName)) { next.delete(personName) } else { next.add(personName) }
            return next
        })

    const handleCheckAll = (items: PackingListItem[]) =>
        items.forEach(item => setValue(`items.${item.id}`, true))
    const { isLoggedIn, session } = useSolidPod()
    const { showToast } = useToast()
    const { db } = useDatabase()
    const { sharedListsWithMe, saveSharedListsWithMe } = useSharedListsSync()
    const effectiveOwnerWebId = ownerWebIdFromUrl ?? packingList?.ownerWebId
    const ownerDisplayName = useOwnerDisplayName(foreignPodUrl, effectiveOwnerWebId, session)

    useEffect(() => {
        if (isLoggedIn && session) {
            getPrimaryPodUrl(session).then(url => setOwnPodUrl(url ?? null))
        }
    }, [isLoggedIn, session])

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

    useEffect(() => {
        if (!recentlyAddedItemId) return
        itemRowRefs.current.get(recentlyAddedItemId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, [recentlyAddedItemId])

    const { register, setValue, getValues, control, reset } = useForm<FormData>({
        defaultValues: {
            items: {}
        }
    })

    // Use useWatch instead of watch() for proper re-renders on form changes
    const watchedItems = useWatch({ control, name: 'items', defaultValue: {} })

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
            reportError(error, 'Could not load shared list')
            showToast(`Could not load shared list: ${error}`, 'error')
        }
    }, [handleSyncError, foreignPodUrl, showToast])

    // Callback when save to Pod succeeds
    const handleSaveSuccess = useCallback(() => {
        console.log('Saved packing list to Pod successfully');
    }, []);

    // Callback when save to Pod fails
    const handleSaveError = useCallback((error: string) => {
        reportError(error, 'Save to Pod error');
        showToast(`Failed to save to Pod: ${error}`, 'error');
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
        enabled: isLoggedIn || !!foreignPodUrl, // Allow reading public shared lists without login
        onSyncSuccess: handleSyncSuccess,
        onSyncError: handleViewSyncError,
        onSaveSuccess: handleSaveSuccess,
        onSaveError: handleSaveError,
    });

    // Keep saveToPodRef in sync so useSyncCoordinator can push merge results back to pod
    useEffect(() => {
        saveToPodRef.current = saveToPod
    }, [saveToPod])

    useEffect(() => {
        const fetchPackingList = async () => {
            try {
                const doc = await db.getPackingList(id!)
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
                const isNotFound = typeof err === 'object' && err !== null && (err as { name?: string }).name === 'not_found'
                if (isNotFound && foreignPodUrl) {
                    // Leave isLoading=true — the first pod poll will hydrate via handleSyncSuccess
                } else {
                    reportError(err, 'Error fetching packing list')
                    setIsLoading(false)
                }
            }
        }

        fetchPackingList()
    }, [db, id, setValue, foreignPodUrl])

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

    const handleDeleteItem = async (itemId: string) => {
        if (!packingList) return

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
            setValue('items', currentFormValues)

            await persistPackingList(updatedPackingList)

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000)
        } catch (err) {
            reportError(err, 'Error deleting item')
            setAutoSaveStatus('error')
        }
    }

    const handleStartEdit = (item: PackingListItem) => {
        setEditingItemId(item.id)
        setEditingItemText(item.itemText)
    }

    const handleCancelEdit = () => {
        setEditingItemId(null)
        setEditingItemText('')
    }

    const handleSaveEdit = async (itemId: string) => {
        const trimmed = editingItemText.trim()
        if (!trimmed) {
            handleCancelEdit()
            return
        }
        if (!packingList) return

        try {
            setAutoSaveStatus('saving')

            const now = new Date().toISOString()
            const updatedItems = packingList.items.map(item =>
                item.id === itemId ? { ...item, itemText: trimmed, lastModified: now } : item
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
        }
    }

    const handleAddItem = async (inputKey: string, personName: string, guestId?: string, communal?: boolean) => {
        if (!packingList) return

        const newItemText = newItemInputs[inputKey]?.trim()
        if (!newItemText) return

        try {
            setAutoSaveStatus('saving')

            const newItem = {
                id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                itemText: newItemText,
                personName: communal ? '' : personName,
                personId: guestId ?? '',
                questionId: '',
                optionId: '',
                packed: false,
                ...(communal ? { communal: true } : {}),
                lastModified: new Date().toISOString(),
            }

            // Add to form values and clear the input before saving
            setValue(`items.${newItem.id}`, false)
            setNewItemInputs({ ...newItemInputs, [inputKey]: '' })

            // Make sure the category the new item lands in is expanded so it's
            // visible. New items have no category, so they land under "Other" —
            // keyed `${sectionKey}::Other` in person view and
            // `Other::${personName}` in question view.
            setCollapsedCategories(prev => {
                const sectionKey = inputKey.split('::add::')[0]
                const keysToExpand = [`${sectionKey}::Other`, `Other::${personName}`]
                if (!keysToExpand.some(k => prev.has(k))) return prev
                const next = new Set(prev)
                for (const k of keysToExpand) next.delete(k)
                return next
            })

            await persistPackingList({ ...packingList, items: [...packingList.items, newItem] })

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000)

            setRecentlyAddedItemId(newItem.id)
            setTimeout(() => setRecentlyAddedItemId(null), 2000)
        } catch (err) {
            reportError(err, 'Error adding item')
            setAutoSaveStatus('error')
        }
    }

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

    if (isLoading) {
        return <div className="max-w-4xl mx-auto py-8 px-4">Loading packing list...</div>
    }

    if (!packingList) {
        return <div className="max-w-4xl mx-auto py-8 px-4">Packing list not found</div>
    }

    const filteredItems = packingList.items.filter(item => {
        if (showPacked) {
            return true
        }
        return !watchedItems[item.id]
    })

    const hiddenPackedCount = !showPacked
        ? packingList.items.filter(item => watchedItems[item.id]).length
        : 0

    const totalCount = packingList.items.length
    const packedCount = packingList.items.filter(item => watchedItems[item.id]).length
    const percentComplete = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0
    const allPacked = totalCount > 0 && packedCount === totalCount

    const sectionStats = packingList.items.reduce((acc, item) => {
        const key = item.communal ? SHARED_SECTION_KEY : item.personName
        if (!acc[key]) acc[key] = { packed: 0, total: 0 }
        acc[key].total++
        if (watchedItems[item.id]) acc[key].packed++
        return acc
    }, {} as Record<string, { packed: number; total: number }>)

    // Stats per category, used by question-centric top-level sections
    const categoryStats = packingList.items.reduce((acc, item) => {
        if (item.communal) return acc
        const key = item.category ?? 'Other'
        if (!acc[key]) acc[key] = { packed: 0, total: 0 }
        acc[key].total++
        if (watchedItems[item.id]) acc[key].packed++
        return acc
    }, {} as Record<string, { packed: number; total: number }>)

    const guestNames = new Set((packingList.guests ?? []).map(g => g.name))
    const guestIdByName = new Map((packingList.guests ?? []).map(g => [g.name, g.id]))

    // Build grouped item map, seeding guest names so their sections exist even when empty
    const groupedItems: Record<string, PackingListItem[]> = {}
    for (const guest of (packingList.guests ?? [])) groupedItems[guest.name] = []
    for (const item of filteredItems) {
        if (item.communal) continue
        if (!groupedItems[item.personName]) groupedItems[item.personName] = []
        groupedItems[item.personName].push(item)
    }

    // Shared section first (when the list has visible communal items), then
    // either people (person-centric) or categories (question-centric). Like
    // person sections, the shared section disappears when all its items are
    // packed and packed items are hidden.
    const hasCommunalItems = packingList.items.some(i => i.communal)
    const visibleCommunalItems = filteredItems.filter(i => i.communal)
    const sharedSections: ListSection[] = (visibleCommunalItems.length > 0 || showSharedSection)
        ? [{
            key: SHARED_SECTION_KEY,
            title: 'Shared Items',
            name: '',
            communal: true,
            items: visibleCommunalItems,
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
        listSections = [...sharedSections, ...regularSections, ...guestSections]
    } else {
        const categorySections: ListSection[] = groupByCategory(filteredItems.filter(i => !i.communal))
            .map(({ label, items }) => ({ key: label, title: label, name: '', items, isCategory: true }))
        listSections = [...sharedSections, ...categorySections]
    }

    return (
        <>
        <div className="w-full flex flex-col items-center py-8 px-4">
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
                        {!foreignPodUrl && !hasCommunalItems && !showSharedSection && (
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
                        {isLoggedIn && !foreignPodUrl && (
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setShareModalOpen(true)}
                                disabled={!ownPodUrl}
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
            </div>

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
                    <div className="backdrop-blur-md bg-white/90 border border-gray-200 shadow-sm rounded-lg px-4 py-2 flex items-center justify-between gap-3">
                        <span className={`text-sm font-medium ${allPacked ? 'text-emerald-600' : 'text-gray-600'}`}>
                            {allPacked ? '🎉 All packed!' : `${packedCount} / ${totalCount} packed (${percentComplete}%)`}
                        </span>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center rounded-md border border-gray-300 overflow-hidden" role="group" aria-label="View mode">
                                <button
                                    type="button"
                                    aria-pressed={viewMode === 'person'}
                                    onClick={() => setViewMode('person')}
                                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === 'person' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Person View
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={viewMode === 'question'}
                                    onClick={() => setViewMode('question')}
                                    className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 ${viewMode === 'question' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Question View
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
                </div>
            </div>

            {/* All packed celebration banner */}
            {allPacked && (
                <div className="w-full max-w-screen-2xl mb-4 celebration-banner">
                    <div className="relative overflow-hidden rounded-xl px-6 py-6 text-center shadow-lg celebration-bg">
                        <span className="celebration-emoji" style={{ left: '4%', animationDelay: '0s' }}>🎊</span>
                        <span className="celebration-emoji" style={{ left: '12%', animationDelay: '0.5s' }}>✈️</span>
                        <span className="celebration-emoji" style={{ right: '12%', animationDelay: '0.8s' }}>🌍</span>
                        <span className="celebration-emoji" style={{ right: '4%', animationDelay: '0.3s' }}>🎉</span>
                        <div className="relative z-10">
                            <div className="text-4xl mb-2">🧳</div>
                            <p className="text-2xl font-bold text-white drop-shadow-sm">You're all packed!</p>
                            <p className="text-emerald-100 mt-1 text-sm font-medium">Everything's ready — time for adventure!</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden packed items banner */}
            {hiddenPackedCount > 0 && (
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
                    <div style={{ columnWidth: '300px', columnGap: '1rem' }}>
                        {listSections.map((section) => {
                            const { key: sectionKey, title, items, guestId } = section
                            const isCategorySection = section.isCategory === true
                            const stats = isCategorySection
                                ? (categoryStats[sectionKey] ?? { packed: 0, total: 0 })
                                : (sectionStats[sectionKey] ?? { packed: 0, total: 0 })
                            const isGuest = guestId !== undefined
                            const isShared = section.communal === true
                            const collapseLabelTarget = isShared ? 'the shared items' : isCategorySection ? title : `${section.name}'s`
                            const innerGroups = (isShared || !isCategorySection)
                                ? groupByCategory(items)
                                : groupByPerson(items)
                            return (
                            <div key={sectionKey} className={`border rounded-lg p-4 bg-white shadow-sm mb-4 ${isGuest ? 'border-amber-200' : isShared ? 'border-blue-200' : 'border-gray-200'}`} style={{ breakInside: 'avoid' }}>
                                <div className="mb-4 pb-2 border-b border-gray-200">
                                    <div className="flex items-center gap-1 min-h-[2rem]">
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
                                                aria-label={`${collapsedPersons.has(sectionKey) ? 'Expand' : 'Collapse'} ${collapseLabelTarget} list`}
                                                onClick={() => togglePerson(sectionKey)}
                                                className="flex items-center gap-2 flex-1 text-left"
                                            >
                                                <span className="text-sm text-gray-400">{collapsedPersons.has(sectionKey) ? '▶' : '▼'}</span>
                                                <span className="text-xl font-semibold text-gray-800">{title}</span>
                                                <span className="ml-1 text-sm font-normal text-gray-500">{stats.packed} / {stats.total}</span>
                                            </button>
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
                                {!collapsedPersons.has(sectionKey) && <div>
                                    {/* Add new item input — only shown when this section maps to a single person/guest */}
                                    {!isCategorySection && (
                                        <div className="mb-4 pb-4 border-b border-gray-200">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newItemInputs[sectionKey] || ''}
                                                    onChange={(e) => setNewItemInputs({ ...newItemInputs, [sectionKey]: e.target.value })}
                                                    onKeyPress={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault()
                                                            handleAddItem(sectionKey, section.name, section.guestId, section.communal)
                                                        }
                                                    }}
                                                    placeholder="Add new item..."
                                                    className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddItem(sectionKey, section.name, section.guestId, section.communal)}
                                                    className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {innerGroups.map(({ label, items: catItems }) => {
                                        const categoryKey = `${sectionKey}::${label}`
                                        const isCollapsed = collapsedCategories.has(categoryKey)
                                        const innerInputKey = `${sectionKey}::add::${label}`
                                        return (
                                            <div key={categoryKey} className="mb-3">
                                                <div className="flex items-center justify-between py-1 mb-1">
                                                    <button
                                                        type="button"
                                                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${label}`}
                                                        onClick={() => toggleCategory(categoryKey)}
                                                        className="flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"
                                                    >
                                                        <span>{isCollapsed ? '▶' : '▼'}</span>
                                                        <span>{label}</span>
                                                        <span className="text-xs font-normal text-gray-400 ml-1">({catItems.length})</span>
                                                    </button>
                                                    {!isCollapsed && (
                                                        <button
                                                            type="button"
                                                            aria-label="Check all"
                                                            onClick={() => handleCheckAll(catItems)}
                                                            className="text-xs text-blue-600 hover:text-blue-800"
                                                        >
                                                            Check all
                                                        </button>
                                                    )}
                                                </div>
                                                {!isCollapsed && isCategorySection && (
                                                    <div className="flex gap-2 mb-2">
                                                        <input
                                                            type="text"
                                                            value={newItemInputs[innerInputKey] || ''}
                                                            onChange={(e) => setNewItemInputs({ ...newItemInputs, [innerInputKey]: e.target.value })}
                                                            onKeyPress={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault()
                                                                    handleAddItem(innerInputKey, label, guestIdByName.get(label))
                                                                }
                                                            }}
                                                            placeholder={`Add item for ${label}...`}
                                                            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAddItem(innerInputKey, label, guestIdByName.get(label))}
                                                            className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                )}
                                                {!isCollapsed && (
                                                    <div className="space-y-2">
                                                        {catItems.map((item) => (
                                                            <div
                                                                key={`${item.id}-${sectionKey}`}
                                                                ref={(el) => {
                                                                    if (el) itemRowRefs.current.set(item.id, el)
                                                                    else itemRowRefs.current.delete(item.id)
                                                                }}
                                                                className={`rounded-lg p-3 transition-colors duration-1000 ${item.id === recentlyAddedItemId ? 'bg-green-100 ring-2 ring-green-400' : 'bg-gray-50'}`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <label className="flex items-center space-x-3 cursor-pointer flex-1">
                                                                        <input
                                                                            type="checkbox"
                                                                            {...register(`items.${item.id}`)}
                                                                            className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                        />
                                                                        {editingItemId === item.id ? (
                                                                            <input
                                                                                type="text"
                                                                                value={editingItemText}
                                                                                onChange={(e) => setEditingItemText(e.target.value)}
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(item.id) }
                                                                                    if (e.key === 'Escape') { e.preventDefault(); handleCancelEdit() }
                                                                                }}
                                                                                onBlur={() => handleSaveEdit(item.id)}
                                                                                autoFocus
                                                                                aria-label="Edit item name"
                                                                                className="flex-1 px-2 py-1 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-700"
                                                                            />
                                                                        ) : (
                                                                            <span
                                                                                className={watchedItems[item.id] ? 'text-gray-400 line-through' : 'text-gray-700'}
                                                                                onDoubleClick={() => handleStartEdit(item)}
                                                                            >
                                                                                {item.itemText}
                                                                            </span>
                                                                        )}
                                                                    </label>
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
                    </div>
                </div>
            </div>
        </div>
        <ConfirmationDialog
            isOpen={itemToDelete !== null}
            onClose={() => setItemToDelete(null)}
            onConfirm={() => { handleDeleteItem(itemToDelete!); setItemToDelete(null) }}
            title="Remove item"
            message="Are you sure you want to remove this item?"
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
        </>
    )
}
