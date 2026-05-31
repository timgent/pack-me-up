import { useState, useEffect } from 'react'
import { useDatabase } from '../components/DatabaseContext'
import { PackingListQuestionSet, Person, Item, Option, Question } from '../edit-questions/types'
import { Link } from 'react-router-dom'


function ROItem({ item, people }: { item: Item; people: Person[] }) {
    const selectedPeople = people.filter((_, i) => item.personSelections?.[i]?.selected ?? false)
    return (
        <div className="flex items-center gap-2 py-1 px-2 text-sm">
            {selectedPeople.length > 0 && (
                <div className="flex gap-1 flex-wrap shrink-0">
                    {selectedPeople.map(person => (
                        <span
                            key={person.id}
                            className="inline-flex items-center px-2 py-0.5 text-xs rounded-lg border-2 select-none bg-primary-50 border-primary-400 text-primary-900"
                        >
                            {person.name}
                        </span>
                    ))}
                </div>
            )}
            <span className={`flex-1 min-w-0 ${item.text ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                {item.text || 'no text'}
            </span>
        </div>
    )
}

function ROOptionSection({ option, optionIndex, people }: { option: Option; optionIndex: number; people: Person[] }) {
    const [isExpanded, setIsExpanded] = useState(false)
    return (
        <div className="bg-gray-50 rounded-lg p-3">
            <button
                type="button"
                onClick={() => setIsExpanded(e => !e)}
                className={`flex items-center gap-3 w-full text-left${isExpanded ? ' mb-2' : ''}`}
            >
                <svg
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-sm font-medium text-gray-800 flex-1">
                    Option {optionIndex + 1}{option.text ? `: ${option.text}` : ''}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">{option.items.length} items</span>
            </button>
            <div className={`ml-7 space-y-0.5${isExpanded ? '' : ' hidden'}`}>
                {option.items.map((item, i) => (
                    <ROItem key={i} item={item} people={people} />
                ))}
            </div>
        </div>
    )
}

function ROQuestionSection({ question, people }: { question: Question; people: Person[] }) {
    const [isExpanded, setIsExpanded] = useState(true)
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <button
                type="button"
                onClick={() => setIsExpanded(e => !e)}
                className="flex items-center gap-3 w-full text-left p-4 sm:p-6 hover:bg-gray-50 transition-colors duration-150"
            >
                <svg
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="font-medium text-gray-900 flex-1 text-left">
                    {question.text || <em className="text-gray-400 font-normal">Untitled question</em>}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">{question.options.length} options</span>
            </button>
            <div className={isExpanded ? 'px-4 sm:px-6 pb-4 sm:pb-6 space-y-2' : 'hidden'}>
                {question.options.map((option, oi) => (
                    <ROOptionSection key={oi} option={option} optionIndex={oi} people={people} />
                ))}
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

export function ReadonlyQuestionsPage() {
    const { db } = useDatabase()
    const [data, setData] = useState<PackingListQuestionSet | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        db.getQuestionSet()
            .then(setData)
            .catch((err) => {
                if (err?.name === 'not_found') setData({ _id: '1', questions: [], people: [], alwaysNeededItems: [] })
                else setError(String(err))
            })
    }, [db])

    if (error) return <div className="p-8 text-red-600">Error: {error}</div>
    if (!data) return <div className="p-8 text-gray-500">Loading…</div>

    const people = data.people ?? []

    return (
        <div className="w-full flex flex-col items-center py-8 px-4">
            <div className="w-full max-w-3xl space-y-4">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">My Questions</h1>
                    <Link to="/manage-questions" className="text-sm text-primary-600 hover:underline">
                        Edit questions
                    </Link>
                </div>
                <ROAlwaysSection items={data.alwaysNeededItems ?? []} people={people} />
                {data.questions.map((q, qi) => (
                    <ROQuestionSection key={qi} question={q} people={people} />
                ))}
            </div>
        </div>
    )
}
