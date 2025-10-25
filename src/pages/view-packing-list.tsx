import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDebouncedCallback } from 'use-debounce'
import { PackingList } from '../create-packing-list/types'
import { packingAppDb } from '../services/database'
import { Button } from '../components/Button'
import { useForm } from 'react-hook-form'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { POD_ERROR_MESSAGES } from '../services/solidPod'
import { usePackingListSync } from '../hooks/usePackingListSync'

type FormData = {
    items: Record<string, boolean>
}


export function ViewPackingList() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [packingList, setPackingList] = useState<PackingList | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [showPacked, setShowPacked] = useState(false)
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({})
    const [syncingFromPod, setSyncingFromPod] = useState(false) // Only show when actively pulling newer data from Pod
    const { isLoggedIn } = useSolidPod()
    const { showToast } = useToast()

    // Track if we're currently handling a local change to prevent sync loops
    const isLocalChangeRef = useRef(false);
    const lastSyncedDataRef = useRef<string | null>(null);

    const { register, handleSubmit, setValue, watch, getValues } = useForm<FormData>({
        defaultValues: {
            items: {}
        }
    })

    const watchedItems = watch('items')

    // Memoize callbacks to prevent usePackingListSync from re-running unnecessarily
    const handleSyncSuccess = useCallback(async (data: PackingList) => {
        // Only update form if this isn't a local change we just made
        if (!isLocalChangeRef.current) {
            // Compare the incoming data with what we last synced
            const incomingDataString = JSON.stringify(data);

            // Only update if the data has actually changed AND is newer than our local version
            const syncedModifiedTime = data.lastModified ? new Date(data.lastModified).getTime() : 0;
            const localModifiedTime = packingList?.lastModified ? new Date(packingList.lastModified).getTime() : 0;

            if (lastSyncedDataRef.current !== incomingDataString) {
                // Only apply sync if the synced version is newer
                if (syncedModifiedTime > localModifiedTime) {
                    console.log('Synced packing list from Pod - newer version found, updating form');
                    setSyncingFromPod(true);

                    // Save the currently focused element
                    const activeElement = document.activeElement as HTMLElement;
                    const activeElementId = activeElement?.id;
                    const selectionStart = (activeElement as HTMLInputElement)?.selectionStart;
                    const selectionEnd = (activeElement as HTMLInputElement)?.selectionEnd;

                    try {
                        // Remove _rev to avoid conflicts with local database version
                        delete data._rev;

                        // Save to local database to get the proper _rev
                        const dbResult = await packingAppDb.savePackingList(data);

                        // Update the packing list state with synced data and new _rev
                        setPackingList({
                            ...data,
                            _rev: dbResult.rev
                        });

                        // Update form values
                        const formValues: Record<string, boolean> = {};
                        data.items.forEach((item) => {
                            formValues[item.id] = item.packed;
                        });
                        setValue('items', formValues);

                        lastSyncedDataRef.current = incomingDataString;

                        // Show sync indicator briefly
                        setTimeout(() => setSyncingFromPod(false), 2000);

                        // Restore focus after a brief delay to allow the DOM to update
                        setTimeout(() => {
                            if (activeElementId) {
                                const elementToFocus = document.getElementById(activeElementId) as HTMLInputElement;
                                if (elementToFocus) {
                                    elementToFocus.focus();
                                    if (selectionStart !== null && selectionEnd !== null) {
                                        elementToFocus.setSelectionRange(selectionStart, selectionEnd);
                                    }
                                }
                            }
                        }, 0);
                    } catch (err) {
                        console.error('Error saving synced data to local database:', err);
                        setSyncingFromPod(false);
                    }
                } else {
                    console.log('Synced packing list from Pod - local version is newer or same, keeping local');
                }
            } else {
                console.log('Synced packing list from Pod - no changes detected');
            }
        }
    }, [setValue, packingList]);

    const handleSyncError = useCallback((error: string) => {
        console.error('Sync error:', error);
        // Don't show toast for errors - too noisy for automatic sync
    }, []);

    const handleSaveSuccess = useCallback(() => {
        console.log('Saved packing list to Pod successfully');
        // Update the last synced data ref
        if (packingList) {
            lastSyncedDataRef.current = JSON.stringify(packingList);
        }
    }, [packingList]);

    const handleSaveError = useCallback((error: string) => {
        console.error('Save to Pod error:', error);
        showToast(`Failed to save to Pod: ${error}`, 'error');
    }, [showToast]);

    // Set up automatic Pod sync with polling
    const { saveToPod, syncFromPod } = usePackingListSync({
        packingListId: id || null,
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
                const doc = await packingAppDb.getPackingList(id!)
                setPackingList(doc)
                // Initialize form values with a clean slate
                const initialValues: Record<string, boolean> = {}
                doc.items.forEach((item) => {
                    initialValues[item.id] = item.packed
                })
                setValue('items', initialValues)
                // Initialize the lastSyncedDataRef with the loaded data
                lastSyncedDataRef.current = JSON.stringify(doc)
            } catch (err) {
                console.error('Error fetching packing list:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchPackingList()
    }, [id, setValue])

    const handleItemChange = useDebouncedCallback(async () => {
        try {
            setAutoSaveStatus('saving')
            const currentFormValues = getValues('items')
            const updatedPackingList: PackingList = {
                ...packingList!,
                items: packingList!.items.map(item => ({
                    ...item,
                    packed: currentFormValues[item.id] ?? false
                })),
                lastModified: new Date().toISOString() // Add timestamp for conflict resolution
            }
            const dbResult = await packingAppDb.savePackingList(updatedPackingList)
            const savedPackingList = {
                ...updatedPackingList,
                _rev: dbResult.rev
            }
            setPackingList(savedPackingList)

            // If logged in, also save to Pod automatically
            if (isLoggedIn) {
                isLocalChangeRef.current = true;
                await saveToPod(savedPackingList);
                // Reset the flag after a short delay to allow sync to complete
                setTimeout(() => {
                    isLocalChangeRef.current = false;
                }, 2000);
            }

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 2000) // Show "saved" for 2 seconds
        } catch (err) {
            console.error('Error saving packing list:', err)
            setAutoSaveStatus('error')
        }
    }, 800) // Reduced to 800ms for faster saves while still batching rapid changes

    // Trigger auto-save when form values change
    useEffect(() => {
        if (packingList) {
            handleItemChange()
        }
    }, [watchedItems, handleItemChange, packingList])

    const onSubmit = async (data: FormData) => {
        if (!packingList) return

        setIsSaving(true)
        try {
            const updatedPackingList = {
                ...packingList,
                items: packingList.items.map(item => ({
                    ...item,
                    packed: data.items[item.id] ?? false
                }))
            }
            await packingAppDb.savePackingList(updatedPackingList)
            navigate('/view-lists')
        } catch (err) {
            console.error('Error saving packing list:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleSaveToPod = async () => {
        if (!isLoggedIn) {
            showToast(POD_ERROR_MESSAGES.NOT_LOGGED_IN, 'error');
            return;
        }

        if (!packingList) return;

        try {
            isLocalChangeRef.current = true;
            await saveToPod(packingList);
            // Reset the flag after a short delay
            setTimeout(() => {
                isLocalChangeRef.current = false;
            }, 2000);
            showToast('Successfully saved packing list to Solid Pod!', 'success');
        } catch (error) {
            console.error('Error saving to pod:', error);
            showToast(POD_ERROR_MESSAGES.SAVE_FAILED, 'error');
        }
    };

    const handleLoadFromPod = async () => {
        if (!isLoggedIn) {
            showToast(POD_ERROR_MESSAGES.NOT_LOGGED_IN_LOAD, 'error');
            return;
        }

        try {
            // Force a manual sync - this will trigger onSyncSuccess which handles the update
            await syncFromPod();
            // Show success toast for manual sync only
            showToast('Packing list synced from Pod!', 'success');
        } catch (error) {
            console.error('Error loading from pod:', error);
            showToast(POD_ERROR_MESSAGES.LOAD_FAILED, 'error');
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        if (!packingList) return

        try {
            setAutoSaveStatus('saving')

            // Remove the item from the packing list
            const updatedItems = packingList.items.filter(item => item.id !== itemId)
            const updatedPackingList: PackingList = {
                ...packingList,
                items: updatedItems,
                lastModified: new Date().toISOString() // Add timestamp for conflict resolution
            }

            // Save to database
            const dbResult = await packingAppDb.savePackingList(updatedPackingList)

            // Update local state with new _rev
            const savedPackingList = {
                ...updatedPackingList,
                _rev: dbResult.rev
            }
            setPackingList(savedPackingList)

            // Remove from form values
            const currentFormValues = getValues('items')
            delete currentFormValues[itemId]
            setValue('items', currentFormValues)

            // If logged in, also save to Pod automatically
            if (isLoggedIn) {
                isLocalChangeRef.current = true;
                await saveToPod(savedPackingList);
                // Reset the flag after a short delay to allow sync to complete
                setTimeout(() => {
                    isLocalChangeRef.current = false;
                }, 2000);
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
                items: updatedItems,
                lastModified: new Date().toISOString() // Add timestamp for conflict resolution
            }

            // Save to database
            const dbResult = await packingAppDb.savePackingList(updatedPackingList)

            // Update local state with new _rev
            const savedPackingList = {
                ...updatedPackingList,
                _rev: dbResult.rev
            }
            setPackingList(savedPackingList)

            // Add to form values
            setValue(`items.${newItem.id}`, false)

            // Clear the input
            setNewItemInputs({ ...newItemInputs, [personName]: '' })

            // If logged in, also save to Pod automatically
            if (isLoggedIn) {
                isLocalChangeRef.current = true;
                await saveToPod(savedPackingList);
                // Reset the flag after a short delay to allow sync to complete
                setTimeout(() => {
                    isLocalChangeRef.current = false;
                }, 2000);
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

    return (
        <div className="w-full flex flex-col items-center py-8 px-4">
            {/* Sticky top toolbar */}
            <div className="sticky top-0 z-50 w-full mb-6 flex justify-center">
                <div className="w-full max-w-screen-2xl">
                    <div className="backdrop-blur-md bg-white/90 border border-gray-200 shadow-lg rounded-xl px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold text-gray-900">{packingList.name}</h1>
                                {autoSaveStatus !== 'idle' && (
                                    <div className="flex items-center space-x-2">
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
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Only show sync status when actively pulling newer data from Pod */}
                                {isLoggedIn && syncingFromPod && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5 flex items-center gap-2">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                        <span className="text-xs text-blue-700">Syncing from Pod...</span>
                                    </div>
                                )}
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => setShowPacked(!showPacked)}
                                >
                                    {showPacked ? 'Hide Packed' : 'Show Packed'}
                                </Button>
                                {isLoggedIn && (
                                    <>
                                        <Button
                                            type="button"
                                            onClick={handleLoadFromPod}
                                            disabled={syncingFromPod}
                                            variant="secondary"
                                        >
                                            {syncingFromPod ? 'Syncing...' : 'Sync Now'}
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={handleSaveToPod}
                                            variant="secondary"
                                        >
                                            Save to Pod
                                        </Button>
                                    </>
                                )}
                                <Button type="submit" form="view-packing-list-form" disabled={isSaving}>
                                    {isSaving ? 'Saving...' : 'Save & Return'}
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
                        {!isLoggedIn && (
                            <div className="mt-2 bg-blue-50 border border-blue-200 rounded-md p-2">
                                <p className="text-xs text-gray-700">💡 Login with Solid Pod to save your packing list privately in storage you control.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="w-full">
                <form onSubmit={handleSubmit(onSubmit)} id="view-packing-list-form">
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                        {Object.entries(
                            filteredItems.reduce((acc, item) => {
                                if (!acc[item.personName]) {
                                    acc[item.personName] = [];
                                }
                                acc[item.personName].push(item);
                                return acc;
                            }, {} as Record<string, typeof filteredItems>)
                        ).sort(([nameA], [nameB]) => nameA.localeCompare(nameB)).map(([personName, items]) => (
                            <div key={personName} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">{personName}'s Items</h2>
                                <div className="space-y-2">
                                    {items
                                        .sort((a, b) => a.itemText.localeCompare(b.itemText))
                                        .map((item) => (
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
                                                        <span className="text-gray-700">
                                                            {item.itemText}
                                                        </span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteItem(item.id)}
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
                        ))}
                    </div>
                </form>
            </div>
        </div>
    )
}
