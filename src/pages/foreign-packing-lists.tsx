import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForeignPod } from '../components/ForeignPodContext'
import { useSolidPod } from '../components/SolidPodContext'
import { loadMultipleRdfFromPod, POD_CONTAINERS } from '../services/solidPod'
import { datasetToPackingList } from '../services/rdfSerialization'
import { LoadingState } from '../components/LoadingState'
import { Button } from '../components/Button'
import type { PackingList } from '../create-packing-list/types'
import { formatTripCountdown, formatTripDates, splitCurrentAndPastTrips } from '../create-packing-list/tripDetails'
import { TripCountdownBadge } from '../components/TripCountdownBadge'
import { PastTripsSection } from '../components/PastTripsSection'

export function ForeignPackingListsPage() {
    const foreignPodCtx = useForeignPod()
    const { session, isLoggedIn } = useSolidPod()
    const navigate = useNavigate()
    const [lists, setLists] = useState<PackingList[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const foreignPodUrl = foreignPodCtx?.foreignPodUrl

    const loadLists = useCallback(async () => {
        if (!session || !foreignPodUrl) return
        try {
            const containerUrl = `${foreignPodUrl}${POD_CONTAINERS.PACKING_LISTS}`
            const { data } = await loadMultipleRdfFromPod(session, containerUrl, datasetToPackingList)
            setLists(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
        } catch (err) {
            console.error('ForeignPackingListsPage: error loading lists', err)
        } finally {
            setIsLoading(false)
        }
    }, [session, foreignPodUrl])

    useEffect(() => {
        if (!isLoggedIn || !foreignPodUrl) return
        loadLists()
        const interval = setInterval(loadLists, 5000)
        return () => clearInterval(interval)
    }, [isLoggedIn, foreignPodUrl, loadLists])

    const encodedPodUrl = encodeURIComponent(foreignPodUrl ?? '')

    // The only way to start a list in someone else's pod. The nav dropped
    // "Create List" (#302), and until then this page had no create affordance
    // at all — so a collaborator could edit a shared list but never add one.
    const createList = () => navigate(`/pod/${encodedPodUrl}/create-packing-list`)

    if (isLoading) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <Header onCreate={createList} />
                <LoadingState message="Loading packing lists..." rows={3} />
            </div>
        )
    }

    const gradients = [
        'from-primary-50 dark:from-primary-950/40 to-primary-100 dark:to-primary-900/40 border-primary-300 dark:border-primary-700',
        'from-secondary-50 dark:from-secondary-950/40 to-secondary-100 dark:to-secondary-900/40 border-secondary-300 dark:border-secondary-700',
        'from-accent-50 dark:from-accent-950/40 to-accent-100 dark:to-accent-900/40 border-accent-300 dark:border-accent-700',
        'from-success-50 dark:from-success-950/40 to-success-100 dark:to-success-900/40 border-success-300 dark:border-success-700',
    ]

    // Finished trips, and undated lists that have gone quiet, are folded away
    // below rather than dropped — see splitCurrentAndPastTrips.
    const { current: currentLists, past: pastLists, allPastFinished } = splitCurrentAndPastTrips(lists)

    /**
     * One shared list card. `index` is the card's position across both
     * sections, so the past cards carry on the gradient rotation rather than
     * restarting it and repeating the first current trip's colour.
     */
    const renderListCard = (list: PackingList, index: number) => {
        const packed = list.items.filter(i => i.packed).length
        const total = list.items.length
        const percent = total > 0 ? Math.round((packed / total) * 100) : 0
        const displayWidth = packed === 0 ? 0 : Math.max(percent, 4)
        const gradient = gradients[index % gradients.length]
        const tripDates = formatTripDates(list.startDate, list.endDate)
        const countdown = formatTripCountdown(list, total - packed)
        return (
            <div
                key={list.id}
                data-testid="shared-list-card"
                onClick={() => navigate(`/pod/${encodedPodUrl}/view-lists/${list.id}`)}
                className={`bg-gradient-to-br ${gradient} rounded-2xl shadow-soft border-2 p-6 hover:shadow-glow-primary hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
            >
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 flex-wrap">
                        ✈️ {list.name}
                        {list.destination && !countdown && (
                            <span className="text-xs font-medium bg-white/60 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">
                                📍 {list.destination}
                            </span>
                        )}
                        <TripCountdownBadge countdown={countdown} />
                    </h3>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400 bg-white/60 dark:bg-white/10 px-3 py-1 rounded-lg self-start sm:self-auto">
                        {tripDates
                            ? `📅 ${tripDates}`
                            : `📅 Created ${new Date(list.createdAt).toLocaleDateString()}`}
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex-1 bg-white/40 dark:bg-white/10 rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-gradient-primary h-full transition-all duration-500 rounded-full"
                            style={{ width: `${displayWidth}%` }}
                        />
                    </div>
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 bg-white/60 dark:bg-white/10 px-3 py-1 rounded-lg">
                        {packed} / {total} ({percent}%)
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <Header onCreate={createList} />
            {lists.length === 0 ? (
                <div className="text-center py-12 bg-gradient-to-br from-primary-50 dark:from-primary-950/40 to-accent-50 dark:to-accent-950/40 rounded-2xl border-2 border-primary-200 dark:border-primary-800 shadow-soft">
                    <p className="text-lg text-gray-800 dark:text-gray-100 font-semibold">No packing lists found.</p>
                </div>
            ) : (
                <>
                    <div className="space-y-4">
                        {currentLists.map((list, index) => renderListCard(list, index))}
                    </div>

                    {/* Every shared trip is behind us, so "no packing lists
                        found" would be wrong — say what is actually the case. */}
                    {currentLists.length === 0 && (
                        <div className="text-center py-12 bg-gradient-to-br from-primary-50 dark:from-primary-950/40 to-accent-50 dark:to-accent-950/40 rounded-2xl border-2 border-primary-200 dark:border-primary-800 shadow-soft">
                            <p className="text-lg text-gray-800 dark:text-gray-100 font-semibold">No upcoming trips. Past trips are below.</p>
                        </div>
                    )}

                    {pastLists.length > 0 && (
                        <PastTripsSection count={pastLists.length} allPastFinished={allPastFinished}>
                            {pastLists.map((list, index) => renderListCard(list, currentLists.length + index))}
                        </PastTripsSection>
                    )}
                </>
            )}
        </div>
    )
}

function Header({ onCreate }: { onCreate: () => void }) {
    return (
        <div className="mb-8 flex justify-between items-start gap-4">
            <div className="mb-2">
                <h1 className="text-4xl font-bold text-primary-900 dark:text-primary-200">📦 Packing Lists</h1>
                <p className="mt-2 text-lg text-gray-700 dark:text-gray-300 font-medium">Shared packing lists.</p>
            </div>
            <Button variant="primary" onClick={onCreate}>➕ New List</Button>
        </div>
    )
}
