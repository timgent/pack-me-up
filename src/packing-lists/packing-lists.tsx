import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PouchDB from 'pouchdb'
import { PackingList } from '../create-packing-list/types'

export function PackingLists() {
    const [packingLists, setPackingLists] = useState<PackingList[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const navigate = useNavigate()
    const packingListsDb = new PouchDB('packing-lists')

    const deletePackingList = async (id: string, event: React.MouseEvent) => {
        event.stopPropagation() // Prevent navigation when clicking delete
        try {
            const doc = await packingListsDb.get(id)
            await packingListsDb.remove(doc)
            setPackingLists(packingLists.filter(list => list.id !== id))
        } catch (err) {
            console.error('Error deleting packing list:', err)
        }
    }

    useEffect(() => {
        const fetchPackingLists = async () => {
            try {
                const result = await packingListsDb.allDocs<PackingList>({ include_docs: true })
                const lists = result.rows
                    .map(row => row.doc)
                    .filter(doc => doc !== undefined)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
                <h1 className="text-2xl font-bold text-gray-900">Packing Lists</h1>
                <p className="mt-2 text-gray-600">View all your created packing lists.</p>
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