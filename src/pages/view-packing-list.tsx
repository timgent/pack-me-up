import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDebouncedCallback } from 'use-debounce'
import { PackingList, PackingListItem } from '../create-packing-list/types'
import { useDatabase } from '../components/DatabaseContext'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { useForm, useWatch } from 'react-hook-form'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { usePodSync } from '../hooks/usePodSync'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'
import { POD_CONTAINERS } from '../services/solidPod'

type FormData = {
    items: Record<string, boolean>
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
            category,
            items: catItems.sort((a, b) => a.itemText.localeCompare(b.itemText)),
        }))
}


export function ViewPackingList() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [packingList, setPackingList] = useState<PackingList | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [showPacked, setShowPacked] = useState(false)
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({})
    const [itemToDelete, setItemToDelete] = useState<string | null>(null)
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

    const toggleCategory = (key: string) =>
        setCollapsedCategories(prev => {
            const next = new Set(prev)
            if (next.has(key)) { next.delete(key) } else { next.add(key) }
            return next
        })

    const handleCheckAll = (items: PackingListItem[]) =>
        items.forEach(item => setValue(`items.${item.id}`, true))
    const { isLoggedIn } = useSolidPod()
    const { showToast } = useToast()
    const { db } = useDatabase()

    const { register, setValue, getValues, control } = useForm<FormData>({
        defaultValues: {
            items: {}
        }
    })

    // Use useWatch instead of watch() for proper re-renders on form changes
    const watchedItems = useWatch({ control, name: 'items', defaultValue: {} })

    // Set up sync coordination (handles conflict resolution, focus preservation, etc.)
    const { syncingFromPod, handleSyncSuccess, handleSyncError, saveWithSyncPrevention } =
        useSyncCoordinator<PackingList>({
            currentData: packingList,
            saveToLocalDb: async (data) => {
                return await db.savePackingList(data);
            },
            updateFormAndState: (data, newRev) => {
                setPackingList({
                    ...data,
                    _rev: newRev
                });
                // Update form values
                const formValues: Record<string, boolean> = {};
                data.items.forEach((item) => {
                    formValues[item.id] = item.packed;
                });
                setValue('items', formValues);
            },
            conflictStrategy: 'fallback-to-pod', // Use same strategy as edit questions for consistency
        });

    // Callback when save to Pod succeeds
    const handleSaveSuccess = useCallback(() => {
        console.log('Saved packing list to Pod successfully');
    }, []);

    // Callback when save to Pod fails
    const handleSaveError = useCallback((error: string) => {
        console.error('Save to Pod error:', error);
        showToast(`Failed to save to Pod: ${error}`, 'error');
    }, [showToast]);

    // Set up automatic Pod sync with polling
    const { saveToPod } = usePodSync<PackingList>({
        pathConfig: {
            container: POD_CONTAINERS.PACKING_LISTS,
            filename: (id) => `${id}.json`,
            resourceId: id || null
        },
        pollInterval: 5000, // Poll every 5 seconds for faster sync
        enabled: isLoggedIn, // Only sync when logged in
        onSyncSuccess: handleSyncSuccess,
        onSyncError: handleSyncError,
        onSaveSuccess: handleSaveSuccess,
        onSaveError: handleSaveError,
    });

    useEffect(() => {
        const fetchPackingList = async () => {
            try {
                const doc = await db.getPackingList(id!)
                setPackingList(doc)
                // Initialize form values with a clean slate
                const initialValues: Record<string, boolean> = {}
                doc.items.forEach((item) => {
                    initialValues[item.id] = item.packed
                })
                setValue('items', initialValues)
            } catch (err) {
                console.error('Error fetching packing list:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchPackingList()
    }, [db, id, setValue])

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
            const updatedPackingList: PackingList = {
                ...packingList,
                items: packingList.items.map(item => ({
                    ...item,
                    packed: currentFormValues[item.id] ?? false
                }))
            }

            // Save with sync prevention (handles local DB + Pod save)
            if (isLoggedIn) {
                console.log('handleItemChange: Saving to local DB and Pod...')
                const savedPackingList = await saveWithSyncPrevention(updatedPackingList, saveToPod);
                if (savedPackingList) {
                    setPackingList(savedPackingList);
                    console.log('handleItemChange: Saved to local DB and Pod')
                }
            } else {
                // Not logged in, just save locally
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
                console.log('handleItemChange: Saved to local DB')
            }

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000) // Show "saved" for 2 seconds
        } catch (err) {
            console.error('handleItemChange: Error saving packing list:', err)
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

    const handleDeleteItem = async (itemId: string) => {
        if (!packingList) return

        try {
            setAutoSaveStatus('saving')

            // Remove the item from the packing list
            const updatedItems = packingList.items.filter(item => item.id !== itemId)
            const updatedPackingList: PackingList = {
                ...packingList,
                items: updatedItems
            }

            // Remove from form values
            const currentFormValues = getValues('items')
            delete currentFormValues[itemId]
            setValue('items', currentFormValues)

            // Save with sync prevention (handles local DB + Pod save)
            if (isLoggedIn) {
                const savedPackingList = await saveWithSyncPrevention(updatedPackingList, saveToPod);
                if (savedPackingList) {
                    setPackingList(savedPackingList);
                }
            } else {
                // Not logged in, just save locally
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
            }

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000)
        } catch (err) {
            console.error('Error deleting item:', err)
            setAutoSaveStatus('error')
        }
    }

    const handleAddItem = async (personName: string) => {
        if (!packingList) return

        const newItemText = newItemInputs[personName]?.trim()
        if (!newItemText) return

        try {
            setAutoSaveStatus('saving')

            // Create new item
            const newItem = {
                id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                itemText: newItemText,
                personName: personName,
                personId: '', // Manual items don't have a person ID from the question flow
                questionId: '', // Manual items don't have a question ID
                optionId: '', // Manual items don't have an option ID
                packed: false
            }

            // Add the item to the packing list
            const updatedItems = [...packingList.items, newItem]
            const updatedPackingList: PackingList = {
                ...packingList,
                items: updatedItems
            }

            // Add to form values
            setValue(`items.${newItem.id}`, false)

            // Clear the input
            setNewItemInputs({ ...newItemInputs, [personName]: '' })

            // Save with sync prevention (handles local DB + Pod save)
            if (isLoggedIn) {
                const savedPackingList = await saveWithSyncPrevention(updatedPackingList, saveToPod);
                if (savedPackingList) {
                    setPackingList(savedPackingList);
                }
            } else {
                // Not logged in, just save locally
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
            }

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000)
        } catch (err) {
            console.error('Error adding item:', err)
            setAutoSaveStatus('error')
        }
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

    const personStats = packingList.items.reduce((acc, item) => {
        if (!acc[item.personName]) acc[item.personName] = { packed: 0, total: 0 }
        acc[item.personName].total++
        if (watchedItems[item.id]) acc[item.personName].packed++
        return acc
    }, {} as Record<string, { packed: number; total: number }>)

    return (
        <>
        <div className="w-full flex flex-col items-center py-8 px-4">
            {/* Sticky top toolbar */}
            <div className="sticky top-0 z-50 w-full mb-6 flex justify-center">
                <div className="w-full max-w-screen-2xl">
                    <div className="backdrop-blur-md bg-white/90 border border-gray-200 shadow-lg rounded-xl px-4 py-3 relative">
                        {/* Sync indicator - absolutely positioned to avoid layout shift */}
                        {isLoggedIn && syncingFromPod && (
                            <div className="absolute top-2 right-2 z-10 bg-blue-50 border border-blue-200 rounded-md px-2 py-1 flex items-center gap-1.5 shadow-sm">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                <span className="text-xs text-blue-700 whitespace-nowrap">Syncing...</span>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold text-gray-900">{packingList.name}</h1>
                                <span className="text-sm text-gray-600 font-medium">
                                    {packedCount} / {totalCount} packed ({percentComplete}%)
                                </span>
                                {/* Always reserve space for auto-save status to prevent layout jump */}
                                <div className={`flex items-center space-x-2 min-w-[120px] transition-opacity duration-200 ${autoSaveStatus === 'idle' ? 'opacity-0' : 'opacity-100'}`}>
                                    {autoSaveStatus === 'saving' && (
                                        <>
                                            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                            <span className="text-sm text-blue-600">Auto-saving...</span>
                                        </>
                                    )}
                                    {autoSaveStatus === 'saved' && (
                                        <>
                                            <div className="h-4 w-4 text-green-500">✓</div>
                                            <span className="text-sm text-green-600">Saved</span>
                                        </>
                                    )}
                                    {autoSaveStatus === 'error' && (
                                        <>
                                            <div className="h-4 w-4 text-red-500">✗</div>
                                            <span className="text-sm text-red-600">Error</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant={hiddenPackedCount > 0 ? 'primary' : 'secondary'}
                                    onClick={() => setShowPacked(!showPacked)}
                                >
                                    {showPacked ? 'Hide Packed' : 'Show Packed'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => navigate('/view-lists')}
                                >
                                    Back to Lists
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
                <div>
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                        {Object.entries(
                            filteredItems.reduce((acc, item) => {
                                if (!acc[item.personName]) {
                                    acc[item.personName] = [];
                                }
                                acc[item.personName].push(item);
                                return acc;
                            }, {} as Record<string, typeof filteredItems>)
                        ).sort(([nameA], [nameB]) => nameA.localeCompare(nameB)).map(([personName, items]) => {
                            const stats = personStats[personName] ?? { packed: 0, total: 0 }
                            return (
                            <div key={personName} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">
                                    {personName}'s Items
                                    <span className="ml-2 text-sm font-normal text-gray-500">{stats.packed} / {stats.total}</span>
                                </h2>
                                <div>
                                    {groupByCategory(items).map(({ category, items: catItems }) => {
                                        const sectionKey = `${personName}::${category}`
                                        const isCollapsed = collapsedCategories.has(sectionKey)
                                        return (
                                            <div key={sectionKey} className="mb-3">
                                                <div className="flex items-center justify-between py-1 mb-1">
                                                    <button
                                                        type="button"
                                                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${category}`}
                                                        onClick={() => toggleCategory(sectionKey)}
                                                        className="flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"
                                                    >
                                                        <span>{isCollapsed ? '▶' : '▼'}</span>
                                                        <span>{category}</span>
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
                                                {!isCollapsed && (
                                                    <div className="space-y-2">
                                                        {catItems.map((item) => (
                                                            <div
                                                                key={`${item.id}-${personName}`}
                                                                className="bg-gray-50 rounded-lg p-3"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <label className="flex items-center space-x-3 cursor-pointer flex-1">
                                                                        <input
                                                                            type="checkbox"
                                                                            {...register(`items.${item.id}`)}
                                                                            className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                        />
                                                                        <span className={watchedItems[item.id] ? 'text-gray-400 line-through' : 'text-gray-700'}>
                                                                            {item.itemText}
                                                                        </span>
                                                                    </label>
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

                                    {/* Add new item input */}
                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newItemInputs[personName] || ''}
                                                onChange={(e) => setNewItemInputs({ ...newItemInputs, [personName]: e.target.value })}
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault()
                                                        handleAddItem(personName)
                                                    }
                                                }}
                                                placeholder="Add new item..."
                                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleAddItem(personName)}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
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
        </>
    )
}
