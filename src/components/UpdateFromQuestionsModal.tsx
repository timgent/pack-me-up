import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { PackingListItem } from '../create-packing-list/types'

interface UpdateFromQuestionsModalProps {
    isOpen: boolean
    onClose: () => void
    additions: PackingListItem[]
    onConfirm: (selected: PackingListItem[]) => void
}

// Groups additions by traveller for the preview, communal ("Shared items")
// first, then people alphabetically.
function groupAdditions(additions: PackingListItem[]): Array<{ label: string; items: PackingListItem[] }> {
    const shared: PackingListItem[] = []
    const byPerson = new Map<string, PackingListItem[]>()
    for (const item of additions) {
        if (item.communal || item.personId === '') {
            shared.push(item)
        } else {
            const key = item.personName || 'Unassigned'
            if (!byPerson.has(key)) byPerson.set(key, [])
            byPerson.get(key)!.push(item)
        }
    }
    const groups: Array<{ label: string; items: PackingListItem[] }> = []
    if (shared.length > 0) groups.push({ label: 'Shared items', items: shared })
    for (const label of [...byPerson.keys()].sort((a, b) => a.localeCompare(b))) {
        groups.push({ label, items: byPerson.get(label)! })
    }
    return groups
}

export function UpdateFromQuestionsModal({
    isOpen,
    onClose,
    additions,
    onConfirm,
}: UpdateFromQuestionsModalProps) {
    // All additions start selected; the user unchecks any they don't want.
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())

    const groups = useMemo(() => groupAdditions(additions), [additions])
    const selectedCount = additions.length - excludedIds.size

    const toggle = (id: string) => {
        setExcludedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleConfirm = () => {
        onConfirm(additions.filter(item => !excludedIds.has(item.id)))
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Update from questions">
            <p className="text-sm text-gray-600 mb-4">
                Your questions have new items that match this trip. Choose which to add.
            </p>
            <div className="max-h-96 overflow-y-auto space-y-4">
                {groups.map(group => (
                    <div key={group.label}>
                        <p className="text-sm font-semibold text-gray-700 mb-2">{group.label}</p>
                        <div className="space-y-1">
                            {group.items.map(item => (
                                <label key={item.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        aria-label={`Add ${item.itemText}${item.personName ? ` for ${item.personName}` : ''}`}
                                        checked={!excludedIds.has(item.id)}
                                        onChange={() => toggle(item.id)}
                                        className="h-4 w-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="text-gray-900">
                                        {item.itemText}
                                        {item.quantity !== undefined && (
                                            <span className="ml-1.5 text-sm text-gray-500">×{item.quantity}</span>
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
                    onClick={handleConfirm}
                    disabled={selectedCount === 0}
                >
                    {selectedCount > 0 ? `Add ${selectedCount} item${selectedCount === 1 ? '' : 's'}` : 'Add items'}
                </Button>
            </div>
        </Modal>
    )
}
