import { useEffect, useState } from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import PouchDB from 'pouchdb'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList, PackingListFormData, PackingListItem } from './types'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { useToast } from '../components/ToastContext'
import { exampleData } from '../edit-questions/example-data'
import { Callout } from '../components/Callout'

export function CreatePackingList() {
    const [questionSet, setQuestionSet] = useState<PackingListQuestionSet | null>(null)
    const [isExampleLoaded, setIsExampleLoaded] = useState(false)
    const questionsDb = new PouchDB('packing-list-question-set')
    const packingListsDb = new PouchDB('packing-lists')
    const { showToast } = useToast()

    const { register, handleSubmit } = useForm<PackingListFormData>({
        defaultValues: {
            name: '',
            questionAnswers: []
        }
    })

    useEffect(() => {
        const fetchQuestionSet = async () => {
            try {
                const doc = await questionsDb.get<PackingListQuestionSet>('1')
                setQuestionSet(doc)
            } catch (err: any) {
                if (err.name === 'not_found') {
                    console.log('No question set found, using example data')
                    const exampleDoc = exampleData["Basic packing list for 1"]
                    setQuestionSet(exampleDoc)
                    setIsExampleLoaded(true)
                } else {
                    console.error('Error fetching question set:', err)
                    showToast('Failed to load questions', 'error')
                }
            }
        }
        fetchQuestionSet()
    }, [])

    const onSubmit: SubmitHandler<PackingListFormData> = async (data) => {
        if (!questionSet) return

        // Get items from question answers
        const questionBasedItems = data.questionAnswers.flatMap((qa) => {
            const questionId = qa.questionId
            const selectedOptionid = qa.selectedOptionId
            const question = questionSet.questions.find((q) => q.id === questionId)!
            const selectedOption = question?.options.find((option) => (option.id === selectedOptionid))!
            const packingListItems: PackingListItem[] = selectedOption.items.flatMap((item) => {
                const selectedPeople = item.personSelections.filter((person) => (person.selected))
                return selectedPeople.flatMap((person) => {
                    const personName = questionSet.people.find((p) => p.id === person.personId)!.name
                    return {
                        id: crypto.randomUUID(),
                        itemText: item.text,
                        personId: person.personId,
                        personName,
                        questionId: question.id,
                        optionId: selectedOption.id,
                        packed: false
                    }
                })
            })
            return packingListItems
        })

        // Get always needed items
        const alwaysNeededItems = questionSet.alwaysNeededItems.flatMap((item) => {
            const selectedPeople = item.personSelections.filter((person) => (person.selected))
            return selectedPeople.flatMap((person) => {
                const personName = questionSet.people.find((p) => p.id === person.personId)!.name
                return {
                    id: crypto.randomUUID(),
                    itemText: item.text,
                    personId: person.personId,
                    personName,
                    questionId: 'always-needed',
                    optionId: 'always-needed',
                    packed: false
                }
            })
        })

        const packingList: PackingList = {
            id: crypto.randomUUID(),
            name: data.name,
            createdAt: new Date().toISOString(),
            items: [...questionBasedItems, ...alwaysNeededItems]
        }
        try {
            await packingListsDb.put({
                _id: packingList.id,
                ...packingList
            })
            showToast('Packing list created successfully!', 'success')
            // Reset the form after successful creation
            window.location.href = '/#/view-lists'
        } catch (err) {
            console.error('Error saving packing list:', err)
            showToast('Failed to create packing list. Please try again.', 'error')
        }
    }

    if (!questionSet) {
        return <div>Loading questions...</div>
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Create New Packing List</h1>
                <p className="mt-2 text-gray-600">Answer the questions below to create your packing list.</p>
            </div>

            {isExampleLoaded && (
                <div className="mb-8">
                    <Callout
                        title="Example Questions Loaded"
                        description="We've loaded some example questions to help you get started. You can customize these questions later in the Edit Questions section."
                    />
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Input
                    label="Packing List Name"
                    placeholder="Enter a name for your packing list"
                    {...register('name', { required: true })}
                />

                {questionSet.questions.map((question, index) => (
                    <div key={question.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">{question.text}</h3>
                        <input
                            type="hidden"
                            {...register(`questionAnswers.${index}.questionId`)}
                            value={question.id}
                        />
                        <div className="space-y-2">
                            {question.options.map((option) => (
                                <label key={`${question.id}-${option.id}`} className="flex items-center space-x-3">
                                    <input
                                        type="radio"
                                        value={option.id}
                                        {...register(`questionAnswers.${index}.selectedOptionId`)}
                                        className="h-4 w-4 text-blue-600"
                                    />
                                    <span className="text-gray-700">{option.text}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}

                <div className="flex justify-end">
                    <Button type="submit">
                        Create Packing List
                    </Button>
                </div>
            </form>
        </div>
    )
}