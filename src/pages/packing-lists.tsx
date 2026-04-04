import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackingList } from '../create-packing-list/types'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { Modal } from '../components/Modal'
import { getPrimaryPodUrl, saveMultipleFilesToPod, loadMultipleFilesFromPod, POD_CONTAINERS, POD_ERROR_MESSAGES } from '../services/solidPod'
import { usePodErrorHandler } from '../hooks/usePodErrorHandler'
import { generateUUID } from '../utils/uuid'

export function PackingLists() {
    const [packingLists, setPackingLists] = useState<PackingList[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isLoadingFromPod, setIsLoadingFromPod] = useState(false)
    const [listToDelete, setListToDelete] = useState<{ id: string; name: string } | null>(null)
    const [listToRename, setListToRename] = useState<{ id: string; name: string } | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const navigate = useNavigate()
    const { isLoggedIn, session } = useSolidPod()
    const { showToast } = useToast()
    const { db } = useDatabase()
    const handlePodError = usePodErrorHandler()

    const requestDeletePackingList = (id: string, name: string, event: React.MouseEvent) => {
        event.stopPropagation()
        setListToDelete({ id, name })
    }

    const requestRenamePackingList = (id: string, name: string, event: React.MouseEvent) => {
        event.stopPropagation()
        setListToRename({ id, name })
        setRenameValue(name)
    }

    const confirmRenamePackingList = async () => {
        if (!listToRename) return
        try {
            const list = packingLists.find(l => l.id === listToRename.id)
            if (!list) return
            await db.savePackingList({ ...list, name: renameValue })
            setPackingLists(packingLists.map(l => l.id === listToRename.id ? { ...l, name: renameValue } : l))
        } catch (err) {
            console.error('Error renaming packing list:', err)
        } finally {
            setListToRename(null)
        }
    }

    const handleDuplicatePackingList = async (list: PackingList, event: React.MouseEvent) => {
        event.stopPropagation()
        try {
            const newList: PackingList = {
                id: generateUUID(),
                name: `Copy of ${list.name}`,
                createdAt: new Date().toISOString(),
                items: list.items.map(item => ({ ...item, id: generateUUID(), packed: false })),
            }
            await db.savePackingList(newList)
            setPackingLists([newList, ...packingLists])
        } catch (err) {
            console.error('Error duplicating packing list:', err)
        }
    }

    const confirmDeletePackingList = async () => {
        if (!listToDelete) return
        try {
            await db.deletePackingList(listToDelete.id)
            setPackingLists(packingLists.filter(list => list.id !== listToDelete.id))
        } catch (err) {
            console.error('Error deleting packing list:', err)
        } finally {
            setListToDelete(null)
        }
    }

    const loadFromPod = async () => {
        const podUrl = await getPrimaryPodUrl(session)
        if (!podUrl) return null

        setIsLoadingFromPod(true)
        try {
            const containerUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`
            const { data: loadedLists, result } = await loadMultipleFilesFromPod<PackingList>({
                session: session!,
                containerPath: containerUrl
            })

            if (result.totalCount === 0) return result

            const existingLists = await db.getAllPackingLists()
            for (const existingList of existingLists) {
                await db.deletePackingList(existingList.id)
            }
            for (const list of loadedLists) {
                delete list._rev
                await db.savePackingList(list)
            }

            const allLists = await db.getAllPackingLists()
            setPackingLists(allLists)

            return result
        } catch (error) {
            handlePodError(error, POD_ERROR_MESSAGES.LOAD_FAILED)
            return null
        } finally {
            setIsLoadingFromPod(false)
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
            handlePodError(error, POD_ERROR_MESSAGES.SAVE_FAILED)
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

        const result = await loadFromPod()
        if (!result) return

        if (result.totalCount === 0) {
            showToast(POD_ERROR_MESSAGES.NO_DATA_FOUND('packing lists'), 'error')
            return
        }

        if (result.success) {
            showToast(`Successfully loaded ${result.successCount} packing list(s) from Solid Pod!`, 'success')
        } else {
            showToast(`Loaded ${result.successCount}/${result.totalCount} packing list(s). ${result.failCount} failed.`, 'error')
        }
    }

    useEffect(() => {
        if (isLoggedIn) {
            loadFromPod()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggedIn])

    useEffect(() => {
        const fetchPackingLists = async () => {
            try {
                const lists = await db.getAllPackingLists()
                setPackingLists(lists)
            } catch (err) {
                console.error('Error fetching packing lists:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchPackingLists()
    }, [db, isLoggedIn])

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
                        const displayWidth = packedCount === 0 ? 0 : Math.max(percentComplete, 4)

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
                                            onClick={(e) => requestRenamePackingList(list.id, list.name, e)}
                                            className="text-primary-600 hover:text-primary-800 text-sm font-bold hover:scale-110 transition-transform duration-200 bg-white/60 px-3 py-1 rounded-lg"
                                        >
                                            ✏️ Rename
                                        </button>
                                        <button
                                            onClick={(e) => handleDuplicatePackingList(list, e)}
                                            className="text-secondary-600 hover:text-secondary-800 text-sm font-bold hover:scale-110 transition-transform duration-200 bg-white/60 px-3 py-1 rounded-lg"
                                        >
                                            📋 Duplicate
                                        </button>
                                        <button
                                            onClick={(e) => requestDeletePackingList(list.id, list.name, e)}
                                            className="text-danger-600 hover:text-danger-800 text-sm font-bold hover:scale-110 transition-transform duration-200 bg-white/60 px-3 py-1 rounded-lg"
                                        >
                                            🗑️ Delete
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 bg-white/40 rounded-full h-3 overflow-hidden">
                                        <div
                                            data-testid="progress-fill"
                                            className="bg-gradient-primary h-full transition-all duration-500 rounded-full"
                                            style={{ width: `${displayWidth}%` }}
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

            <ConfirmationDialog
                isOpen={listToDelete !== null}
                onClose={() => setListToDelete(null)}
                onConfirm={confirmDeletePackingList}
                title="Delete List"
                message={`Are you sure you want to delete "${listToDelete?.name}"? This cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                confirmVariant="danger"
            />

            <Modal isOpen={listToRename !== null} onClose={() => setListToRename(null)} title="Rename List">
                <div className="space-y-4">
                    <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    <div className="flex gap-3 justify-end mt-4">
                        <Button variant="ghost" onClick={() => setListToRename(null)}>Cancel</Button>
                        <Button variant="primary" onClick={confirmRenamePackingList}>Save</Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
