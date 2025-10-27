import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackingList } from '../create-packing-list/types'
import { packingAppDb } from '../services/database'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { Button } from '../components/Button'
import { getPrimaryPodUrl, saveMultipleFilesToPod, loadMultipleFilesFromPod, POD_CONTAINERS, POD_ERROR_MESSAGES, AuthenticationError } from '../services/solidPod'

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
            if (error instanceof AuthenticationError) {
                showToast(error.message, 'error')
            } else {
                showToast(POD_ERROR_MESSAGES.SAVE_FAILED, 'error')
            }
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
            if (error instanceof AuthenticationError) {
                showToast(error.message, 'error')
            } else {
                showToast(POD_ERROR_MESSAGES.LOAD_FAILED, 'error')
            }
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
        return <div className="max-w-4xl mx-auto py-8 px-4 text-center text-gray-700 font-semibold">Loading packing lists...</div>
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h1 className="text-4xl font-bold text-primary-900">📦 Packing Lists</h1>
                        <p className="mt-2 text-lg text-gray-700 font-medium">View all your created packing lists.</p>
                    </div>
                    {isLoggedIn && (
                        <div className="flex gap-3">
                            <Button
                                type="button"
                                onClick={handleSaveToPod}
                                disabled={isSaving || packingLists.length === 0}
                                variant="ghost"
                                className="text-base"
                            >
                                <span className="text-2xl mr-2">☁️</span>
                                {isSaving ? 'Saving to Pod...' : 'Save to Pod'}
                            </Button>
                            <Button
                                type="button"
                                onClick={handleLoadFromPod}
                                disabled={isLoadingFromPod}
                                variant="ghost"
                                className="text-base"
                            >
                                <span className="text-2xl mr-2">📥</span>
                                {isLoadingFromPod ? 'Loading from Pod...' : 'Load from Pod'}
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {packingLists.length === 0 ? (
                <div className="text-center py-12 bg-gradient-to-br from-primary-50 to-accent-50 rounded-2xl border-2 border-primary-200 shadow-soft">
                    <p className="text-lg text-gray-800 font-semibold">
                        No packing lists found. Create your first packing list to get started! 🎒
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {packingLists.map((list, index) => {
                        const packedCount = list.items.filter(item => item.packed).length
                        const totalCount = list.items.length
                        const percentComplete = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0

                        // Rotate through gradient colors
                        const gradients = [
                            'from-primary-50 to-primary-100 border-primary-300',
                            'from-secondary-50 to-secondary-100 border-secondary-300',
                            'from-accent-50 to-accent-100 border-accent-300',
                            'from-success-50 to-success-100 border-success-300'
                        ]
                        const gradient = gradients[index % gradients.length]

                        return (
                            <div
                                key={list.id}
                                onClick={() => navigate(`/view-lists/${list.id}`)}
                                className={`bg-gradient-to-br ${gradient} rounded-2xl shadow-soft border-2 p-6 hover:shadow-glow-primary hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-xl font-bold text-gray-900">✈️ {list.name}</h3>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-medium text-gray-600 bg-white/60 px-3 py-1 rounded-lg">
                                            📅 {new Date(list.createdAt).toLocaleDateString()}
                                        </span>
                                        <button
                                            onClick={(e) => deletePackingList(list.id, e)}
                                            className="text-danger-600 hover:text-danger-800 text-sm font-bold hover:scale-110 transition-transform duration-200 bg-white/60 px-3 py-1 rounded-lg"
                                        >
                                            🗑️ Delete
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 bg-white/40 rounded-full h-3 overflow-hidden">
                                        <div
                                            className="bg-gradient-primary h-full transition-all duration-500 rounded-full"
                                            style={{ width: `${percentComplete}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-sm font-bold text-gray-700 bg-white/60 px-3 py-1 rounded-lg">
                                        {packedCount} / {totalCount} ({percentComplete}%)
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
} 