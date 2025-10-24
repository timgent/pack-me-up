import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDebouncedCallback } from 'use-debounce'
import { PackingList } from '../create-packing-list/types'
import { packingAppDb } from '../services/database'
import { Button } from '../components/Button'
import { useForm } from 'react-hook-form'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { getPrimaryPodUrl, saveFileToPod, loadFileFromPod, POD_CONTAINERS, POD_ERROR_MESSAGES } from '../services/solidPod'

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
    const [isSavingToPod, setIsSavingToPod] = useState(false)
    const [isLoadingFromPod, setIsLoadingFromPod] = useState(false)
    const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({})
    const { isLoggedIn, session } = useSolidPod()
    const { showToast } = useToast()

    const { register, handleSubmit, setValue, watch, getValues } = useForm<FormData>({
        defaultValues: {
            items: {}
        }
    })

    const watchedItems = watch('items')

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
            const updatedPackingList = {
                ...packingList!,
                items: packingList!.items.map(item => ({
                    ...item,
                    packed: currentFormValues[item.id] ?? false
                }))
            }
            const dbResult = await packingAppDb.savePackingList(updatedPackingList)
            setPackingList(() => ({
                ...updatedPackingList!,
                _rev: dbResult.rev
            }))
            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 10000)
        } catch (err) {
            console.error('Error saving packing list:', err)
            setAutoSaveStatus('error')
        }
    }, 5000)

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
        if (!packingList) return

        const podUrl = await getPrimaryPodUrl(session)

        if (!podUrl) {
            showToast(POD_ERROR_MESSAGES.NOT_LOGGED_IN, 'error')
            return
        }

        setIsSavingToPod(true)
        try {
            const containerPath = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`
            const filename = `${packingList.id}.json`

            await saveFileToPod({
                session: session!,
                containerPath,
                filename,
                data: packingList
            })

            showToast('Successfully saved packing list to Solid Pod!', 'success')
        } catch (error) {
            console.error('Error saving to pod:', error)
            showToast(POD_ERROR_MESSAGES.SAVE_FAILED, 'error')
        } finally {
            setIsSavingToPod(false)
        }
    }

    const handleLoadFromPod = async () => {
        if (!packingList) return

        const podUrl = await getPrimaryPodUrl(session)

        if (!podUrl) {
            showToast(POD_ERROR_MESSAGES.NOT_LOGGED_IN_LOAD, 'error')
            return
        }

        setIsLoadingFromPod(true)
        try {
            const containerPath = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`
            const filename = `${packingList.id}.json`

            const loadedList = await loadFileFromPod<PackingList>({
                session: session!,
                fileUrl: `${containerPath}${filename}`
            })

            // Remove _rev to avoid conflicts with local database version
            delete loadedList._rev

            // Save to local database
            const dbResult = await packingAppDb.savePackingList(loadedList)

            // Update the local state and form
            setPackingList({
                ...loadedList,
                _rev: dbResult.rev
            })

            // Update form values
            const formValues: Record<string, boolean> = {}
            loadedList.items.forEach((item) => {
                formValues[item.id] = item.packed
            })
            setValue('items', formValues)

            showToast('Successfully loaded packing list from Solid Pod!', 'success')
        } catch (error) {
            console.error('Error loading from pod:', error)
            showToast(POD_ERROR_MESSAGES.LOAD_FAILED, 'error')
        } finally {
            setIsLoadingFromPod(false)
        }
    }

    const handleDeleteItem = async (itemId: string) => {
        if (!packingList) return

        try {
            setAutoSaveStatus('saving')

            // Remove the item from the packing list
            const updatedItems = packingList.items.filter(item => item.id !== itemId)
            const updatedPackingList = {
                ...packingList,
                items: updatedItems
            }

            // Save to database
            const dbResult = await packingAppDb.savePackingList(updatedPackingList)

            // Update local state
            setPackingList({
                ...updatedPackingList,
                _rev: dbResult.rev
            })

            // Remove from form values
            const currentFormValues = getValues('items')
            delete currentFormValues[itemId]
            setValue('items', currentFormValues)

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 3000)
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
            const updatedPackingList = {
                ...packingList,
                items: updatedItems
            }

            // Save to database
            const dbResult = await packingAppDb.savePackingList(updatedPackingList)

            // Update local state
            setPackingList({
                ...updatedPackingList,
                _rev: dbResult.rev
            })

            // Add to form values
            setValue(`items.${newItem.id}`, false)

            // Clear the input
            setNewItemInputs({ ...newItemInputs, [personName]: '' })

            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 3000)
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
                                            disabled={isLoadingFromPod}
                                            variant="secondary"
                                        >
                                            {isLoadingFromPod ? 'Loading...' : 'Load from Pod'}
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={handleSaveToPod}
                                            disabled={isSavingToPod}
                                            variant="secondary"
                                        >
                                            {isSavingToPod ? 'Saving...' : 'Save to Pod'}
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
