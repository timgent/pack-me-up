import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useDatabase } from '../components/DatabaseContext'
import { PackingListQuestionSet, Person, Item, Option, Question, QuestionType, newDraftQuestion } from '../edit-questions/types'
import { Link } from 'react-router-dom'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'
import { usePodSync } from '../hooks/usePodSync'
import { POD_CONTAINERS } from '../services/solidPod'
import { questionSetToDataset, datasetToQuestionSet } from '../services/rdfSerialization'
import { useSolidPod } from '../components/SolidPodContext'
import { CustomCreatableSelect } from '../components/CreatableSelect'

// One distinct colour per person slot (by index). Tailwind classes must be literal strings.
const AVATAR_ON = [
    'bg-blue-500 text-white',
    'bg-violet-500 text-white',
    'bg-emerald-500 text-white',
    'bg-amber-500 text-white',
    'bg-rose-500 text-white',
    'bg-cyan-500 text-white',
]
const AVATAR_OFF = 'bg-gray-100 text-gray-300'

function PersonDot({ person, index, selected }: { person: Person; index: number; selected: boolean }) {
    return (
        <span
            title={person.name}
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold select-none shrink-0 ${selected ? AVATAR_ON[index % AVATAR_ON.length] : AVATAR_OFF}`}
        >
            {person.name.charAt(0).toUpperCase()}
        </span>
    )
}

function PersonLegend({ people }: { people: Person[] }) {
    if (people.length < 2) return null
    return (
        <div className="flex items-center gap-2 flex-wrap mb-4">
            {people.map((person, i) => (
                <span key={person.id} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${AVATAR_ON[i % AVATAR_ON.length]}`}>
                        {person.name.charAt(0).toUpperCase()}
                    </span>
                    {person.name}
                </span>
            ))}
        </div>
    )
}

function ROItem({ item, people }: { item: Item; people: Person[] }) {
    const showDots = people.length > 1
    return (
        <div className="flex items-center gap-2 py-0.5 px-2 text-sm">
            <span className={`flex-1 min-w-0 ${item.text ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                {item.text || 'no text'}
            </span>
            {showDots && (
                <div className="flex gap-0.5 shrink-0">
                    {people.map((person, i) => (
                        <PersonDot
                            key={person.id}
                            person={person}
                            index={i}
                            selected={item.personSelections?.[i]?.selected ?? false}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function ROOptionSection({ option, optionIndex, people, onEdit, onDelete }: {
    option: Option
    optionIndex: number
    people: Person[]
    onEdit: () => void
    onDelete: () => void
}) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    return (
        <div className="bg-gray-50 rounded-lg p-3">
            <div className={`flex items-center${isExpanded ? ' mb-2' : ''}`}>
                <button
                    type="button"
                    onClick={() => setIsExpanded(e => !e)}
                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                >
                    <svg
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="text-sm font-medium text-gray-800 flex-1 min-w-0">
                        Option {optionIndex + 1}{option.text ? `: ${option.text}` : ''}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0 mr-1">{option.items.length} items</span>
                </button>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                    {confirmDelete ? (
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">Delete?</span>
                            <button
                                type="button"
                                onClick={() => { onDelete(); setConfirmDelete(false) }}
                                className="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                                Yes
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                className="px-2 py-0.5 text-xs text-gray-500 rounded hover:bg-gray-100"
                            >
                                No
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onEdit}
                                className="p-1 text-gray-300 hover:text-gray-600 rounded"
                                title="Edit option"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(true)}
                                className="p-1 text-gray-300 hover:text-red-400 rounded"
                                title="Delete option"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </>
                    )}
                </div>
            </div>
            <div className={`space-y-0.5${isExpanded ? '' : ' hidden'}`}>
                {option.items.map((item, i) => (
                    <ROItem key={i} item={item} people={people} />
                ))}
            </div>
        </div>
    )
}

function ROQuestionSection({ question, people, onEdit, onDelete, onAddOption, onEditOption, onDeleteOption }: {
    question: Question
    people: Person[]
    onEdit: () => void
    onDelete: () => void
    onAddOption: () => void
    onEditOption: (option: Option) => void
    onDeleteOption: (optionId: string) => void
}) {
    const [isExpanded, setIsExpanded] = useState(true)
    const [confirmDelete, setConfirmDelete] = useState(false)
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex items-stretch">
                <button
                    type="button"
                    onClick={() => setIsExpanded(e => !e)}
                    className="flex items-center gap-3 flex-1 text-left px-4 py-4 sm:px-6 min-w-0 hover:bg-gray-50 transition-colors duration-150"
                >
                    <svg
                        className={`w-5 h-5 text-gray-400 flex-shrink-0 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="font-medium text-gray-900 flex-1 min-w-0">
                        {question.text || <em className="text-gray-400 font-normal">Untitled question</em>}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0 mr-2">{question.options.length} options</span>
                </button>
                <div className="flex items-center gap-0.5 pr-3 flex-shrink-0">
                    {confirmDelete ? (
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">Delete?</span>
                            <button
                                type="button"
                                onClick={() => { onDelete(); setConfirmDelete(false) }}
                                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                                Yes
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                className="px-2 py-1 text-xs text-gray-500 rounded hover:bg-gray-100"
                            >
                                No
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onEdit}
                                className="p-1.5 text-gray-300 hover:text-gray-600 rounded"
                                title="Edit question"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(true)}
                                className="p-1.5 text-gray-300 hover:text-red-400 rounded"
                                title="Delete question"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </>
                    )}
                </div>
            </div>
            <div className={isExpanded ? 'px-4 sm:px-6 pb-4 sm:pb-6 space-y-2' : 'hidden'}>
                {question.options.map((option, oi) => (
                    <ROOptionSection
                        key={option.id}
                        option={option}
                        optionIndex={oi}
                        people={people}
                        onEdit={() => onEditOption(option)}
                        onDelete={() => onDeleteOption(option.id)}
                    />
                ))}
                <button
                    type="button"
                    onClick={onAddOption}
                    className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                >
                    + Add Option
                </button>
            </div>
        </div>
    )
}

function ROAlwaysSection({ items, people }: { items: Item[]; people: Person[] }) {
    const [isExpanded, setIsExpanded] = useState(false)
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <button
                type="button"
                onClick={() => setIsExpanded(e => !e)}
                className="flex items-center gap-2 w-full text-left"
            >
                <svg
                    className={`w-5 h-5 text-gray-400 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="font-medium text-gray-900">
                    Always Needed Items <span className="text-sm font-normal text-gray-500">({items.length} items)</span>
                </span>
            </button>
            <div className={`mt-3 space-y-1${isExpanded ? '' : ' hidden'}`}>
                {items.map((item, i) => (
                    <ROItem key={i} item={item} people={people} />
                ))}
            </div>
        </div>
    )
}

function OptionEditModal({ option, people, allItemNames, onSave, onClose }: {
    option: Option | null
    people: Person[]
    allItemNames: string[]
    onSave: (updated: Option) => void
    onClose: () => void
}) {
    const [text, setText] = useState(option?.text ?? '')
    const [items, setItems] = useState<Item[]>(option?.items ?? [])
    const itemsScrollRef = useRef<HTMLDivElement>(null)
    const prevItemCountRef = useRef(items.length)

    useEffect(() => {
        if (items.length > prevItemCountRef.current) {
            requestAnimationFrame(() => {
                itemsScrollRef.current?.scrollTo({ top: itemsScrollRef.current.scrollHeight, behavior: 'smooth' })
            })
        }
        prevItemCountRef.current = items.length
    }, [items.length])

    const updateItemText = (idx: number, newText: string) => {
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, text: newText } : item))
    }

    const togglePerson = (itemIdx: number, personIdx: number) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== itemIdx) return item
            const selections = people.map((p, pi) => ({
                personId: p.id,
                selected: item.personSelections?.[pi]?.selected ?? false,
            }))
            selections[personIdx] = { ...selections[personIdx], selected: !selections[personIdx].selected }
            return { ...item, personSelections: selections }
        }))
    }

    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx))
    }

    const addItem = () => {
        setItems(prev => [...prev, {
            text: '',
            personSelections: people.map(p => ({ personId: p.id, selected: true })),
        }])
    }

    const handleSave = () => {
        onSave({
            id: option?.id ?? crypto.randomUUID(),
            order: option?.order ?? 0,
            text: text.trim(),
            items,
        })
    }

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        >
            <div
                className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-gray-100 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">
                        {option ? 'Edit Option' : 'Add Option'}
                    </h2>
                    <input
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        type="text"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Option text (e.g. Yes)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        onKeyDown={e => { if (e.key === 'Enter') addItem() }}
                    />
                    {people.length > 1 && (
                        <div className="flex items-center gap-3 flex-wrap mt-3">
                            {people.map((person, i) => (
                                <span key={person.id} className="flex items-center gap-1 text-xs text-gray-400">
                                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${AVATAR_ON[i % AVATAR_ON.length]}`}>
                                        {person.name.charAt(0).toUpperCase()}
                                    </span>
                                    {person.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div ref={itemsScrollRef} className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
                    {items.length > 0 && (
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                            Items
                        </div>
                    )}
                    <div className="space-y-2">
                        {items.map((item, itemIdx) => (
                            <div key={itemIdx} className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                    <CustomCreatableSelect
                                        value={item.text}
                                        onChange={val => updateItemText(itemIdx, val)}
                                        options={allItemNames}
                                        placeholder="Item name"
                                        menuPortalTarget={document.body}
                                    />
                                </div>
                                {people.length > 1 && (
                                    <div className="flex gap-0.5 shrink-0">
                                        {people.map((person, personIdx) => {
                                            const selected = item.personSelections?.[personIdx]?.selected ?? false
                                            return (
                                                <button
                                                    key={person.id}
                                                    type="button"
                                                    onClick={() => togglePerson(itemIdx, personIdx)}
                                                    title={person.name}
                                                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors ${selected ? AVATAR_ON[personIdx % AVATAR_ON.length] : AVATAR_OFF}`}
                                                >
                                                    {person.name.charAt(0).toUpperCase()}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeItem(itemIdx)}
                                    className="shrink-0 text-gray-300 hover:text-red-400 text-xl leading-none"
                                    title="Remove item"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={addItem}
                        className="mt-3 w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    >
                        + Add Item
                    </button>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 flex gap-2 justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        {option ? 'Save changes' : 'Add option'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function QuestionModal({ question, onSave, onClose }: {
    question: Question | null
    onSave: (text: string, type: QuestionType) => void
    onClose: () => void
}) {
    const [text, setText] = useState(question?.text ?? '')
    const [type, setType] = useState<QuestionType>(question?.questionType ?? 'single-choice')

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        >
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-5">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                        {question ? 'Edit Question' : 'Add Question'}
                    </h2>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Question text</label>
                    <input
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        type="text"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="e.g. Are you going to a hot climate?"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                        onKeyDown={e => { if (e.key === 'Enter' && text.trim()) onSave(text.trim(), type) }}
                    />
                    <label className="block text-sm font-medium text-gray-700 mb-2">Answer type</label>
                    <div className="flex gap-2 mb-5">
                        {(['single-choice', 'multiple-choice'] as QuestionType[]).map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setType(t)}
                                className={`flex-1 py-2 rounded-lg text-sm border-2 transition-colors ${type === t ? 'border-primary-400 bg-primary-50 text-primary-900 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                            >
                                {t === 'single-choice' ? 'Single choice' : 'Multiple choice'}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => onSave(text.trim(), type)}
                            disabled={!text.trim()}
                            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {question ? 'Save changes' : 'Add question'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function ReadonlyQuestionsPage() {
    const { db } = useDatabase()
    const { isLoggedIn } = useSolidPod()
    const [data, setData] = useState<PackingListQuestionSet | null>(null)
    const [rev, setRev] = useState<string | undefined>(undefined)
    const [error, setError] = useState<string | null>(null)
    const [questionModal, setQuestionModal] = useState<{ question: Question | null } | null>(null)
    const [optionModal, setOptionModal] = useState<{ questionId: string; option: Option | null } | null>(null)

    const { saveWithSyncPrevention } = useSyncCoordinator<PackingListQuestionSet>({
        currentData: data,
        saveToLocalDb: async (d) => db.saveQuestionSet({ _id: '1', ...d, _rev: rev }),
        updateFormAndState: (d, newRev) => {
            setRev(newRev)
            setData({ ...d, _rev: newRev })
        },
    })

    const { saveToPod } = usePodSync<PackingListQuestionSet>({
        pathConfig: { container: POD_CONTAINERS.ROOT, filename: 'packing-list-questions.ttl' },
        rdf: { serialize: questionSetToDataset, deserialize: datasetToQuestionSet },
        enabled: isLoggedIn,
    })

    useEffect(() => {
        db.getQuestionSet()
            .then(d => { setData(d); setRev(d._rev) })
            .catch((err) => {
                if (err?.name === 'not_found') setData({ _id: '1', questions: [], people: [], alwaysNeededItems: [] })
                else setError(String(err))
            })
    }, [db])

    const saveData = useCallback(async (updated: PackingListQuestionSet) => {
        setData(updated)
        const saved = await saveWithSyncPrevention(updated, saveToPod)
        if (saved) setData(saved)
        else setData(data)
    }, [data, saveWithSyncPrevention, saveToPod])

    const handleQuestionModalSave = useCallback(async (text: string, type: QuestionType) => {
        if (!data || questionModal === null) return
        const questions = data.questions ?? []
        let newQuestions: Question[]
        if (questionModal.question) {
            newQuestions = questions.map(q =>
                q.id === questionModal.question!.id ? { ...q, text, questionType: type } : q
            )
        } else {
            const maxOrder = questions.reduce((max, q) => Math.max(max, q.order), -1)
            newQuestions = [...questions, { ...newDraftQuestion(maxOrder + 1), text, questionType: type }]
        }
        setQuestionModal(null)
        await saveData({ ...data, questions: newQuestions })
    }, [data, questionModal, saveData])

    const handleDeleteQuestion = useCallback(async (id: string) => {
        if (!data) return
        await saveData({ ...data, questions: data.questions.filter(q => q.id !== id) })
    }, [data, saveData])

    const handleOptionModalSave = useCallback(async (updatedOption: Option) => {
        if (!data || optionModal === null) return
        const newQuestions = data.questions.map(q => {
            if (q.id !== optionModal.questionId) return q
            let newOptions: Option[]
            if (optionModal.option) {
                newOptions = q.options.map(o =>
                    o.id === optionModal.option!.id ? updatedOption : o
                )
            } else {
                const maxOrder = q.options.reduce((max, o) => Math.max(max, o.order), -1)
                newOptions = [...q.options, { ...updatedOption, order: maxOrder + 1 }]
            }
            return { ...q, options: newOptions }
        })
        setOptionModal(null)
        await saveData({ ...data, questions: newQuestions })
    }, [data, optionModal, saveData])

    const handleDeleteOption = useCallback(async (questionId: string, optionId: string) => {
        if (!data) return
        const newQuestions = data.questions.map(q =>
            q.id === questionId ? { ...q, options: q.options.filter(o => o.id !== optionId) } : q
        )
        await saveData({ ...data, questions: newQuestions })
    }, [data, saveData])

    const allItemNames = useMemo(() => {
        if (!data) return []
        const names = [
            ...(data.alwaysNeededItems ?? []).map(i => i.text),
            ...data.questions.flatMap(q => q.options.flatMap(o => o.items.map(i => i.text))),
        ].filter(Boolean)
        return [...new Set(names)]
    }, [data])

    if (error) return <div className="p-8 text-red-600">Error: {error}</div>
    if (!data) return <div className="p-8 text-gray-500">Loading…</div>

    const people = data.people ?? []

    return (
        <div className="w-full flex flex-col items-center py-8 px-4">
            <div className="w-full max-w-3xl space-y-4">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-2xl font-bold text-gray-900">My Questions</h1>
                    <Link to="/manage-questions" className="text-sm text-primary-600 hover:underline">
                        Edit questions
                    </Link>
                </div>
                <PersonLegend people={people} />
                <ROAlwaysSection items={data.alwaysNeededItems ?? []} people={people} />
                {data.questions.map((q) => (
                    <ROQuestionSection
                        key={q.id}
                        question={q}
                        people={people}
                        onEdit={() => setQuestionModal({ question: q })}
                        onDelete={() => handleDeleteQuestion(q.id)}
                        onAddOption={() => setOptionModal({ questionId: q.id, option: null })}
                        onEditOption={(option) => setOptionModal({ questionId: q.id, option })}
                        onDeleteOption={(optionId) => handleDeleteOption(q.id, optionId)}
                    />
                ))}
                <button
                    type="button"
                    onClick={() => setQuestionModal({ question: null })}
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                >
                    + Add Question
                </button>
            </div>
            {questionModal !== null && (
                <QuestionModal
                    question={questionModal.question}
                    onSave={handleQuestionModalSave}
                    onClose={() => setQuestionModal(null)}
                />
            )}
            {optionModal !== null && (
                <OptionEditModal
                    option={optionModal.option}
                    people={people}
                    allItemNames={allItemNames}
                    onSave={handleOptionModalSave}
                    onClose={() => setOptionModal(null)}
                />
            )}
        </div>
    )
}
