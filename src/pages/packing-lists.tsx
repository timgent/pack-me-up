import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackingList } from '../create-packing-list/types'
import { packingAppDb } from '../services/database'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { Button } from '../components/Button'
import { getPodUrlAll, saveFileInContainer, overwriteFile, getSolidDataset, getContainedResourceUrlAll, getFile } from '@inrupt/solid-client'

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
        if (!session || !session.info.isLoggedIn || !session.info.webId) {
            showToast('You must be logged in to save to Pod', 'error')
            return
        }

        setIsSaving(true)
        try {
            // Get the user's pod URLs
            const podUrls = await getPodUrlAll(session.info.webId, { fetch: session.fetch })

            if (!podUrls || podUrls.length === 0) {
                showToast('No pod found for your account', 'error')
                return
            }

            // Use the first pod
            const podUrl = podUrls[0]
            const containerUrl = `${podUrl}pack-me-up/packing-lists/`

            let successCount = 0
            let failCount = 0

            // Save each packing list as a separate file
            for (const list of packingLists) {
                try {
                    const json = JSON.stringify(list, null, 2)
                    const blob = new Blob([json], { type: 'application/json' })
                    const file = new File([blob], `${list.id}.json`, { type: 'application/json' })

                    // Try saveFileInContainer first
                    try {
                        await saveFileInContainer(
                            containerUrl,
                            file,
                            {
                                fetch: session.fetch,
                                slug: `${list.id}.json`
                            }
                        )
                        successCount++
                    } catch (saveError: any) {
                        // If we get 404 or 409, use overwriteFile instead
                        if (saveError.statusCode === 404 || saveError.statusCode === 409) {
                            const fileUrl = `${containerUrl}${list.id}.json`
                            await overwriteFile(fileUrl, blob, {
                                fetch: session.fetch,
                                contentType: 'application/json'
                            })
                            successCount++
                        } else {
                            throw saveError
                        }
                    }
                } catch (error) {
                    console.error(`Error saving packing list ${list.id}:`, error)
                    failCount++
                }
            }

            if (failCount === 0) {
                showToast(`Successfully saved ${successCount} packing list(s) to Solid Pod!`, 'success')
            } else {
                showToast(`Saved ${successCount}/${packingLists.length} packing list(s). ${failCount} failed.`, 'error')
            }
        } catch (error) {
            console.error('Error saving to pod:', error)
            showToast('Failed to save to Pod. Please try again.', 'error')
        } finally {
            setIsSaving(false)
        }
    }

    const handleLoadFromPod = async () => {
        if (!session || !session.info.isLoggedIn || !session.info.webId) {
            showToast('You must be logged in to load from Pod', 'error')
            return
        }

        setIsLoadingFromPod(true)
        try {
            // Get the user's pod URLs
            const podUrls = await getPodUrlAll(session.info.webId, { fetch: session.fetch })

            if (!podUrls || podUrls.length === 0) {
                showToast('No pod found for your account', 'error')
                return
            }

            // Use the first pod
            const podUrl = podUrls[0]
            const containerUrl = `${podUrl}pack-me-up/packing-lists/`

            // Get the container dataset to list all files
            let dataset
            try {
                dataset = await getSolidDataset(containerUrl, { fetch: session.fetch })
            } catch (error: any) {
                if (error.statusCode === 404) {
                    showToast('No packing lists found in Pod', 'error')
                    return
                }
                throw error
            }

            const fileUrls = getContainedResourceUrlAll(dataset)
            const jsonFileUrls = fileUrls.filter(url => url.endsWith('.json'))

            if (jsonFileUrls.length === 0) {
                showToast('No packing lists found in Pod', 'error')
                return
            }

            let successCount = 0
            let failCount = 0
            const loadedLists: PackingList[] = []

            // Load each file
            for (const fileUrl of jsonFileUrls) {
                try {
                    const file = await getFile(fileUrl, { fetch: session.fetch })
                    const text = await file.text()
                    const list = JSON.parse(text) as PackingList

                    // Save to local database
                    await packingAppDb.savePackingList(list)
                    loadedLists.push(list)
                    successCount++
                } catch (error) {
                    console.error(`Error loading file ${fileUrl}:`, error)
                    failCount++
                }
            }

            // Refresh the local list
            const allLists = await packingAppDb.getAllPackingLists()
            setPackingLists(allLists)

            if (failCount === 0) {
                showToast(`Successfully loaded ${successCount} packing list(s) from Solid Pod!`, 'success')
            } else {
                showToast(`Loaded ${successCount}/${jsonFileUrls.length} packing list(s). ${failCount} failed.`, 'error')
            }
        } catch (error) {
            console.error('Error loading from pod:', error)
            showToast('Failed to load from Pod. Please try again.', 'error')
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