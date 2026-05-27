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
    if (!isOpen) return null

    function pick(destination: AddItemDestination) {
        onConfirm(destination)
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center sm:justify-center sm:p-8">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                className="relative flex flex-col w-full bg-white shadow-xl sm:rounded-lg sm:max-w-lg sm:h-[calc(100vh-8rem)]"
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
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
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
