import { useState, useEffect } from 'react'
import { Question, Person, PersonSelection, Item } from './types'
import { CustomCreatableSelect } from '../components/CreatableSelect'
import { Button } from '../components/Button'

export type AddItemDestination =
    | { type: 'always' }
    | { type: 'option'; questionId: string; optionId: string }

interface AddItemModalProps {
    isOpen: boolean
    onClose: () => void
    questions: Question[]
    people: Person[]
    existingItemNames: string[]
    onConfirm: (destination: AddItemDestination, item: Item) => void
}

export function AddItemModal({ isOpen, onClose, questions, people, existingItemNames, onConfirm }: AddItemModalProps) {
    const [step, setStep] = useState<'destination' | 'details'>('destination')
    const [selectedDest, setSelectedDest] = useState<AddItemDestination | null>(null)
    const [destLabel, setDestLabel] = useState('')
    const [text, setText] = useState('')
    const [personSelections, setPersonSelections] = useState<PersonSelection[]>([])
    const [textError, setTextError] = useState(false)
    const [peopleError, setPeopleError] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setStep('destination')
            setSelectedDest(null)
            setDestLabel('')
            setText('')
            setPersonSelections(people.map(p => ({ personId: p.id, selected: false })))
            setTextError(false)
            setPeopleError(false)
        }
    }, [isOpen, people])

    function pickDestination(dest: AddItemDestination, label: string) {
        setSelectedDest(dest)
        setDestLabel(label)
        setStep('details')
    }

    const allSelected = personSelections.length > 0 && personSelections.every(s => s.selected)
    const anySelected = personSelections.some(s => s.selected)

    function handleToggleAll() {
        const next = !allSelected
        setPersonSelections(personSelections.map(s => ({ ...s, selected: next })))
        if (next) setPeopleError(false)
    }

    function handleTogglePerson(idx: number) {
        const updated = personSelections.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s)
        setPersonSelections(updated)
        if (updated.some(s => s.selected)) setPeopleError(false)
    }

    function handleTextChange(value: string) {
        setText(value)
        if (value.trim()) setTextError(false)
    }

    function handleConfirm() {
        if (!selectedDest) return
        const trimmed = text.trim()
        const missingText = !trimmed
        const missingPeople = people.length > 0 && !anySelected
        if (missingText) setTextError(true)
        if (missingPeople) setPeopleError(true)
        if (missingText || missingPeople) return
        onConfirm(selectedDest, { text: trimmed, personSelections })
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center sm:justify-center sm:p-8">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                className="relative flex flex-col w-full bg-white shadow-xl sm:rounded-lg sm:max-w-lg sm:h-[calc(100vh-8rem)]"
            >
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 sm:px-6">
                    {step === 'details' && (
                        <button
                            type="button"
                            onClick={() => setStep('destination')}
                            className="mr-2 text-gray-400 hover:text-gray-600 focus:outline-none"
                            aria-label="Back"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                    )}
                    <h3 className="text-lg font-semibold text-gray-900 flex-1 truncate">
                        {step === 'destination' ? 'Add Item — where?' : destLabel}
                    </h3>
                    <button
                        type="button"
                        className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                        onClick={onClose}
                    >
                        <span className="sr-only">Close</span>
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {step === 'destination' && (
                    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                        <DestButton onClick={() => pickDestination({ type: 'always' }, 'Always Needed Items')}>
                            Always Needed Items
                        </DestButton>
                        {questions.flatMap((q) =>
                            q.options.map((o) => (
                                <DestButton
                                    key={`${q.id}::${o.id}`}
                                    onClick={() => pickDestination(
                                        { type: 'option', questionId: q.id, optionId: o.id },
                                        `${q.text}: ${o.text}`
                                    )}
                                >
                                    <span className="text-gray-500">{q.text}:</span> {o.text}
                                </DestButton>
                            ))
                        )}
                    </div>
                )}

                {step === 'details' && (
                    <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
                        <div>
                            <CustomCreatableSelect
                                value={text}
                                onChange={handleTextChange}
                                options={existingItemNames}
                                placeholder="Enter item name"
                            />
                            {textError && (
                                <p className="text-sm text-red-600 mt-1">Please enter an item name.</p>
                            )}
                        </div>
                        {people.length > 0 && (
                            <PersonPicker
                                people={people}
                                personSelections={personSelections}
                                allSelected={allSelected}
                                onToggleAll={handleToggleAll}
                                onTogglePerson={handleTogglePerson}
                                error={peopleError}
                            />
                        )}
                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="button" onClick={handleConfirm}>Add Item</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function DestButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-800 hover:bg-gray-100 active:bg-gray-200 transition-colors"
        >
            {children}
        </button>
    )
}

interface PersonPickerProps {
    people: Person[]
    personSelections: PersonSelection[]
    allSelected: boolean
    onToggleAll: () => void
    onTogglePerson: (idx: number) => void
    error?: boolean
}

export function PersonPicker({ people, personSelections, allSelected, onToggleAll, onTogglePerson, error }: PersonPickerProps) {
    return (
        <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Who needs it?</div>
            {error && (
                <p className="text-sm text-red-600 mb-2">Please select at least one person.</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={onToggleAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border-2 border-primary-200 text-primary-700 bg-white hover:bg-primary-50 hover:border-primary-300 transition-all duration-200 focus:outline-none"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        {allSelected
                            ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        }
                    </svg>
                    {allSelected ? 'Unselect All' : 'Select All'}
                </button>
                {people.map((person, i) => {
                    const isSelected = personSelections[i]?.selected ?? false
                    return (
                        <button
                            key={person.id}
                            type="button"
                            onClick={() => onTogglePerson(i)}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                                isSelected
                                    ? 'bg-primary-50 border-primary-400 text-primary-900 shadow-sm'
                                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                            {person.name}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
