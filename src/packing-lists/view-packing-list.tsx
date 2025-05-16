import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PouchDB from 'pouchdb'
import { PackingList } from '../create-packing-list/types'
import { Button } from '../components/Button'

export function ViewPackingList() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [packingList, setPackingList] = useState<PackingList | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const packingListsDb = new PouchDB('packing-lists')

    useEffect(() => {
        const fetchPackingList = async () => {
            try {
                const doc = await packingListsDb.get<PackingList>(id!)
                setPackingList(doc)
            } catch (err) {
                console.error('Error fetching packing list:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchPackingList()
    }, [id])

    const toggleItemPacked = (itemIndex: number) => {
        if (!packingList) return

        const updatedItems = [...packingList.items]
        updatedItems[itemIndex] = {
            ...updatedItems[itemIndex],
            packed: !updatedItems[itemIndex].packed
        }

        setPackingList({
            ...packingList,
            items: updatedItems
        })
    }

    const savePackingList = async () => {
        if (!packingList) return

        setIsSaving(true)
        try {
            await packingListsDb.put(packingList)
            navigate('/view-lists')
        } catch (err) {
            console.error('Error saving packing list:', err)
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return <div className="max-w-4xl mx-auto py-8 px-4">Loading packing list...</div>
    }

    if (!packingList) {
        return <div className="max-w-4xl mx-auto py-8 px-4">Packing list not found</div>
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">{packingList.name}</h1>
                <p className="mt-2 text-gray-600">Created on {new Date(packingList.created_at).toLocaleDateString()}</p>
            </div>

            <div className="space-y-4 mb-8">
                {packingList.items.map((item, index) => (
                    <div
                        key={`${item.questionId}-${item.optionId}`}
                        className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                    >
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={item.packed || false}
                                onChange={() => toggleItemPacked(index)}
                                className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <span className={`text-gray-700 ${item.packed ? 'line-through text-gray-400' : ''}`}>
                                {item.text}
                            </span>
                        </label>
                    </div>
                ))}
            </div>

            <div className="flex justify-end space-x-4">
                <Button
                    variant="secondary"
                    onClick={() => navigate('/view-lists')}
                >
                    Back to Lists
                </Button>
                <Button
                    onClick={savePackingList}
                    disabled={isSaving}
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>
        </div>
    )
} 