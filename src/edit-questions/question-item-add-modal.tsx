import { useState, useEffect } from 'react'
import { Person, PersonSelection, Item } from './types'
import { CustomCreatableSelect } from '../components/CreatableSelect'
import { Button } from '../components/Button'
import { PersonPicker } from './add-item-modal'

interface QuestionItemAddModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (item: Item) => void
    existingItemNames: string[]
    people: Person[]
}

export function QuestionItemAddModal({ isOpen, onClose, onConfirm, existingItemNames, people }: QuestionItemAddModalProps) {
    const [text, setText] = useState('')
    const [personSelections, setPersonSelections] = useState<PersonSelection[]>([])

    useEffect(() => {
        if (isOpen) {
            setText('')
            setPersonSelections(people.map(p => ({ personId: p.id, selected: false })))
        }
    }, [isOpen, people])

    const allSelected = personSelections.length > 0 && personSelections.every(s => s.selected)

    function handleToggleAll() {
        const next = !allSelected
        setPersonSelections(personSelections.map(s => ({ ...s, selected: next })))
    }

    function handleTogglePerson(idx: number) {
        setPersonSelections(personSelections.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s))
    }

    function handleConfirm() {
        const trimmed = text.trim()
        if (!trimmed) return
        onConfirm({ text: trimmed, personSelections })
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-8">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                className="relative flex flex-col w-full bg-white shadow-xl sm:rounded-lg sm:max-w-lg"
            >
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 sm:px-6">
                    <h3 className="text-lg font-semibold text-gray-900">Add Item</h3>
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
                <div className="px-4 py-4 sm:px-6 space-y-4">
                    <CustomCreatableSelect
                        value={text}
                        onChange={setText}
                        options={existingItemNames}
                        placeholder="Enter item name"
                    />
                    {people.length > 0 && (
                        <PersonPicker
                            people={people}
                            personSelections={personSelections}
                            allSelected={allSelected}
                            onToggleAll={handleToggleAll}
                            onTogglePerson={handleTogglePerson}
                        />
                    )}
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="button" onClick={handleConfirm} disabled={!text.trim()}>Add Item</Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
