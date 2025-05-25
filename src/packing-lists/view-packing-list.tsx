import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PouchDB from 'pouchdb'
import { PackingList } from '../create-packing-list/types'
import { Button } from '../components/Button'
import { useForm } from 'react-hook-form'

export function ViewPackingList() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [packingList, setPackingList] = useState<PackingList | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const packingListsDb = new PouchDB('packing-lists')

    const { register, handleSubmit, setValue, watch } = useForm({
        defaultValues: {
            items: [] as { packed: boolean }[]
        }
    })

    useEffect(() => {
        const fetchPackingList = async () => {
            try {
                const doc = await packingListsDb.get<PackingList>(id!)
                setPackingList(doc)
                // Initialize form values
                doc.items.forEach((item, index) => {
                    setValue(`items.${index}.packed`, item.packed)
                })
            } catch (err) {
                console.error('Error fetching packing list:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchPackingList()
    }, [id, setValue])

    const onSubmit = async (data: { items: { packed: boolean }[] }) => {
        if (!packingList) return

        setIsSaving(true)
        try {
            const updatedPackingList = {
                ...packingList,
                items: packingList.items.map((item, index) => ({
                    ...item,
                    packed: data.items[index]?.packed || false
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

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">{packingList.name}</h1>
                <p className="mt-2 text-gray-600">Created on {new Date(packingList.createdAt).toLocaleDateString()}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mb-8">
                {Object.entries(
                    [...packingList.items].reduce((acc, item) => {
                        if (!acc[item.personName]) {
                            acc[item.personName] = [];
                        }
                        acc[item.personName].push(item);
                        return acc;
                    }, {} as Record<string, typeof packingList.items>)
                ).map(([personName, items]) => (
                    <div key={personName} className="space-y-2">
                        <h2 className="text-xl font-semibold text-gray-800 mb-2">{personName}'s Items</h2>
                        {items
                            .sort((a, b) => a.itemText.localeCompare(b.itemText))
                            .map((item, index) => {
                                const originalIndex = packingList.items.findIndex(
                                    i => i.questionId === item.questionId &&
                                        i.optionId === item.optionId &&
                                        i.personId === item.personId
                                );
                                return (
                                    <div
                                        key={`${item.questionId}-${item.optionId}-${item.personId}`}
                                        className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                                    >
                                        <label className="flex items-center space-x-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                {...register(`items.${originalIndex}.packed`)}
                                                className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                            />
                                            <span className={`text-gray-700 ${watch(`items.${originalIndex}.packed`) ? 'line-through text-gray-400' : ''}`}>
                                                {item.itemText}
                                            </span>
                                        </label>
                                    </div>
                                );
                            })}
                    </div>
                ))}

                <div className="flex justify-end space-x-4">
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