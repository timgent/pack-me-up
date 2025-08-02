import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PouchDB from 'pouchdb'
import { PackingList } from '../create-packing-list/types'
import { Button } from '../components/Button'
import { useForm } from 'react-hook-form'

type FormData = {
    items: Record<string, boolean>
}

const packingListsDb = new PouchDB('packing-lists')

export function ViewPackingList() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [packingList, setPackingList] = useState<PackingList | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [showPacked, setShowPacked] = useState(false)

    const { register, handleSubmit, setValue, watch } = useForm<FormData>({
        defaultValues: {
            items: {}
        }
    })

    const watchedItems = watch('items')

    useEffect(() => {
        const fetchPackingList = async () => {
            try {
                const doc = await packingListsDb.get<PackingList>(id!)
                setPackingList(doc)
                // Initialize form values with a clean slate
                const initialValues: Record<string, boolean> = {}
                doc.items.forEach((item) => {
                    initialValues[item.id] = item.packed
                })
                setValue('items', initialValues)
            } catch (err) {
                console.error('Error fetching packing list:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchPackingList()
    }, [id, setValue])

    const onSubmit = async (data: FormData) => {
        if (!packingList) return

        setIsSaving(true)
        try {
            const updatedPackingList = {
                ...packingList,
                items: packingList.items.map(item => ({
                    ...item,
                    packed: data.items[item.id] ?? false
                }))
            }
            await packingListsDb.put(updatedPackingList)
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

    const filteredItems = packingList.items.filter(item => {
        if (showPacked) {
            return true
        }
        return !watchedItems[item.id]
    })

    return (
        <div className="mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{packingList.name}</h1>
                    <p className="mt-2 text-gray-600">Created on {new Date(packingList.createdAt).toLocaleDateString()}</p>
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowPacked(!showPacked)}
                >
                    {showPacked ? 'Hide Packed' : 'Show Packed'}
                </Button>
            </div>


            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mb-8">
                <div className="flex flex-wrap gap-4">
                    {Object.entries(
                        filteredItems.reduce((acc, item) => {
                            if (!acc[item.personName]) {
                                acc[item.personName] = [];
                            }
                            acc[item.personName].push(item);
                            return acc;
                        }, {} as Record<string, typeof filteredItems>)
                    ).map(([personName, items]) => (
                        <div key={personName} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                            <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">{personName}'s Items</h2>
                            <div className="space-y-2">
                                {items
                                    .sort((a, b) => a.itemText.localeCompare(b.itemText))
                                    .map((item) => (
                                        <div
                                            key={`${item.id}-${personName}`}
                                            className="bg-gray-50 rounded-lg p-3"
                                        >
                                            <label className="flex items-center space-x-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    {...register(`items.${item.id}`)}
                                                    className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                />
                                                <span className="text-gray-700">
                                                    {item.itemText}
                                                </span>
                                            </label>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end space-x-4 mt-6">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => navigate('/view-lists')}
                    >
                        Back to Lists
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSaving}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </form>
        </div>
    )
}