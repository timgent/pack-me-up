import { useState, useEffect } from 'react'
import { Modal } from '../components/Modal'
import { CustomCreatableSelect } from '../components/CreatableSelect'
import { Button } from '../components/Button'

interface QuestionItemAddModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (text: string) => void
    existingItemNames: string[]
}

export function QuestionItemAddModal({ isOpen, onClose, onConfirm, existingItemNames }: QuestionItemAddModalProps) {
    const [text, setText] = useState('')

    useEffect(() => {
        if (isOpen) setText('')
    }, [isOpen])

    function handleConfirm() {
        const trimmed = text.trim()
        if (!trimmed) return
        onConfirm(trimmed)
        onClose()
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Item">
            <div className="space-y-4">
                <CustomCreatableSelect
                    value={text}
                    onChange={setText}
                    options={existingItemNames}
                    placeholder="Enter item name"
                />
                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleConfirm} disabled={!text.trim()}>
                        Add Item
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
