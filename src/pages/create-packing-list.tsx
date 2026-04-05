import { useEffect, useState, useMemo } from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingList, PackingListFormData, PackingListItem } from '../create-packing-list/types'
import { useDatabase } from '../components/DatabaseContext'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { useToast } from '../components/ToastContext'
import { useSolidPod } from '../components/SolidPodContext'
import { SolidProviderSelector } from '../components/SolidProviderSelector'
import { getPrimaryPodUrl, saveFileToPod, POD_CONTAINERS } from '../services/solidPod'

export function deduplicateItems(items: PackingListItem[]): PackingListItem[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        const key = `${item.personId}::${item.itemText.trim().toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

export function getUnreviewedCustomItems(
    packingLists: PackingList[],
    questionSet: PackingListQuestionSet
): Array<{ listId: string; listName: string; item: PackingListItem }> {
    // Build a normalised set of existing question-set item texts
    const existingTexts = new Set<string>()
    for (const item of questionSet.alwaysNeededItems) {
        existingTexts.add(item.text.trim().toLowerCase())
    }
    for (const question of questionSet.questions) {
        for (const option of question.options) {
            for (const item of option.items) {
                existingTexts.add(item.text.trim().toLowerCase())
            }
        }
    }

    const results: Array<{ listId: string; listName: string; item: PackingListItem }> = []
    for (const list of packingLists) {
        for (const item of list.items) {
            if (item.questionId !== '') continue
            if (item.reviewed === true) continue
            if (existingTexts.has(item.itemText.trim().toLowerCase())) continue
            results.push({ listId: list.id, listName: list.name, item })
        }
    }
    return results
}

interface SuggestionCardProps {
    suggestions: Array<{ listId: string; listName: string; item: PackingListItem }>
    onAlwaysInclude: (listId: string, item: PackingListItem) => void
    onSkip: (listId: string, item: PackingListItem) => void
    onDismiss: () => void
}

function SuggestionCard({ suggestions, onAlwaysInclude, onSkip, onDismiss }: SuggestionCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    // Group by list
    const grouped = useMemo(() => {
        const map = new Map<string, { listName: string; items: Array<{ listId: string; item: PackingListItem }> }>()
        for (const s of suggestions) {
            if (!map.has(s.listId)) {
                map.set(s.listId, { listName: s.listName, items: [] })
            }
            map.get(s.listId)!.items.push({ listId: s.listId, item: s.item })
        }
        return Array.from(map.values())
    }, [suggestions])

    return (
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
            <div className="flex items-start justify-between gap-4">
                <p className="text-amber-900 font-medium">
                    On past trips you added items that aren't in your question set yet. Want to save any for next time?
                </p>
                <button
                    type="button"
                    aria-label="Dismiss suggestions"
                    onClick={onDismiss}
                    className="text-amber-600 hover:text-amber-900 text-xl leading-none flex-shrink-0"
                >
                    ×
                </button>
            </div>
            {!isExpanded ? (
                <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="mt-2 text-sm text-amber-700 underline"
                    aria-label="Review suggestions"
                >
                    Review suggestions
                </button>
            ) : (
                <div className="mt-4 space-y-4">
                    {grouped.map(({ listName, items }) => (
                        <div key={listName}>
                            <p className="text-sm text-amber-700 font-semibold mb-2">From: {listName}</p>
                            <div className="space-y-2">
                                {items.map(({ listId, item }) => (
                                    <div key={item.id} className="flex items-center justify-between gap-2 bg-white rounded border border-amber-200 px-3 py-2">
                                        <div>
                                            <span className="font-medium text-gray-900">{item.itemText}</span>
                                            {item.personName && (
                                                <span className="ml-2 text-sm text-gray-500">for {item.personName}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-2 flex-shrink-0">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                onClick={() => onAlwaysInclude(listId, item)}
                                            >
                                                Always include
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={() => onSkip(listId, item)}
                                            >
                                                Skip
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function CreatePackingList() {
    const [questionSet, setQuestionSet] = useState<PackingListQuestionSet | null>(null)
    const [allPackingLists, setAllPackingLists] = useState<PackingList[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [noQuestionsFound, setNoQuestionsFound] = useState(false)
    const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>([])
    const [isSuggestionDismissed, setIsSuggestionDismissed] = useState(false)
    const { showToast } = useToast()
    const { isLoggedIn, login, session } = useSolidPod()
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
    const { db } = useDatabase()
    const navigate = useNavigate()

    const { register, handleSubmit, setValue, watch } = useForm<PackingListFormData>({
        defaultValues: {
            name: '',
            questionAnswers: []
        }
    })

    useEffect(() => {
        const fetchQuestionSet = async () => {
            if (!db) {
                setNoQuestionsFound(true)
                setIsLoading(false)
                return
            }
            setIsLoading(true)
            try {
                const [doc, lists] = await Promise.all([
                    db.getQuestionSet(),
                    db.getAllPackingLists(),
                ])
                setQuestionSet(doc)
                setAllPackingLists(lists)
                setNoQuestionsFound(false)
                setSelectedPeopleIds(doc.people.map(p => p.id))
            } catch (err: unknown) {
                const hasName = typeof err === 'object' && err !== null && 'name' in err
                if (hasName && (err as { name: string }).name === 'not_found') {
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
    }, [db, showToast])

    const suggestions = useMemo(
        () => questionSet ? getUnreviewedCustomItems(allPackingLists, questionSet) : [],
        [allPackingLists, questionSet]
    )

    const handleAlwaysInclude = async (listId: string, item: PackingListItem) => {
        if (!questionSet) return

        // Build personSelections for every person in the question set
        const personSelections = questionSet.people.map(p => ({
            personId: p.id,
            selected: p.name.toLowerCase() === item.personName.toLowerCase(),
        }))

        const updatedQs: PackingListQuestionSet = {
            ...questionSet,
            alwaysNeededItems: [
                ...questionSet.alwaysNeededItems,
                { text: item.itemText, personSelections },
            ],
        }
        const { rev } = await db.saveQuestionSet(updatedQs)
        setQuestionSet({ ...updatedQs, _rev: rev })

        // Mark reviewed on the packing list
        await markReviewed(listId, item)
    }

    const handleSkip = async (listId: string, item: PackingListItem) => {
        await markReviewed(listId, item)
    }

    const markReviewed = async (listId: string, item: PackingListItem) => {
        const list = allPackingLists.find(l => l.id === listId)
        if (!list) return
        const updatedList: PackingList = {
            ...list,
            items: list.items.map(i => i.id === item.id ? { ...i, reviewed: true } : i),
        }
        const { rev } = await db.savePackingList(updatedList)
        setAllPackingLists(prev => prev.map(l => l.id === listId ? { ...updatedList, _rev: rev } : l))
    }

    const onSubmit: SubmitHandler<PackingListFormData> = async (data) => {
        if (!questionSet) return

        // Get items from question answers
        const questionBasedItems = data.questionAnswers.flatMap((qa: { questionId: string; selectedOptionIds: string[] }) => {
            const questionId = qa.questionId
            const selectedOptionIds = qa.selectedOptionIds || []
            const question = questionSet.questions.find((q) => q.id === questionId)!

            // For each selected option, get all items
            return selectedOptionIds.flatMap((selectedOptionId) => {
                const selectedOption = question.options.find((option) => (option.id === selectedOptionId))!
                const packingListItems: PackingListItem[] = selectedOption.items.flatMap((item) => {
                    const selectedPeople = item.personSelections.filter((person) => (
                        person.selected && selectedPeopleIds.includes(person.personId)
                    ))
                    return selectedPeople.flatMap((person) => {
                        const personName = questionSet.people.find((p) => p.id === person.personId)!.name
                        return {
                            id: crypto.randomUUID(),
                            itemText: item.text,
                            personId: person.personId,
                            personName,
                            questionId: question.id,
                            optionId: selectedOption.id,
                            packed: false,
                            category: question.questionType === 'multiple-choice' ? selectedOption.text : question.text,
                        }
                    })
                })
                return packingListItems
            })
        })

        // Get always needed items
        const alwaysNeededItems = questionSet.alwaysNeededItems.flatMap((item) => {
            const selectedPeople = item.personSelections.filter((person) => (
                person.selected && selectedPeopleIds.includes(person.personId)
            ))
            return selectedPeople.flatMap((person) => {
                const personName = questionSet.people.find((p) => p.id === person.personId)!.name
                return {
                    id: crypto.randomUUID(),
                    itemText: item.text,
                    personId: person.personId,
                    personName,
                    questionId: 'always-needed',
                    optionId: 'always-needed',
                    packed: false,
                    category: 'Essentials',
                }
            })
        })

        const packingList: PackingList = {
            id: crypto.randomUUID(),
            name: data.name,
            createdAt: new Date().toISOString(),
            items: deduplicateItems([...questionBasedItems, ...alwaysNeededItems])
        }
        try {
            await db.savePackingList(packingList)
            if (isLoggedIn) {
                const podUrl = await getPrimaryPodUrl(session)
                if (podUrl) {
                    await saveFileToPod({
                        session: session!,
                        containerPath: `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`,
                        filename: `${packingList.id}.json`,
                        data: packingList,
                    })
                }
            }
            showToast('Packing list created successfully!', 'success')
            // Navigate to the newly created packing list
            navigate(`/view-lists/${packingList.id}`)
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
            <>
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
                                    <button
                                        className="text-sm font-semibold text-accent-700 underline hover:text-accent-900"
                                        onClick={() => setIsProviderSelectorOpen(true)}
                                    >
                                        Login with Solid Pod
                                    </button>
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
                <SolidProviderSelector
                    isOpen={isProviderSelectorOpen}
                    onClose={() => setIsProviderSelectorOpen(false)}
                    onSelect={(issuer) => login(issuer)}
                />
            </>
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

            {suggestions.length > 0 && !isSuggestionDismissed && (
                <div className="mb-6">
                    <SuggestionCard
                        suggestions={suggestions}
                        onAlwaysInclude={handleAlwaysInclude}
                        onSkip={handleSkip}
                        onDismiss={() => setIsSuggestionDismissed(true)}
                    />
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Input
                    label="Packing List Name"
                    placeholder="Enter a name for your packing list"
                    {...register('name', { required: true })}
                />

                {/* Person Selection */}
                {questionSet.people.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            Who is going on this trip?
                        </h3>
                        <div className="space-y-2">
                            {questionSet.people.map((person) => (
                                <label key={person.id} className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedPeopleIds.includes(person.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedPeopleIds([...selectedPeopleIds, person.id])
                                            } else {
                                                setSelectedPeopleIds(selectedPeopleIds.filter(id => id !== person.id))
                                            }
                                        }}
                                        className="h-4 w-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="text-gray-700">
                                        {person.name}
                                        {person.ageRange && (
                                            <span className="ml-2 text-sm text-gray-500">({person.ageRange})</span>
                                        )}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

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
