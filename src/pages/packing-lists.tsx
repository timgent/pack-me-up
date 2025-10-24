import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackingList } from '../create-packing-list/types'
import { packingAppDb } from '../services/database'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { Button } from '../components/Button'
import { getPrimaryPodUrl, saveMultipleFilesToPod, loadMultipleFilesFromPod, POD_CONTAINERS, POD_ERROR_MESSAGES } from '../services/solidPod'

export function PackingLists() {
    const [packingLists, setPackingLists] = useState<PackingList[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isLoadingFromPod, setIsLoadingFromPod] = useState(false)
    const navigate = useNavigate()
    const { isLoggedIn, session } = useSolidPod()
    const { showToast } = useToast()

    const deletePackingList = async (id: string, event: React.MouseEvent) => {
        event.stopPropagation() // Prevent navigation when clicking delete
        try {
            await packingAppDb.deletePackingList(id)
            setPackingLists(packingLists.filter(list => list.id !== id))
        } catch (err) {
            console.error('Error deleting packing list:', err)
        }
    }

    const handleSaveToPod = async () => {
        const podUrl = await getPrimaryPodUrl(session)

        if (!podUrl) {
            showToast(POD_ERROR_MESSAGES.NOT_LOGGED_IN, 'error')
            return
        }

        setIsSaving(true)
        try {
            const containerUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`

            const result = await saveMultipleFilesToPod(session!, containerUrl, packingLists)

            if (result.success) {
                showToast(`Successfully saved ${result.successCount} packing list(s) to Solid Pod!`, 'success')
            } else {
                showToast(`Saved ${result.successCount}/${result.totalCount} packing list(s). ${result.failCount} failed.`, 'error')
            }
        } catch (error) {
            console.error('Error saving to pod:', error)
            showToast(POD_ERROR_MESSAGES.SAVE_FAILED, 'error')
        } finally {
            setIsSaving(false)
        }
    }

    const handleLoadFromPod = async () => {
        const podUrl = await getPrimaryPodUrl(session)

        if (!podUrl) {
            showToast(POD_ERROR_MESSAGES.NOT_LOGGED_IN_LOAD, 'error')
            return
        }

        setIsLoadingFromPod(true)
        try {
            const containerUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`

            const { data: loadedLists, result } = await loadMultipleFilesFromPod<PackingList>({
                session: session!,
                containerPath: containerUrl
            })

            if (result.totalCount === 0) {
                showToast(POD_ERROR_MESSAGES.NO_DATA_FOUND('packing lists'), 'error')
                return
            }

            // First, delete all existing local packing lists
            const existingLists = await packingAppDb.getAllPackingLists()
            for (const existingList of existingLists) {
                await packingAppDb.deletePackingList(existingList.id)
            }

            // Then save each loaded list to local database
            for (const list of loadedLists) {
                // Remove _rev to avoid conflicts with local database version
                delete list._rev
                await packingAppDb.savePackingList(list)
            }

            // Refresh the local list
            const allLists = await packingAppDb.getAllPackingLists()
            setPackingLists(allLists)

            if (result.success) {
                showToast(`Successfully loaded ${result.successCount} packing list(s) from Solid Pod!`, 'success')
            } else {
                showToast(`Loaded ${result.successCount}/${result.totalCount} packing list(s). ${result.failCount} failed.`, 'error')
            }
        } catch (error) {
            console.error('Error loading from pod:', error)
            showToast(POD_ERROR_MESSAGES.LOAD_FAILED, 'error')
        } finally {
            setIsLoadingFromPod(false)
        }
    }

    useEffect(() => {
        const fetchPackingLists = async () => {
            try {
                const lists = await packingAppDb.getAllPackingLists()
                setPackingLists(lists)
            } catch (err) {
                console.error('Error fetching packing lists:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchPackingLists()
    }, [])

    if (isLoading) {
        return <div className="max-w-4xl mx-auto py-8 px-4">Loading packing lists...</div>
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Packing Lists</h1>
                        <p className="mt-2 text-gray-600">View all your created packing lists.</p>
                    </div>
                    {isLoggedIn && (
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                onClick={handleSaveToPod}
                                disabled={isSaving || packingLists.length === 0}
                                variant="secondary"
                            >
                                {isSaving ? 'Saving...' : 'Save to Pod'}
                            </Button>
                            <Button
                                type="button"
                                onClick={handleLoadFromPod}
                                disabled={isLoadingFromPod}
                                variant="secondary"
                            >
                                {isLoadingFromPod ? 'Loading...' : 'Load from Pod'}
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {packingLists.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    No packing lists found. Create your first packing list to get started.
                </div>
            ) : (
                <div className="space-y-4">
                    {packingLists.map((list) => (
                        <div
                            key={list.id}
                            onClick={() => navigate(`/view-lists/${list.id}`)}
                            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                        >
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-medium text-gray-900">{list.name}</h3>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-500">
                                        {new Date(list.createdAt).toLocaleDateString()}
                                    </span>
                                    <button
                                        onClick={(e) => deletePackingList(list.id, e)}
                                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                                {list.items.filter(item => item.packed).length} of {list.items.length} items packed
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
} 