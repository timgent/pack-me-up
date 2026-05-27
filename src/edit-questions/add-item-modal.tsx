import { Modal } from '../components/Modal'
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
    function pick(destination: AddItemDestination) {
        onConfirm(destination)
        onClose()
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Item">
            <div className="space-y-1 max-h-72 overflow-y-auto -mx-2">
                <DestButton onClick={() => pick({ type: 'always' })}>
                    Always Needed Items
                </DestButton>
                {questions.flatMap((q) =>
                    q.options.map((o) => (
                        <DestButton
                            key={`${q.id}::${o.id}`}
                            onClick={() => pick({ type: 'option', questionId: q.id, optionId: o.id })}
                        >
                            <span className="text-gray-500">{q.text}:</span> {o.text}
                        </DestButton>
                    ))
                )}
            </div>
        </Modal>
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
