import { useState, useEffect } from 'react'
import { useDatabase } from '../components/DatabaseContext'
import { PackingListQuestionSet, Person, Item, Option, Question } from '../edit-questions/types'
import { Link } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Diagnostic read-only page — no react-hook-form, no Controllers, no react-select.
// Purpose: isolate whether expand/collapse slowness comes from form overhead
// or from browser layout of the item DOM.
// ---------------------------------------------------------------------------

function ROItem({ item, people }: { item: Item; people: Person[] }) {
    return (
        <div className="flex items-start gap-2 py-1 px-2 text-sm">
            {people.length > 0 && (
                <div className="flex gap-1 flex-wrap shrink-0">
                    {people.map((person, i) => {
                        const selected = item.personSelections?.[i]?.selected ?? false
                        return (
                            <span
                                key={person.id}
                                className={`inline-flex items-center px-2 py-0.5 text-xs rounded-lg border-2 select-none ${
                                    selected
                                        ? 'bg-primary-50 border-primary-400 text-primary-900'
                                        : 'bg-white border-gray-200 text-gray-400'
                                }`}
                            >
                                {person.name}
                            </span>
                        )
                    })}
                </div>
            )}
            <span className={item.text ? 'text-gray-700' : 'text-gray-400 italic'}>
                {item.text || 'empty'}
            </span>
        </div>
    )
}

function ROOptionSection({ option, optionIndex, people }: { option: Option; optionIndex: number; people: Person[] }) {
    const [isExpanded, setIsExpanded] = useState(false)
    return (
        <div className="bg-gray-50 rounded-lg p-4">
            <div className={`flex items-center gap-3 ${isExpanded ? 'mb-3' : ''}`}>
                <button
                    type="button"
                    onClick={() => setIsExpanded(e => !e)}
                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                >
                    <svg
                        className={`w-5 h-5 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <span className="text-sm font-medium text-gray-800 flex-1">
                    Option {optionIndex + 1}: {option.text || <em className="text-gray-400">untitled</em>}
                </span>
                <span className="text-xs text-gray-400">{option.items.length} items</span>
            </div>
            <div className={`ml-4 space-y-1${isExpanded ? '' : ' hidden'}`}>
                {option.items.map((item, i) => (
                    <ROItem key={i} item={item} people={people} />
                ))}
            </div>
        </div>
    )
}

function ROQuestionSection({ question, questionIndex, people }: { question: Question; questionIndex: number; people: Person[] }) {
    const [isExpanded, setIsExpanded] = useState(true)
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                    <button
                        type="button"
                        onClick={() => setIsExpanded(e => !e)}
                        className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        <svg
                            className={`w-5 h-5 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <span className="font-medium text-gray-900 flex-1">
                        Q{questionIndex + 1}: {question.text || <em className="text-gray-400">untitled</em>}
                    </span>
                </div>
                <div className={isExpanded ? 'space-y-3' : 'hidden'}>
                    {question.options.map((option, oi) => (
                        <ROOptionSection key={oi} option={option} optionIndex={oi} people={people} />
                    ))}
                </div>
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
                    <h1 className="text-2xl font-bold text-gray-900">Questions (read-only diagnostic)</h1>
                    <Link to="/manage-questions" className="text-sm text-primary-600 hover:underline">
                        ← Back to edit
                    </Link>
                </div>
                <ROAlwaysSection items={data.alwaysNeededItems ?? []} people={people} />
                {data.questions.map((q, qi) => (
                    <ROQuestionSection key={qi} question={q} questionIndex={qi} people={people} />
                ))}
            </div>
        </div>
    )
}
