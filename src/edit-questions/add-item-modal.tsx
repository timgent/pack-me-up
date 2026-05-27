import { useState, useEffect } from 'react'
import { Modal } from '../components/Modal'
import { Button } from '../components/Button'
import { Question } from './types'

export type AddItemDestination =
    | { type: 'always' }
    | { type: 'option'; questionId: string; optionId: string }

interface AddItemModalProps {
    isOpen: boolean
    onClose: () => void
    questions: Question[]
    onConfirm: (destination: AddItemDestination) => void
}

export function AddItemModal({ isOpen, onClose, questions, onConfirm }: AddItemModalProps) {
    const [selectedValue, setSelectedValue] = useState('always')

    useEffect(() => {
        if (isOpen) setSelectedValue('always')
    }, [isOpen])

    function handleConfirm() {
        let destination: AddItemDestination
        if (selectedValue === 'always') {
            destination = { type: 'always' }
        } else {
            const [questionId, optionId] = selectedValue.split('::')
            destination = { type: 'option', questionId, optionId }
        }
        onConfirm(destination)
        onClose()
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Item">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Add to
                    </label>
                    <select
                        value={selectedValue}
                        onChange={(e) => setSelectedValue(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="always">Always Needed Items</option>
                        {questions.flatMap((q) =>
                            q.options.map((o) => (
                                <option key={`${q.id}::${o.id}`} value={`${q.id}::${o.id}`}>
                                    {q.text}: {o.text}
                                </option>
                            ))
                        )}
                    </select>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleConfirm}>
                        Confirm
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
