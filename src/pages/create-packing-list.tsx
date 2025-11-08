import { useEffect, useState } from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList, PackingListFormData, PackingListItem } from '../create-packing-list/types'
import { packingAppDb } from '../services/database'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { useToast } from '../components/ToastContext'
import { useSolidPod } from '../components/SolidPodContext'

export function CreatePackingList() {
    const [questionSet, setQuestionSet] = useState<PackingListQuestionSet | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [noQuestionsFound, setNoQuestionsFound] = useState(false)
    const { showToast } = useToast()
    const { isLoggedIn } = useSolidPod()

    const { register, handleSubmit, setValue, watch } = useForm<PackingListFormData>({
        defaultValues: {
            name: '',
            questionAnswers: []
        }
    })

    useEffect(() => {
        const fetchQuestionSet = async () => {
            setIsLoading(true)
            try {
                const doc = await packingAppDb.getQuestionSet()
                setQuestionSet(doc)
                setNoQuestionsFound(false)
            } catch (err: any) {
                if (err.name === 'not_found') {
                    console.log('No question set found')
                    setNoQuestionsFound(true)
                } else {
                    console.error('Error fetching question set:', err)
                    showToast('Failed to load questions', 'error')
                }
            } finally {
                setIsLoading(false)
            }
        }
        fetchQuestionSet()
    }, [showToast])

    const onSubmit: SubmitHandler<PackingListFormData> = async (data) => {
        if (!questionSet) return

        // Get items from question answers
        const questionBasedItems = data.questionAnswers.flatMap((qa: { questionId: string; selectedOptionIds: string[] }) => {
            const questionId = qa.questionId
            const selectedOptionIds = qa.selectedOptionIds || []
            const question = questionSet.questions.find((q) => q.id === questionId)!

            // For each selected option, get all items
            return selectedOptionIds.flatMap((selectedOptionId) => {
                const selectedOption = question?.options.find((option) => (option.id === selectedOptionId))!
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
            await packingAppDb.savePackingList(packingList)
            showToast('Packing list created successfully!', 'success')
            // Reset the form after successful creation
            window.location.href = '/#/view-lists'
        } catch (err) {
            console.error('Error saving packing list:', err)
            showToast('Failed to create packing list. Please try again.', 'error')
        }
    }

    if (isLoading) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <div className="flex items-center justify-center min-h-96">
                    <div className="text-center">
                        <div className="text-lg text-gray-600">Loading questions...</div>
                    </div>
                </div>
            </div>
        )
    }

    if (noQuestionsFound) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Create New Packing List</h1>
                    <p className="mt-2 text-gray-600">Let's set up your packing list questions first!</p>
                </div>

                <div className="bg-white rounded-2xl shadow-soft border-2 border-primary-200 p-8">
                    <div className="text-center mb-6">
                        <div className="text-6xl mb-4">📋</div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">No Questions Found</h2>
                        <p className="text-gray-600">
                            Before you can create a packing list, you need to set up your packing list questions.
                        </p>
                    </div>

                    <div className="space-y-4 max-w-2xl mx-auto">
                        <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-6 rounded-xl border-2 border-primary-200">
                            <h3 className="text-lg font-bold text-primary-900 mb-2">✨ Quick Start with Wizard</h3>
                            <p className="text-gray-700 mb-4">
                                Answer a few simple questions and we'll generate a personalized question set for you.
                            </p>
                            <Link to="/wizard">
                                <Button variant="primary" className="w-full">
                                    Use the Wizard
                                </Button>
                            </Link>
                        </div>

                        {!isLoggedIn && (
                            <div className="bg-gradient-to-br from-accent-50 to-accent-100 p-6 rounded-xl border-2 border-accent-200">
                                <h3 className="text-lg font-bold text-accent-900 mb-2">🔒 Login to Sync Questions</h3>
                                <p className="text-gray-700 mb-4">
                                    If you've already created questions and saved them to your Solid Pod, login to sync them.
                                </p>
                                <p className="text-sm text-gray-600">
                                    Click "Login with Solid Pod" in the navigation bar above to continue.
                                </p>
                            </div>
                        )}

                        <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 p-6 rounded-xl border-2 border-secondary-200">
                            <h3 className="text-lg font-bold text-secondary-900 mb-2">✏️ Create Manually</h3>
                            <p className="text-gray-700 mb-4">
                                Prefer full control? Create your packing list questions from scratch.
                            </p>
                            <Link to="/manage-questions">
                                <Button variant="secondary" className="w-full">
                                    Edit Questions
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (!questionSet) {
        return null
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

                {questionSet.questions.map((question, index) => {
                    // Default to single-choice for backward compatibility
                    const questionType = question.questionType || "single-choice"

                    return (
                    <div key={question.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            {question.text}
                            {questionType === "multiple-choice" && (
                                <span className="ml-2 text-sm text-gray-500">(select all that apply)</span>
                            )}
                        </h3>
                        <input
                            type="hidden"
                            {...register(`questionAnswers.${index}.questionId`)}
                            value={question.id}
                        />
                        <div className="space-y-2">
                            {questionType === "single-choice" ? (
                                // Single choice - radio buttons
                                question.options.map((option) => (
                                    <label key={`${question.id}-${option.id}`} className="flex items-center space-x-3">
                                        <input
                                            type="radio"
                                            value={option.id}
                                            {...register(`questionAnswers.${index}.selectedOptionIds.0`)}
                                            className="h-4 w-4 text-blue-600"
                                        />
                                        <span className="text-gray-700">{option.text}</span>
                                    </label>
                                ))
                            ) : (
                                // Multiple choice - checkboxes
                                question.options.map((option) => {
                                    const currentSelectedIds = watch(`questionAnswers.${index}.selectedOptionIds`) || []
                                    const isChecked = currentSelectedIds.includes(option.id)

                                    return (
                                    <label key={`${question.id}-${option.id}`} className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            value={option.id}
                                            checked={isChecked}
                                            onChange={(e) => {
                                                const currentIds = watch(`questionAnswers.${index}.selectedOptionIds`) || []
                                                if (e.target.checked) {
                                                    // Add the option to the array
                                                    setValue(`questionAnswers.${index}.selectedOptionIds`, [...currentIds, option.id])
                                                } else {
                                                    // Remove the option from the array
                                                    setValue(`questionAnswers.${index}.selectedOptionIds`, currentIds.filter((id: string) => id !== option.id))
                                                }
                                            }}
                                            className="h-4 w-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                        />
                                        <span className="text-gray-700">{option.text}</span>
                                    </label>
                                    )
                                })
                            )}
                        </div>
                    </div>
                    )
                })}

                <div className="flex justify-end">
                    <Button type="submit">
                        Create Packing List
                    </Button>
                </div>
            </form>
        </div>
    )
}