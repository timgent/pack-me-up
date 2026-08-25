import { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { QuestionSetChange, QuestionSetChangeType } from '../create-packing-list/updateFromQuestions'

interface UpdateFromQuestionsModalProps {
    isOpen: boolean
    onClose: () => void
    changes: QuestionSetChange[]
    onConfirm: (selected: QuestionSetChange[]) => void
}

interface Section {
    type: QuestionSetChangeType | 'changed'
    title: string
    hint?: string
    changes: QuestionSetChange[]
}

/**
 * Adding and correcting are what the user came for, so they arrive ticked.
 * Removing is the one kind that takes something away, and an item leaving your
 * questions is not the same as you being finished with it on this trip — a
 * one-off you added an option for, a thing you pack anyway. So those arrive
 * unticked and are opted into one at a time.
 */
function startsSelected(change: QuestionSetChange): boolean {
    return change.type !== 'remove'
}

/** Shared items first, then people alphabetically, so the list reads the same way twice. */
function byOwner(a: QuestionSetChange, b: QuestionSetChange): number {
    if (!a.personName !== !b.personName) return a.personName ? 1 : -1
    return a.personName.localeCompare(b.personName) || a.itemText.localeCompare(b.itemText)
}

function verbFor(type: QuestionSetChangeType | 'changed'): string {
    if (type === 'add') return 'Add'
    if (type === 'remove') return 'Remove'
    return 'Update'
}

export function UpdateFromQuestionsModal({
    isOpen,
    onClose,
    changes,
    onConfirm,
}: UpdateFromQuestionsModalProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // A fresh diff is a fresh set of choices; the previous run's ticks belong to
    // items that may not even be in this one.
    useEffect(() => {
        setSelectedIds(new Set(changes.filter(startsSelected).map(change => change.id)))
    }, [changes])

    const sections = useMemo<Section[]>(() => {
        const of = (...types: QuestionSetChangeType[]) =>
            changes.filter(change => types.includes(change.type)).sort(byOwner)
        return ([
            { type: 'add', title: 'New items', changes: of('add') },
            { type: 'changed', title: 'Changed items', changes: of('update', 'sharing') },
            {
                type: 'remove',
                title: 'No longer in your questions',
                hint: 'These came from your questions and no longer do. Nothing is removed unless you tick it.',
                changes: of('remove'),
            },
        ] satisfies Section[]).filter(section => section.changes.length > 0)
    }, [changes])

    const selected = changes.filter(change => selectedIds.has(change.id))
    const onlyAdding = selected.length > 0 && selected.every(change => change.type === 'add')

    const toggle = (id: string) => {
        setSelectedIds(previous => {
            const next = new Set(previous)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Update from questions">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Your questions have changed since this list was made. Choose what to bring across.
            </p>
            <div className="max-h-96 overflow-y-auto space-y-5">
                {sections.map(section => (
                    <div key={section.title}>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{section.title}</p>
                        {section.hint && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">{section.hint}</p>
                        )}
                        <div className={`space-y-1 ${section.hint ? '' : 'mt-2'}`}>
                            {section.changes.map(change => (
                                <label
                                    key={change.id}
                                    className="flex items-start gap-3 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        aria-label={`${verbFor(change.type)} ${change.itemText}${change.personName ? ` for ${change.personName}` : ''}`}
                                        checked={selectedIds.has(change.id)}
                                        onChange={() => toggle(change.id)}
                                        className="mt-1 h-4 w-4 text-blue-600 dark:text-blue-400 rounded focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="min-w-0">
                                        <span className="text-gray-900 dark:text-gray-100">{change.itemText}</span>
                                        {change.additions[0]?.quantity !== undefined && change.type === 'add' && (
                                            <span className="ml-1.5 text-sm text-gray-500 dark:text-gray-400">×{change.additions[0].quantity}</span>
                                        )}
                                        {change.personName && (
                                            <span className="ml-1.5 text-sm text-gray-500 dark:text-gray-400">for {change.personName}</span>
                                        )}
                                        {change.detail && (
                                            <span className="block text-xs text-gray-500 dark:text-gray-400">{change.detail}</span>
                                        )}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    variant="primary"
                    onClick={() => onConfirm(selected)}
                    disabled={selected.length === 0}
                >
                    {selected.length === 0
                        ? 'Update list'
                        : onlyAdding
                            ? `Add ${selected.length} item${selected.length === 1 ? '' : 's'}`
                            : `Apply ${selected.length} change${selected.length === 1 ? '' : 's'}`}
                </Button>
            </div>
        </Modal>
    )
}
