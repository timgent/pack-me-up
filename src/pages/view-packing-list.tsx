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
            <div className="mb-8 w-full max-w-5xl">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{packingList.name}</h1>
                        <p className="mt-2 text-gray-600">Created on {new Date(packingList.createdAt).toLocaleDateString()}</p>
                        {autoSaveStatus !== 'idle' && (
                            <div className="mt-2 flex items-center space-x-2">
                                {autoSaveStatus === 'saving' && (
                                    <>
                                        <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                        <span className="text-sm text-blue-600">Auto-saving...</span>
                                    </>
                                )}
                                {autoSaveStatus === 'saved' && (
                                    <>
                                        <div className="h-4 w-4 text-green-500">✓</div>
                                        <span className="text-sm text-green-600">Changes saved</span>
                                    </>
                                )}
                                {autoSaveStatus === 'error' && (
                                    <>
                                        <div className="h-4 w-4 text-red-500">✗</div>
                                        <span className="text-sm text-red-600">Save failed</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowPacked(!showPacked)}
                    >
                        {showPacked ? 'Hide Packed' : 'Show Packed'}
                    </Button>
                </div>
            </div>

            <div className="w-full max-w-5xl flex flex-col lg:flex-row lg:items-start lg:gap-8">
                {/* Main form content */}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 flex-1 pb-32 lg:pb-8" id="view-packing-list-form">
                    <div className="flex flex-wrap gap-4">
                        {Object.entries(
                            filteredItems.reduce((acc, item) => {
                                if (!acc[item.personName]) {
                                    acc[item.personName] = [];
                                }
                                acc[item.personName].push(item);
                                return acc;
                            }, {} as Record<string, typeof filteredItems>)
                        ).map(([personName, items]) => (
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
                                                <label className="flex items-center space-x-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        {...register(`items.${item.id}`)}
                                                        className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                    />
                                                    <span className="text-gray-700">
                                                        {item.itemText}
                                                    </span>
                                                </label>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </form>

                {/* Sticky sidebar for large screens */}
                <div className="hidden lg:block lg:w-64 lg:sticky lg:top-24 flex-shrink-0">
                    <div className="backdrop-blur-md bg-white/80 border border-gray-200 shadow-xl rounded-xl flex flex-col items-stretch gap-4 py-6 px-4">
                        {isLoggedIn ? (
                            <>
                                <Button
                                    type="button"
                                    onClick={handleLoadFromPod}
                                    disabled={isLoadingFromPod}
                                    variant="secondary"
                                >
                                    {isLoadingFromPod ? 'Loading from Pod...' : 'Load from Pod'}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleSaveToPod}
                                    disabled={isSavingToPod}
                                    variant="secondary"
                                >
                                    {isSavingToPod ? 'Saving to Pod...' : 'Save to Pod'}
                                </Button>
                            </>
                        ) : (
                            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                                <p className="text-xs text-gray-700 font-semibold mb-1">💡 Store in Your Pod</p>
                                <p className="text-xs text-gray-600 mb-2">Login with Solid Pod to save your packing list privately in storage you control.</p>
                                <p className="text-xs text-blue-600">→ Click "Login with Solid Pod" above</p>
                            </div>
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
            </div>

            {/* Sticky bottom bar for small/medium screens */}
            <div className="fixed bottom-0 left-0 w-full z-50 flex justify-center pointer-events-none lg:hidden">
                <div className="max-w-4xl w-full px-4 pb-4">
                    <div className="backdrop-blur-md bg-white/80 border border-gray-200 shadow-xl rounded-xl flex flex-col gap-3 py-4 px-3 pointer-events-auto">
                        {!isLoggedIn && (
                            <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mx-2">
                                <p className="text-xs text-gray-700 font-semibold">💡 Login with Solid Pod to save privately</p>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-3 justify-center">
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
                </div>
            </div>
        </div>
    )
}
