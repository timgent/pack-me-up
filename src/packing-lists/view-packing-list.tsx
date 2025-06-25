import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PouchDB from 'pouchdb'
import { PackingList, PackingListItem } from '../create-packing-list/types'
import { Button } from '../components/Button'
import { useForm } from 'react-hook-form'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { PackingListQuestionSet, Person } from '../edit-questions/types'

type FormData = {
    items: Record<string, boolean>
}

type AddItemFormData = {
    itemName: string
    personIds: string[]
}

export function ViewPackingList() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [packingList, setPackingList] = useState<PackingList | null>(null)
    const [questionSet, setQuestionSet] = useState<PackingListQuestionSet | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false)
    const packingListsDb = new PouchDB('packing-lists')
    const questionsDb = new PouchDB('packing-list-question-set')

    const { register, handleSubmit, setValue } = useForm<FormData>({
        defaultValues: {
            items: {}
        }
    })

    const addItemForm = useForm<AddItemFormData>()

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

        const fetchQuestionSet = async () => {
            try {
                const doc = await questionsDb.get<PackingListQuestionSet>('1')
                setQuestionSet(doc)
            } catch (err) {
                console.error('Error fetching question set:', err)
            }
        }

        fetchPackingList()
        fetchQuestionSet()
    }, [id, setValue])

    const handleAddItem = async (data: AddItemFormData) => {
        if (!packingList || !questionSet) return

        const newItems: PackingListItem[] = data.personIds.map(personId => {
            const person = questionSet.people.find(p => p.id === personId)!
            return {
                id: crypto.randomUUID(),
                itemText: data.itemName,
                personName: person.name,
                packed: false,
                personId: person.id,
                questionId: 'custom',
                optionId: 'custom'
            }
        })

        const updatedPackingList = {
            ...packingList,
            items: [...packingList.items, ...newItems]
        }

        try {
            await packingListsDb.put(updatedPackingList)
            setPackingList(updatedPackingList)
            newItems.forEach(item => setValue(`items.${item.id}`, false))
            setIsAddItemModalOpen(false)
            addItemForm.reset()
        } catch (err) {
            console.error('Error saving packing list:', err)
        }
    }

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

    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">{packingList.name}</h1>
                <p className="mt-2 text-gray-600">Created on {new Date(packingList.createdAt).toLocaleDateString()}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mb-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(
                        [...packingList.items].reduce((acc, item) => {
                            if (!acc[item.personName]) {
                                acc[item.personName] = [];
                            }
                            acc[item.personName].push(item);
                            return acc;
                        }, {} as Record<string, typeof packingList.items>)
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

                <div className="flex justify-between items-center mt-6">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddItemModalOpen(true)}
                    >
                        Add Item
                    </Button>
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
                </div>
            </form>

            <Modal
                isOpen={isAddItemModalOpen}
                onClose={() => setIsAddItemModalOpen(false)}
                title="Add New Item"
            >
                <form onSubmit={addItemForm.handleSubmit(handleAddItem)} className="space-y-4">
                    <Input
                        label="Item Name"
                        {...addItemForm.register('itemName', { required: true })}
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700">People</label>
                        <div className="mt-2 space-y-2">
                            {questionSet?.people.map((person: Person) => (
                                <label key={person.id} className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        value={person.id}
                                        {...addItemForm.register('personIds')}
                                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="text-gray-700">{person.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end space-x-4 mt-6">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setIsAddItemModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit">
                            Add Item
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}  