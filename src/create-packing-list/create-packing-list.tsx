import { useEffect, useState } from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import PouchDB from 'pouchdb'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList, PackingListFormData } from './types'
import { Input } from '../components/Input'
import { Button } from '../components/Button'

export function CreatePackingList() {
    const [questionSet, setQuestionSet] = useState<PackingListQuestionSet | null>(null)
    const questionsDb = new PouchDB('packing-list-question-set')
    const packingListsDb = new PouchDB('packing-lists')

    const { register, handleSubmit, watch } = useForm<PackingListFormData>({
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
            } catch (err) {
                console.error('Error fetching question set:', err)
            }
        }
        fetchQuestionSet()
    }, [])

    const onSubmit: SubmitHandler<PackingListFormData> = async (data) => {
        if (!questionSet) return

        // Create a new packing list
        const packingList: PackingList = {
            id: crypto.randomUUID(),
            name: data.name,
            created_at: new Date().toISOString(),
            items: []
        }

        // For each question answer, add the selected items to the packing list
        data.questionAnswers.forEach(answer => {
            const question = questionSet.questions.find(q => q.id === answer.questionId)
            if (!question) return

            const option = question.options.find(o => o.id === answer.selectedOptionId)
            if (!option) return

            // Add each item from the selected option
            option.items.forEach(item => {
                // Only add items that are selected for any person
                const selectedForAnyPerson = item.personSelections.some(ps => ps.selected)
                if (selectedForAnyPerson) {
                    packingList.items.push({
                        text: item.text,
                        personId: item.personSelections.find(ps => ps.selected)?.personId || '',
                        questionId: question.id,
                        optionId: option.id
                    })
                }
            })
        })

        try {
            await packingListsDb.put({
                _id: packingList.id,
                ...packingList
            })
            console.log('Created packing list:', packingList)
        } catch (err) {
            console.error('Error saving packing list:', err)
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

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Input
                    label="Packing List Name"
                    placeholder="Enter a name for your packing list"
                    {...register('name', { required: true })}
                />

                {questionSet.questions.map((question, index) => (
                    <div key={question.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">{question.text}</h3>
                        <div className="space-y-2">
                            {question.options.map((option) => (
                                <label key={`${question.id}-${option.id}`} className="flex items-center space-x-3">
                                    <input
                                        type="radio"
                                        value={option.id}
                                        {...register(`questionAnswers.${index}.selectedOptionId`)}
                                        onChange={(e) => {
                                            register(`questionAnswers.${index}.selectedOptionId`).onChange(e);
                                            register(`questionAnswers.${index}.questionId`).onChange({
                                                target: { value: question.id }
                                            });
                                        }}
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