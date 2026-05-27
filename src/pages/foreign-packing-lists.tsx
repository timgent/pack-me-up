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

    const gradients = [
        'from-primary-50 to-primary-100 border-primary-300',
        'from-secondary-50 to-secondary-100 border-secondary-300',
        'from-accent-50 to-accent-100 border-accent-300',
        'from-success-50 to-success-100 border-success-300',
    ]

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-4xl font-bold text-primary-900">📦 Packing Lists</h1>
                <p className="mt-2 text-lg text-gray-700 font-medium">Shared packing lists.</p>
            </div>
            {lists.length === 0 ? (
                <div className="text-center py-12 bg-gradient-to-br from-primary-50 to-accent-50 rounded-2xl border-2 border-primary-200 shadow-soft">
                    <p className="text-lg text-gray-800 font-semibold">No packing lists found.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {lists.map((list, index) => {
                        const packed = list.items.filter(i => i.packed).length
                        const total = list.items.length
                        const percent = total > 0 ? Math.round((packed / total) * 100) : 0
                        const displayWidth = packed === 0 ? 0 : Math.max(percent, 4)
                        const gradient = gradients[index % gradients.length]
                        return (
                            <div
                                key={list.id}
                                onClick={() => navigate(`/pod/${encodedPodUrl}/view-lists/${list.id}`)}
                                className={`bg-gradient-to-br ${gradient} rounded-2xl shadow-soft border-2 p-6 hover:shadow-glow-primary hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
                                    <h3 className="text-xl font-bold text-gray-900">✈️ {list.name}</h3>
                                    <span className="text-sm font-medium text-gray-600 bg-white/60 px-3 py-1 rounded-lg self-start sm:self-auto">
                                        📅 {new Date(list.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 bg-white/40 rounded-full h-3 overflow-hidden">
                                        <div
                                            className="bg-gradient-primary h-full transition-all duration-500 rounded-full"
                                            style={{ width: `${displayWidth}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-bold text-gray-700 bg-white/60 px-3 py-1 rounded-lg">
                                        {packed} / {total} ({percent}%)
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
