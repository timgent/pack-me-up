import { useEffect, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useNavigate } from 'react-router-dom'
import { PackingList } from '../create-packing-list/types'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { LoadingState } from '../components/LoadingState'
import { PodSyncIndicator } from '../components/PodSyncIndicator'
import { Modal } from '../components/Modal'
import { SyncAcrossDevicesPrompt } from '../components/SyncAcrossDevicesPrompt'
import { getPrimaryPodUrl, saveRdfToPod, deleteFileFromPod, POD_CONTAINERS, POD_ERROR_MESSAGES, getCollaborators, isPubliclyAccessible, resolveOwnerDisplayName, buildSharedListPath } from '../services/solidPod'
import { useOwnerDisplayNames } from '../hooks/useOwnerDisplayName'
import { packingListToDataset, deletedPackingListsToDataset } from '../services/rdfSerialization'
import { usePodErrorHandler } from '../hooks/usePodErrorHandler'
import { useLocalFirstLoad } from '../hooks/useLocalFirstLoad'
import { duplicatePackingList } from '../utils/duplicatePackingList'
import { formatTripCountdown, formatTripDates, splitCurrentAndPastTrips } from '../create-packing-list/tripDetails'
import { TripCountdownBadge } from '../components/TripCountdownBadge'
import { PastTripsSection } from '../components/PastTripsSection'

type SharingStatus = 'public' | 'shared' | 'private'

/**
 * The card's actions, behind a kebab. Gathering them into one menu replaces the
 * three sibling buttons that each had to stop its own click from reaching the
 * card underneath and opening the list. The menu keeps clicks off the card in
 * two places instead of once per action: the trigger, and the content — the
 * latter because a React portal still propagates events up the React tree, so
 * the card's onClick sees an item click even though the menu is rendered
 * outside the card in the DOM.
 */
function ListCardMenu({ listName, onRename, onDuplicate, onDelete }: {
    listName: string
    onRename: () => void
    onDuplicate: () => void
    onDelete: () => void
}) {
    return (
        <DropdownMenu.Root>
            <span onClick={e => e.stopPropagation()} className="inline-flex">
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`More actions for ${listName}`}
                        title="More actions"
                        className="text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 px-2 py-1 rounded-lg transition-colors duration-200"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                        </svg>
                    </button>
                </DropdownMenu.Trigger>
            </span>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    onClick={e => e.stopPropagation()}
                    className="w-40 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-100 dark:border-gray-800 py-1 z-50"
                >
                    <DropdownMenu.Item
                        onSelect={onRename}
                        className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-default outline-none"
                    >
                        Rename
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                        onSelect={onDuplicate}
                        className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-default outline-none"
                    >
                        Duplicate
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                        onSelect={onDelete}
                        className="px-4 py-2.5 text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-950/40 cursor-default outline-none"
                    >
                        Delete
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    )
}

export function PackingLists() {
    const [packingLists, setPackingLists] = useState<PackingList[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [listToDelete, setListToDelete] = useState<{ id: string; name: string } | null>(null)
    const [listToRename, setListToRename] = useState<{ id: string; name: string } | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [sharingStatus, setSharingStatus] = useState<Record<string, SharingStatus>>({})
    const navigate = useNavigate()
    const { isLoggedIn, session } = useSolidPod()
    const ownerNames = useOwnerDisplayNames(
        packingLists
            .filter(l => !!l.sharedFromPodUrl)
            .map(l => ({ id: l.id, podUrl: l.sharedFromPodUrl!, ownerWebId: l.ownerWebId })),
        session
    )
    const { db } = useDatabase()
    const handlePodError = usePodErrorHandler()

    const requestDeletePackingList = (id: string, name: string) => {
        setListToDelete({ id, name })
    }

    const requestRenamePackingList = (id: string, name: string) => {
        setListToRename({ id, name })
        setRenameValue(name)
    }

    const confirmRenamePackingList = async () => {
        if (!listToRename) return
        try {
            const list = packingLists.find(l => l.id === listToRename.id)
            if (!list) return
            const updatedList = { ...list, name: renameValue, lastModified: new Date().toISOString() }
            await db.savePackingList(updatedList)
            setPackingLists(packingLists.map(l => l.id === listToRename.id ? updatedList : l))
            await syncListToPod(updatedList)
        } catch (err) {
            console.error('Error renaming packing list:', err)
        } finally {
            setListToRename(null)
        }
    }

    const handleDuplicatePackingList = async (list: PackingList) => {
        try {
            // Which fields a copy inherits — and the few it must not — live
            // with the helper, so a field added to `PackingList` is carried
            // without anyone having to remember this page.
            const newList: PackingList = duplicatePackingList(list, packingLists.map(l => l.name))
            await db.savePackingList(newList)
            setPackingLists([newList, ...packingLists])
            syncListToPod(newList)
        } catch (err) {
            console.error('Error duplicating packing list:', err)
        }
    }

    const confirmDeletePackingList = async () => {
        if (!listToDelete) return
        const { id } = listToDelete
        // A cached copy of somebody else's shared list only leaves this device:
        // the pod file is theirs, and the id is theirs to reuse, so it gets no
        // tombstone of ours.
        const isForeign = !!packingLists.find(list => list.id === id)?.sharedFromPodUrl
        try {
            await db.deletePackingList(id, { recordDeletion: !isForeign })
            setPackingLists(packingLists.filter(list => list.id !== id))
            if (!isForeign) await removeListFromPod(id)
        } catch (err) {
            console.error('Error deleting packing list:', err)
        } finally {
            setListToDelete(null)
        }
    }

    const syncListToPod = async (list: PackingList) => {
        if (!isLoggedIn) return
        try {
            const podUrl = await getPrimaryPodUrl(session)
            if (!podUrl) return
            await saveRdfToPod({
                session: session!,
                fileUrl: `${podUrl}${POD_CONTAINERS.PACKING_LISTS}${list.id}.ttl`,
                data: list,
                serializer: packingListToDataset,
            })
        } catch (error) {
            handlePodError(error, POD_ERROR_MESSAGES.SAVE_FAILED)
        }
    }

    const removeListFromPod = async (id: string) => {
        if (!isLoggedIn) return
        try {
            const podUrl = await getPrimaryPodUrl(session)
            if (!podUrl) return
            await deleteFileFromPod(session!, `${podUrl}${POD_CONTAINERS.PACKING_LISTS}${id}.ttl`)
            // Removing the file is not enough on its own: a device that still
            // holds the list would see it missing from the pod and upload it
            // again. The tombstone is what tells it the list is gone.
            await saveRdfToPod({
                session: session!,
                fileUrl: `${podUrl}${POD_CONTAINERS.DELETED_PACKING_LISTS}`,
                data: await db.getDeletedPackingLists(),
                serializer: deletedPackingListsToDataset,
            })
        } catch (error) {
            handlePodError(error, POD_ERROR_MESSAGES.SAVE_FAILED)
        }
    }

    // Local first: the lists on this device go up straight away and the pod
    // catches up afterwards — see useLocalFirstLoad.
    const { isCheckingPod } = useLocalFirstLoad(() => {
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
        return fetchPackingLists()
    }, [db, isLoggedIn])

    // Lazy-load sharing status badges for own lists only
    useEffect(() => {
        if (!isLoggedIn || !session || packingLists.length === 0) return
        getPrimaryPodUrl(session).then(podUrl => {
            if (!podUrl) return
            for (const list of packingLists) {
                if (list.sharedFromPodUrl) continue  // skip foreign lists
                const fileUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}${list.id}.ttl`
                Promise.all([
                    getCollaborators(session, fileUrl),
                    isPubliclyAccessible(session, fileUrl),
                ])
                    .then(([collaborators, pub]) => {
                        const status: SharingStatus = pub ? 'public' : collaborators.length > 0 ? 'shared' : 'private'
                        setSharingStatus(prev => ({ ...prev, [list.id]: status }))
                    })
                    .catch(() => {})
            }
        }).catch(() => {})
    }, [packingLists, isLoggedIn, session])

    // Finished trips, and undated lists that have gone quiet, are folded away
    // below rather than dropped — see splitCurrentAndPastTrips.
    const { current: currentLists, past: pastLists, allPastFinished } = splitCurrentAndPastTrips(packingLists)

    /**
     * One list card. `index` is the card's position across both sections, not
     * within one: the past cards carry on the gradient rotation rather than
     * restarting it, so the first past trip never repeats the colour of the
     * first current one.
     */
    const renderListCard = (list: PackingList, index: number) => {
        const packedCount = list.items.filter(item => item.packed).length
        const totalCount = list.items.length
        const percentComplete = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0
        const displayWidth = packedCount === 0 ? 0 : Math.max(percentComplete, 4)

        // Rotate through gradient colors
        const gradients = [
            'from-primary-50 dark:from-primary-950/40 to-primary-100 dark:to-primary-900/40 border-primary-300 dark:border-primary-700',
            'from-secondary-50 dark:from-secondary-950/40 to-secondary-100 dark:to-secondary-900/40 border-secondary-300 dark:border-secondary-700',
            'from-accent-50 dark:from-accent-950/40 to-accent-100 dark:to-accent-900/40 border-accent-300 dark:border-accent-700',
            'from-success-50 dark:from-success-950/40 to-success-100 dark:to-success-900/40 border-success-300 dark:border-success-700'
        ]
        const gradient = gradients[index % gradients.length]

        // Trip dates are what the traveller cares about; the
        // creation date is only worth showing when there are none.
        const tripDates = formatTripDates(list.startDate, list.endDate)

        // How soon the trip is is the reason to open this card, so it gets a
        // badge of its own under the name. It names the destination itself,
        // which is why the destination line below stands down when it is here.
        const countdown = formatTripCountdown(list, totalCount - packedCount)

        return (
            <div
                key={list.id}
                data-testid="packing-list-card"
                onClick={() => {
                    if (list.sharedFromPodUrl) {
                        navigate(buildSharedListPath(list.id, list.sharedFromPodUrl, list.ownerWebId))
                    } else {
                        navigate(`/view-lists/${list.id}`)
                    }
                }}
                className={`bg-gradient-to-br ${gradient} rounded-2xl shadow-soft border-2 p-6 hover:shadow-glow-primary hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
            >
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
                    <div className="min-w-0">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 flex-wrap">
                        ✈️ {list.name}
                        {list.sharedFromPodUrl ? (
                            <span className="text-xs font-medium bg-white/60 dark:bg-white/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
                                👤 From {resolveOwnerDisplayName(ownerNames[list.id], list.ownerWebId, list.sharedFromPodUrl)}
                            </span>
                        ) : (
                            <>
                                {sharingStatus[list.id] === 'public' && (
                                    <span className="text-xs font-medium bg-white/60 dark:bg-white/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">🌐 Public</span>
                                )}
                                {sharingStatus[list.id] === 'shared' && (
                                    <span className="text-xs font-medium bg-white/60 dark:bg-white/10 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">👤 Shared</span>
                                )}
                            </>
                        )}
                    </h3>
                    {/* On its own line so a long destination never
                        pushes the actions onto a second row */}
                    {list.destination && !countdown && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">📍 {list.destination}</p>
                    )}
                    <TripCountdownBadge countdown={countdown} className="mt-1" />
                    </div>
                    <div data-testid="list-actions" className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400 bg-white/60 dark:bg-white/10 px-3 py-1 rounded-lg">
                            {tripDates
                                ? `📅 ${tripDates}`
                                : `📅 Created ${new Date(list.createdAt).toLocaleDateString()}`}
                        </span>
                        <ListCardMenu
                            listName={list.name}
                            onRename={() => requestRenamePackingList(list.id, list.name)}
                            onDuplicate={() => handleDuplicatePackingList(list)}
                            onDelete={() => requestDeletePackingList(list.id, list.name)}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex-1 bg-white/40 dark:bg-white/10 rounded-full h-3 overflow-hidden">
                        <div
                            data-testid="progress-fill"
                            className="progress-bar-fill bg-gradient-primary h-full rounded-full"
                            style={{ width: `${displayWidth}%` }}
                        ></div>
                    </div>
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 bg-white/60 dark:bg-white/10 px-3 py-1 rounded-lg">
                        {packedCount} / {totalCount} ({percentComplete}%)
                    </span>
                </div>
            </div>
        )
    }

    // The local read is the only thing worth blocking on — it resolves in
    // milliseconds. The one case that still has to wait is an empty device on
    // first login: there is nothing local to show and "No packing lists found"
    // would be a lie until the pod has been read.
    if (isLoading || (packingLists.length === 0 && isCheckingPod)) {
        // Keep the real header in place so only the list area changes when the
        // lists land.
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <div className="mb-8 flex justify-between items-start">
                    <div className="mb-2">
                        <h1 className="text-4xl font-bold text-primary-900 dark:text-primary-200">📦 Packing Lists</h1>
                        <p className="mt-2 text-lg text-gray-700 dark:text-gray-300 font-medium">View all your created packing lists.</p>
                    </div>
                    <Button variant="primary" onClick={() => navigate('/create-packing-list')}>➕ New List</Button>
                </div>
                <LoadingState message="Loading packing lists..." rows={3} />
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8 flex justify-between items-start">
                <div className="mb-2">
                    <h1 className="text-4xl font-bold text-primary-900 dark:text-primary-200">📦 Packing Lists</h1>
                    <p className="mt-2 text-lg text-gray-700 dark:text-gray-300 font-medium">View all your created packing lists.</p>
                </div>
                <Button variant="primary" onClick={() => navigate('/create-packing-list')}>➕ New List</Button>
            </div>

            {/* The lists below are the local copy; say so while the pod is still
                being read, so anything that appears or changes makes sense. */}
            {isCheckingPod && <PodSyncIndicator />}

            {/* Only worth asking once there is something to sync */}
            {packingLists.length > 0 && <SyncAcrossDevicesPrompt />}

            {packingLists.length === 0 ? (
                <div className="text-center py-12 bg-gradient-to-br from-primary-50 dark:from-primary-950/40 to-accent-50 dark:to-accent-950/40 rounded-2xl border-2 border-primary-200 dark:border-primary-800 shadow-soft">
                    <p className="text-lg text-gray-800 dark:text-gray-100 font-semibold">
                        No packing lists found. Create your first packing list to get started! 🎒
                    </p>
                </div>
            ) : (
                <>
                    <div className="space-y-4">
                        {currentLists.map((list, index) => renderListCard(list, index))}
                    </div>

                    {/* Everything is behind us, so "no packing lists found" would
                        be wrong — say what is actually the case. */}
                    {currentLists.length === 0 && (
                        <div className="text-center py-12 bg-gradient-to-br from-primary-50 dark:from-primary-950/40 to-accent-50 dark:to-accent-950/40 rounded-2xl border-2 border-primary-200 dark:border-primary-800 shadow-soft">
                            <p className="text-lg text-gray-800 dark:text-gray-100 font-semibold">
                                No upcoming trips. Your past trips are below — or start a new list! 🎒
                            </p>
                        </div>
                    )}

                    {pastLists.length > 0 && (
                        <PastTripsSection count={pastLists.length} allPastFinished={allPastFinished}>
                            {pastLists.map((list, index) => renderListCard(list, currentLists.length + index))}
                        </PastTripsSection>
                    )}
                </>
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
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
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
