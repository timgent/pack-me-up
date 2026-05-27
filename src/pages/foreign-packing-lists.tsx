import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForeignPod } from '../components/ForeignPodContext'
import { useSolidPod } from '../components/SolidPodContext'
import { loadMultipleRdfFromPod, POD_CONTAINERS } from '../services/solidPod'
import { datasetToPackingList } from '../services/rdfSerialization'
import type { PackingList } from '../create-packing-list/types'

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

    if (isLoading) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <p className="text-gray-500">Loading packing lists…</p>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-4xl font-bold text-primary-900">Packing Lists</h1>
                <p className="mt-2 text-lg text-gray-700 font-medium">Shared packing lists.</p>
            </div>
            {lists.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    No packing lists found.
                </div>
            ) : (
                <div className="space-y-4">
                    {lists.map(list => {
                        const packed = list.items.filter(i => i.packed).length
                        const total = list.items.length
                        return (
                            <div
                                key={list.id}
                                onClick={() => navigate(`/pod/${encodedPodUrl}/view-lists/${list.id}`)}
                                className="bg-white rounded-2xl p-6 shadow-soft border border-gray-100 cursor-pointer hover:shadow-md transition-all duration-200"
                            >
                                <h3 className="text-xl font-bold text-primary-900">{list.name}</h3>
                                <p className="text-sm text-gray-500 mt-1">{packed}/{total} items packed</p>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
