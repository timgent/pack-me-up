import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type Modifier,
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDatabase } from '../components/DatabaseContext'
import { DatabaseMigration } from '../services/migration'
import { PackingListQuestionSet, Person, Item, Option, Question, QuestionType, newDraftQuestion, renumberItemOrder, AGE_RANGE_OPTIONS } from '../edit-questions/types'
import { Link } from 'react-router-dom'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'
import { usePodSync } from '../hooks/usePodSync'
import { mergeQuestionSets } from '../utils/mergeQuestionSets'
import { POD_CONTAINERS } from '../services/solidPod'
import { questionSetToDataset, datasetToQuestionSet } from '../services/rdfSerialization'
import { useSolidPod } from '../components/SolidPodContext'
import { useForeignPod } from '../components/ForeignPodContext'
import { CustomCreatableSelect } from '../components/CreatableSelect'
import { AgePromotionCard } from '../components/AgePromotionCard'
import { TemplateUpdatesCard } from '../components/TemplateUpdatesCard'
import { AgeTransition } from '../edit-questions/age-derivation'
import { useIsDesktop } from '../hooks/useIsDesktop'

// One distinct colour per person slot (by index). Tailwind classes must be literal strings.
const AVATAR_ON = [
    'bg-blue-500 text-white',
    'bg-violet-500 text-white',
    'bg-emerald-500 text-white',
    'bg-amber-500 text-white',
    'bg-rose-500 text-white',
    'bg-cyan-500 text-white',
]
const AVATAR_OFF = 'bg-gray-100 text-gray-300'

function PersonDot({ person, index, selected }: { person: Person; index: number; selected: boolean }) {
    return (
        <span
            title={person.name}
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold select-none shrink-0 ${selected ? AVATAR_ON[index % AVATAR_ON.length] : AVATAR_OFF}`}
        >
            {person.name.charAt(0).toUpperCase()}
        </span>
    )
}

const PersonLegend = memo(function PersonLegend({ people, onEdit }: { people: Person[]; onEdit?: () => void }) {
    if (people.length < 2 && !onEdit) return null
    return (
        <div className="flex items-center gap-2 flex-wrap mb-4">
            {people.length === 0 && onEdit && (
                <span className="text-xs text-gray-400">No people added</span>
            )}
            {people.map((person, i) => (
                <span key={person.id} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${AVATAR_ON[i % AVATAR_ON.length]}`}>
                        {person.name.charAt(0).toUpperCase()}
                    </span>
                    {person.name}
                </span>
            ))}
            {onEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="p-1 text-gray-300 hover:text-gray-600 rounded"
                    title="Edit people"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </button>
            )}
        </div>
    )
})

const ItemRow = memo(function ItemRow({ item, people }: { item: Item; people: Person[] }) {
    const showDots = people.length > 1
    return (
        <div className="flex items-center gap-2 py-0.5 px-2 text-sm">
            <span className={`flex-1 min-w-0 ${item.text ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                {item.text || 'no text'}
            </span>
            {item.communal && (
                <span
                    title="Shared — packed once for the whole group"
                    className="inline-flex items-center justify-center h-5 rounded-full px-1.5 text-[10px] font-medium bg-blue-100 text-blue-700 select-none shrink-0"
                >
                    👥
                </span>
            )}
            {item.perNight !== undefined && (
                <span
                    title={`Suggested quantity: ${rateLabel(item)}${item.maxQuantity !== undefined ? `, up to ${item.maxQuantity}` : ''}`}
                    className="inline-flex items-center justify-center h-5 rounded-full px-1.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 select-none shrink-0"
                >
                    ×{rateLabel(item).replace(' per ', '/')}
                </span>
            )}
            {showDots && (
                <div className="flex gap-0.5 shrink-0">
                    {people.map((person, i) => (
                        <PersonDot
                            key={person.id}
                            person={person}
                            index={i}
                            selected={item.personSelections?.[i]?.selected ?? false}
                        />
                    ))}
                </div>
            )}
        </div>
    )
})

function OptionContextMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className="p-2 text-gray-400 hover:text-gray-700 rounded"
                    title="More actions"
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                    </svg>
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="w-32 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50"
                >
                    <DropdownMenu.Item
                        onSelect={onEdit}
                        className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-default outline-none"
                    >
                        Edit
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                        onSelect={onDelete}
                        className="px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 cursor-default outline-none"
                    >
                        Delete
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    )
}

function OptionSection({ option, people, onEdit, onDelete }: {
    option: Option
    people: Person[]
    onEdit: () => void
    onDelete: () => void
}) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    // Items aren't mounted until first expand (cheap initial render for large
    // sets), but stay mounted afterwards so re-expanding is instant.
    const hasExpandedRef = useRef(isExpanded)
    if (isExpanded) hasExpandedRef.current = true
    return (
        <div className="bg-gray-50 rounded-lg p-3">
            <div className={`flex items-center${isExpanded ? ' mb-2' : ''}`}>
                <button
                    type="button"
                    onClick={() => setIsExpanded(e => !e)}
                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                >
                    <svg
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="text-sm font-medium text-gray-800 flex-1 min-w-0">
                        {option.text || <em className="text-gray-400 font-normal">Untitled option</em>}
                    </span>
                    <span className="hidden sm:inline text-xs text-gray-400 flex-shrink-0 mr-1">{option.items.length} items</span>
                </button>
                <div className="flex items-center flex-shrink-0">
                    {/* Mobile: context menu */}
                    <div className="sm:hidden">
                        <OptionContextMenu
                            onEdit={onEdit}
                            onDelete={() => setShowDeleteModal(true)}
                        />
                    </div>
                    {/* Desktop: inline buttons */}
                    <div className="hidden sm:flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={onEdit}
                            className="p-1 text-gray-300 hover:text-gray-600 rounded"
                            title="Edit option"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowDeleteModal(true)}
                            className="p-1 text-gray-300 hover:text-red-400 rounded"
                            title="Delete option"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            {hasExpandedRef.current && (
                <div className={`space-y-0.5${isExpanded ? '' : ' hidden'}`}>
                    {option.items.map((item, i) => (
                        <ItemRow key={i} item={item} people={people} />
                    ))}
                </div>
            )}
            {showDeleteModal && (
                <DeleteConfirmModal
                    onConfirm={() => { onDelete(); setShowDeleteModal(false) }}
                    onCancel={() => setShowDeleteModal(false)}
                />
            )}
        </div>
    )
}

function DeleteConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={onCancel}
            onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        >
            <div
                className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
                onClick={e => e.stopPropagation()}
            >
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete question?</h2>
                <p className="text-sm text-gray-500 mb-6">This will permanently remove the question and all its options.</p>
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    )
}

function QuestionContextMenu({ onMoveUp, onMoveDown, onEdit, onDelete }: {
    onMoveUp?: () => void
    onMoveDown?: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    const [showDeleteModal, setShowDeleteModal] = useState(false)

    return (
        <>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className="p-2 text-gray-400 hover:text-gray-700 rounded"
                        title="More actions"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                        </svg>
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className="w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50"
                    >
                        <DropdownMenu.Item
                            onSelect={onEdit}
                            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-default outline-none"
                        >
                            Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            onSelect={onMoveUp}
                            disabled={!onMoveUp}
                            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-default outline-none data-[disabled]:text-gray-300 data-[disabled]:pointer-events-none"
                        >
                            Move Up
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            onSelect={onMoveDown}
                            disabled={!onMoveDown}
                            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-default outline-none data-[disabled]:text-gray-300 data-[disabled]:pointer-events-none"
                        >
                            Move Down
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            onSelect={e => { e.preventDefault(); setShowDeleteModal(true) }}
                            className="px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 cursor-default outline-none"
                        >
                            Delete
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {showDeleteModal && (
                <DeleteConfirmModal
                    onConfirm={() => { onDelete(); setShowDeleteModal(false) }}
                    onCancel={() => setShowDeleteModal(false)}
                />
            )}
        </>
    )
}

// Memoized with id-based handlers whose identity survives page re-renders, so
// opening a modal (or a background sync tick) doesn't re-render every question.
const QuestionSection = memo(function QuestionSection({ question, people, canMoveUp, canMoveDown, onEdit, onDelete, onAddOption, onEditOption, onDeleteOption, onMove }: {
    question: Question
    people: Person[]
    canMoveUp: boolean
    canMoveDown: boolean
    onEdit: (question: Question) => void
    onDelete: (id: string) => void
    onAddOption: (questionId: string) => void
    onEditOption: (questionId: string, option: Option) => void
    onDeleteOption: (questionId: string, optionId: string) => void
    onMove: (id: string, direction: 'up' | 'down') => void
}) {
    const [isExpanded, setIsExpanded] = useState(true)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    // Once expanded, keep the options mounted (hidden) so re-expanding is instant.
    const hasExpandedRef = useRef(isExpanded)
    if (isExpanded) hasExpandedRef.current = true
    const handleEdit = () => onEdit(question)
    const handleDelete = () => onDelete(question.id)
    const moveUp = canMoveUp ? () => onMove(question.id, 'up') : undefined
    const moveDown = canMoveDown ? () => onMove(question.id, 'down') : undefined
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex items-stretch">
                <button
                    type="button"
                    onClick={() => setIsExpanded(e => !e)}
                    className="flex items-center gap-3 flex-1 text-left px-4 py-4 sm:px-6 min-w-0 hover:bg-gray-50 transition-colors duration-150"
                >
                    <svg
                        className={`w-5 h-5 text-gray-400 flex-shrink-0 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="font-medium text-gray-900 flex-1 min-w-0">
                        {question.text || <em className="text-gray-400 font-normal">Untitled question</em>}
                    </span>
                    <span className="hidden sm:inline text-xs text-gray-400 flex-shrink-0 mr-2">{question.options.length} options</span>
                </button>
                <div className="flex items-center pr-3 flex-shrink-0">
                    {/* Mobile: context menu */}
                    <div className="sm:hidden">
                        <QuestionContextMenu
                            onMoveUp={moveUp}
                            onMoveDown={moveDown}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    </div>
                    {/* Desktop: inline buttons */}
                    <div className="hidden sm:flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={moveUp}
                            disabled={!canMoveUp}
                            className={`p-1.5 rounded ${canMoveUp ? 'text-gray-300 hover:text-gray-600' : 'text-gray-100 cursor-not-allowed'}`}
                            title="Move up"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={moveDown}
                            disabled={!canMoveDown}
                            className={`p-1.5 rounded ${canMoveDown ? 'text-gray-300 hover:text-gray-600' : 'text-gray-100 cursor-not-allowed'}`}
                            title="Move down"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleEdit}
                            className="p-1.5 text-gray-300 hover:text-gray-600 rounded"
                            title="Edit question"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowDeleteModal(true)}
                            className="p-1.5 text-gray-300 hover:text-red-400 rounded"
                            title="Delete question"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            {hasExpandedRef.current && (
                <div className={isExpanded ? 'px-4 sm:px-6 pb-4 sm:pb-6 space-y-2' : 'hidden'}>
                    {question.options.map((option) => (
                        <OptionSection
                            key={option.id}
                            option={option}
                            people={people}
                            onEdit={() => onEditOption(question.id, option)}
                            onDelete={() => onDeleteOption(question.id, option.id)}
                        />
                    ))}
                    <button
                        type="button"
                        onClick={() => onAddOption(question.id)}
                        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    >
                        + Add Option
                    </button>
                </div>
            )}
            {showDeleteModal && (
                <DeleteConfirmModal
                    onConfirm={() => { handleDelete(); setShowDeleteModal(false) }}
                    onCancel={() => setShowDeleteModal(false)}
                />
            )}
        </div>
    )
})

const AlwaysSection = memo(function AlwaysSection({ items, people, onEdit }: { items: Item[]; people: Person[]; onEdit: () => void }) {
    const [isExpanded, setIsExpanded] = useState(false)
    // Same lazy-mount-then-keep pattern as the sections above.
    const hasExpandedRef = useRef(isExpanded)
    if (isExpanded) hasExpandedRef.current = true
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center">
                <button
                    type="button"
                    onClick={() => setIsExpanded(e => !e)}
                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                >
                    <svg
                        className={`w-5 h-5 text-gray-400 flex-shrink-0 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="flex flex-col min-w-0">
                        <span className="font-medium text-gray-900">Always Needed Items</span>
                        <span className="hidden sm:inline text-sm font-normal text-gray-500">{items.length} items</span>
                    </span>
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    className="p-4 -m-2 text-gray-300 hover:text-gray-600 rounded flex-shrink-0"
                    title="Edit always needed items"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </button>
            </div>
            {hasExpandedRef.current && (
                <div className={`mt-3 space-y-1${isExpanded ? '' : ' hidden'}`}>
                    {items.map((item, i) => (
                        <ItemRow key={i} item={item} people={people} />
                    ))}
                </div>
            )}
        </div>
    )
})

function useItemListState(initialItems: Item[], people: Person[]) {
    const [items, setItems] = useState<Item[]>(initialItems)
    const scrollRef = useRef<HTMLDivElement>(null)
    const prevCountRef = useRef(initialItems.length)

    useEffect(() => {
        if (items.length > prevCountRef.current) {
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
            })
        }
        prevCountRef.current = items.length
    }, [items.length])

    // All handlers are useCallback'd so the memoized per-item rows only
    // re-render when their own item changes, not on every keystroke or toggle.
    const updateItemText = useCallback((idx: number, text: string) =>
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, text } : item)), [])

    const togglePerson = useCallback((itemIdx: number, personIdx: number) =>
        setItems(prev => prev.map((item, i) => {
            if (i !== itemIdx) return item
            const selections = people.map((p, pi) => ({
                personId: p.id,
                selected: item.personSelections?.[pi]?.selected ?? false,
            }))
            selections[personIdx] = { ...selections[personIdx], selected: !selections[personIdx].selected }
            return { ...item, personSelections: selections }
        })), [people])

    const toggleCommunal = useCallback((itemIdx: number) =>
        setItems(prev => prev.map((item, i) =>
            i === itemIdx ? { ...item, communal: item.communal ? undefined : true } : item
        )), [])

    const updatePerNight = useCallback((itemIdx: number, perNight: number | undefined) =>
        setItems(prev => prev.map((item, i) =>
            i === itemIdx ? { ...item, perNight } : item
        )), [])

    const updatePerNights = useCallback((itemIdx: number, perNights: number | undefined) =>
        setItems(prev => prev.map((item, i) =>
            i === itemIdx ? { ...item, perNights } : item
        )), [])

    const updateMaxQuantity = useCallback((itemIdx: number, maxQuantity: number | undefined) =>
        setItems(prev => prev.map((item, i) =>
            i === itemIdx ? { ...item, maxQuantity } : item
        )), [])

    const removeItem = useCallback((idx: number) =>
        setItems(prev => prev.filter((_, i) => i !== idx)), [])

    const moveItem = useCallback((idx: number, direction: 'up' | 'down') =>
        setItems(prev => {
            const swapIdx = direction === 'up' ? idx - 1 : idx + 1
            if (swapIdx < 0 || swapIdx >= prev.length) return prev
            const next = [...prev]
            ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
            return next
        }), [])

    // Pull the item at `from` out and reinsert it at `to` — used by drag to
    // reorder; up/down buttons stay as the discrete, keyboard-friendly path.
    const reorderItem = useCallback((from: number, to: number) =>
        setItems(prev => {
            if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
            const next = [...prev]
            const [moved] = next.splice(from, 1)
            next.splice(to, 0, moved)
            return next
        }), [])

    const addItem = useCallback(() =>
        setItems(prev => [...prev, {
            text: '',
            personSelections: people.map(p => ({ personId: p.id, selected: true })),
        }]), [people])

    return { items, scrollRef, updateItemText, togglePerson, toggleCommunal, updatePerNight, updatePerNights, updateMaxQuantity, removeItem, moveItem, reorderItem, addItem }
}

// "2 per night" / "1 per 4 nights" — the human phrasing of an item's rate
function rateLabel(item: Item): string {
    const nights = item.perNights ?? 1
    return nights > 1 ? `${item.perNight} per ${nights} nights` : `${item.perNight} per night`
}

function parseQty(raw: string): number | undefined {
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
}

// One editable item row. Memoized (with stable handlers from useItemListState)
// so toggling a person or typing in one row doesn't re-render every other row —
// with dozens of items and a large family that re-render is what made the
// editor modals feel sluggish on phones. Renders only the variant for the
// current form factor instead of both (CSS-hidden DOM is still DOM).
const ItemEditorRow = memo(function ItemEditorRow({ item, itemIdx, people, allItemNames, isDesktop, quantityOpen, onToggleQuantity, updateItemText, togglePerson, toggleCommunal, updatePerNight, updatePerNights, updateMaxQuantity, removeItem }: {
    item: Item
    itemIdx: number
    people: Person[]
    allItemNames: string[]
    isDesktop: boolean
    quantityOpen: boolean
    onToggleQuantity: (idx: number) => void
    updateItemText: (idx: number, text: string) => void
    togglePerson: (itemIdx: number, personIdx: number) => void
    toggleCommunal: (itemIdx: number) => void
    updatePerNight: (itemIdx: number, perNight: number | undefined) => void
    updatePerNights: (itemIdx: number, perNights: number | undefined) => void
    updateMaxQuantity: (itemIdx: number, maxQuantity: number | undefined) => void
    removeItem: (idx: number) => void
}) {
    const isCommunal = item.communal === true
    const communalTitle = isCommunal
        ? 'Shared item — packed once for the group. Click to make per-person.'
        : 'Make this a shared item, packed once for the group'
    const personTitle = (name: string) => isCommunal
        ? `Needed when ${name} is on the trip`
        : name
    const hasRate = item.perNight !== undefined
    const quantityTitle = hasRate
        ? `Suggested quantity: ${rateLabel(item)}${item.maxQuantity !== undefined ? `, up to ${item.maxQuantity}` : ''}`
        : 'Suggest a quantity based on nights away (e.g. 1 pair of socks per night, or 1 jumper per 4 nights)'
    return (
        // content-visibility lets the browser skip layout/paint for rows that
        // are scrolled out of view — noticeable when a list has dozens of items.
        <div
            className="sm:flex sm:flex-wrap sm:items-center sm:gap-2 rounded-lg border border-gray-200 sm:border-transparent p-2 sm:p-0"
            style={{ contentVisibility: 'auto', containIntrinsicSize: isDesktop ? 'auto 44px' : 'auto 132px' }}
        >
            {/* Item name + desktop people + remove */}
            <div className="flex items-center gap-2 sm:flex-1 sm:min-w-0">
                <div className="flex-1 min-w-0">
                    <CustomCreatableSelect
                        value={item.text}
                        onChange={val => updateItemText(itemIdx, val)}
                        options={allItemNames}
                        placeholder="Item name"
                        menuPortalTarget={document.body}
                    />
                </div>
                {/* Desktop: shared toggle + inline avatars */}
                {isDesktop && (
                    <div className="flex gap-0.5 shrink-0 items-center">
                        <button
                            type="button"
                            onClick={() => toggleCommunal(itemIdx)}
                            title={communalTitle}
                            aria-label={`Toggle shared for ${item.text || 'item'}`}
                            aria-pressed={isCommunal}
                            className={`inline-flex items-center justify-center h-5 rounded-full px-1 text-[10px] transition-colors mr-1 ${isCommunal ? 'bg-blue-600 text-white' : AVATAR_OFF}`}
                        >
                            👥
                        </button>
                        {people.length > 1 && people.map((person, personIdx) => {
                            const selected = item.personSelections?.[personIdx]?.selected ?? false
                            return (
                                <button
                                    key={person.id}
                                    type="button"
                                    onClick={() => togglePerson(itemIdx, personIdx)}
                                    title={personTitle(person.name)}
                                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors ${selected ? AVATAR_ON[personIdx % AVATAR_ON.length] : AVATAR_OFF} ${isCommunal && selected ? 'ring-2 ring-blue-300 ring-offset-1' : ''}`}
                                >
                                    {person.name.charAt(0).toUpperCase()}
                                </button>
                            )
                        })}
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => onToggleQuantity(itemIdx)}
                    title={quantityTitle}
                    aria-label={`Set suggested quantity for ${item.text || 'item'}`}
                    aria-expanded={quantityOpen}
                    className={`inline-flex items-center justify-center h-5 rounded-full px-1.5 text-[10px] font-medium shrink-0 transition-colors ${hasRate ? 'bg-emerald-600 text-white' : AVATAR_OFF}`}
                >
                    {hasRate
                        ? ((item.perNights ?? 1) > 1 ? `×${item.perNight}/${item.perNights}nt` : `×${item.perNight}/nt`)
                        : '×n'}
                </button>
                <button
                    type="button"
                    onClick={() => removeItem(itemIdx)}
                    className="shrink-0 text-gray-300 hover:text-red-400 text-xl leading-none"
                    title="Remove item"
                >
                    ×
                </button>
            </div>
            {/* Mobile: shared toggle + people on their own row as large labelled tiles */}
            {!isDesktop && (
                <div className="mt-2 flex gap-2">
                    <button
                        type="button"
                        onClick={() => toggleCommunal(itemIdx)}
                        title={communalTitle}
                        aria-pressed={isCommunal}
                        className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-colors ${isCommunal ? 'bg-blue-600 text-white border-transparent' : 'bg-white border-gray-200 text-gray-400'}`}
                    >
                        <span className="text-lg font-bold leading-none">👥</span>
                        <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1">
                            Shared
                        </span>
                    </button>
                    {people.length > 1 && people.map((person, personIdx) => {
                        const selected = item.personSelections?.[personIdx]?.selected ?? false
                        return (
                            <button
                                key={person.id}
                                type="button"
                                onClick={() => togglePerson(itemIdx, personIdx)}
                                title={personTitle(person.name)}
                                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-colors ${selected ? `${AVATAR_ON[personIdx % AVATAR_ON.length]} border-transparent` : `bg-white border-gray-200 text-gray-400`}`}
                            >
                                <span className="text-lg font-bold leading-none">
                                    {person.name.charAt(0).toUpperCase()}
                                </span>
                                <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1">
                                    {person.name}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
            {!isDesktop && isCommunal && people.length > 1 && (
                <div className="mt-1 text-[11px] text-blue-600 px-1">
                    Packed once for the group — included when a highlighted person is going
                </div>
            )}
            {quantityOpen && (
                <div className="mt-2 sm:mt-0 w-full flex items-center gap-3 flex-wrap text-xs text-gray-600 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5">
                        Pack
                        <input
                            type="number"
                            min={1}
                            value={item.perNight ?? ''}
                            onChange={e => updatePerNight(itemIdx, parseQty(e.target.value))}
                            aria-label={`Quantity to pack for ${item.text || 'item'}`}
                            className="w-12 border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                        per
                        <input
                            type="number"
                            min={1}
                            placeholder="1"
                            value={item.perNights ?? ''}
                            onChange={e => updatePerNights(itemIdx, parseQty(e.target.value))}
                            disabled={!hasRate}
                            aria-label={`Number of nights per ${item.text || 'item'}`}
                            className="w-12 border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-40"
                        />
                        night{(item.perNights ?? 1) > 1 ? 's' : ''}
                    </span>
                    <label className={`flex items-center gap-1.5 ${hasRate ? '' : 'opacity-40'}`}>
                        Max
                        <input
                            type="number"
                            min={1}
                            value={item.maxQuantity ?? ''}
                            onChange={e => updateMaxQuantity(itemIdx, parseQty(e.target.value))}
                            disabled={!hasRate}
                            aria-label={`Maximum quantity for ${item.text || 'item'}`}
                            className="w-12 border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                    </label>
                    <span className="text-gray-400">
                        e.g. socks: 1 per night; a jumper: 1 per 4 nights. Suggests a
                        quantity when a list has nights away — leave blank to skip
                    </span>
                </div>
            )}
        </div>
    )
})

// Lock the drag to the vertical axis — the list is one column, so any
// horizontal drift just reads as jitter. (Inlined rather than pulling in
// @dnd-kit/modifiers for a one-line transform.)
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

// A single row in reorder mode: a drag handle (dnd-kit sortable) plus the
// up/down buttons, which stay as the discrete, always-available fallback.
function SortableItemRow({ id, item, index, isLast, moveItem }: {
    id: string
    item: Item
    index: number
    isLast: boolean
    moveItem: (idx: number, direction: 'up' | 'down') => void
}) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    }
    return (
        <div
            ref={setNodeRef}
            style={style}
            data-reorder-row
            className={`flex items-center gap-1 rounded-lg border bg-white p-2 ${isDragging ? 'relative z-10 border-primary-400 shadow-md opacity-95' : 'border-gray-200'}`}
        >
            <button
                type="button"
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-grab active:cursor-grabbing touch-none"
                title="Drag to reorder"
                aria-label={`Drag ${item.text || 'item'} to reorder`}
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
                </svg>
            </button>
            <span className="flex-1 min-w-0 truncate text-sm text-gray-800 px-1">
                {item.text || <span className="text-gray-400 italic">Unnamed item</span>}
            </span>
            <div className="flex gap-1 shrink-0">
                <button
                    type="button"
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0}
                    className={`inline-flex items-center justify-center w-11 h-11 rounded-lg border transition-colors ${index === 0 ? 'text-gray-200 border-gray-100 cursor-not-allowed' : 'text-gray-600 border-gray-200 hover:bg-gray-50 active:bg-gray-100'}`}
                    title="Move item up"
                    aria-label={`Move ${item.text || 'item'} up`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                </button>
                <button
                    type="button"
                    onClick={() => moveItem(index, 'down')}
                    disabled={isLast}
                    className={`inline-flex items-center justify-center w-11 h-11 rounded-lg border transition-colors ${isLast ? 'text-gray-200 border-gray-100 cursor-not-allowed' : 'text-gray-600 border-gray-200 hover:bg-gray-50 active:bg-gray-100'}`}
                    title="Move item down"
                    aria-label={`Move ${item.text || 'item'} down`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>
        </div>
    )
}

function ItemListEditor({ items, people, allItemNames, scrollRef, updateItemText, togglePerson, toggleCommunal, updatePerNight, updatePerNights, updateMaxQuantity, removeItem, moveItem, reorderItem, addItem }: {
    items: Item[]
    people: Person[]
    allItemNames: string[]
    scrollRef: React.RefObject<HTMLDivElement | null>
    updateItemText: (idx: number, text: string) => void
    togglePerson: (itemIdx: number, personIdx: number) => void
    toggleCommunal: (itemIdx: number) => void
    updatePerNight: (itemIdx: number, perNight: number | undefined) => void
    updatePerNights: (itemIdx: number, perNights: number | undefined) => void
    updateMaxQuantity: (itemIdx: number, maxQuantity: number | undefined) => void
    removeItem: (idx: number) => void
    moveItem: (idx: number, direction: 'up' | 'down') => void
    reorderItem: (from: number, to: number) => void
    addItem: () => void
}) {
    const [openQuantityIdx, setOpenQuantityIdx] = useState<number | null>(null)
    const [reorderMode, setReorderMode] = useState(false)
    const isDesktop = useIsDesktop()
    const toggleQuantity = useCallback((idx: number) =>
        setOpenQuantityIdx(prev => prev === idx ? null : idx), [])
    // Reorder mode only makes sense with something to reorder; if there aren't
    // at least two items the toggle is hidden and we render the normal editor.
    const canReorder = items.length > 1
    const inReorder = reorderMode && canReorder

    // dnd-kit needs a stable id per row that survives reorders. Items may lack
    // an `id` (e.g. defaults not yet saved), so map each item object to a
    // client-only drag id. Reordering splices the same object references, so
    // ids stay put across a drag; edits create new objects (fine — not mid-drag).
    const dragIdMap = useRef(new WeakMap<Item, string>())
    const dragIdSeq = useRef(0)
    const dragIdFor = (item: Item): string => {
        let id = dragIdMap.current.get(item)
        if (!id) {
            id = `item-${dragIdSeq.current++}`
            dragIdMap.current.set(item, id)
        }
        return id
    }
    const itemIds = items.map(dragIdFor)

    // Split mouse/touch sensors so each platform gets the right activation:
    //  - Mouse: a small distance threshold, so desktop drags start instantly
    //    while taps on the sibling buttons still register as clicks.
    //  - Touch: a press-and-hold delay, so an ordinary swipe scrolls the list
    //    (and doesn't jump the page / toggle the mobile URL bar); only a
    //    deliberate hold begins a drag. This is dnd-kit's recommended mobile
    //    setup and is what fixes the touch jankiness.
    //  - Keyboard: makes the drag operable without a pointer.
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )
    const handleDragEnd = (e: DragEndEvent) => {
        const { active, over } = e
        if (!over || active.id === over.id) return
        const from = itemIds.indexOf(String(active.id))
        const to = itemIds.indexOf(String(over.id))
        if (from !== -1 && to !== -1) reorderItem(from, to)
    }
    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
            {items.length > 0 && (
                <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Items</div>
                    {canReorder && (
                        <button
                            type="button"
                            onClick={() => setReorderMode(m => !m)}
                            aria-pressed={reorderMode}
                            className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 transition-colors ${reorderMode ? 'bg-primary-600 text-white' : 'text-primary-600 hover:bg-primary-50'}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            {reorderMode ? 'Finish reordering' : 'Reorder items'}
                        </button>
                    )}
                </div>
            )}
            {inReorder && (
                <div className="text-[11px] text-gray-400 mb-2 px-0.5">
                    Drag the handle (press and hold on touch), or use the arrows, then tap Finish reordering.
                </div>
            )}
            <div className="space-y-2">
                {inReorder && (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis]}
                        // Only ever auto-scroll the modal's own scroll area. The
                        // modal doesn't lock body scroll, so without this dnd-kit
                        // scrolls the whole window when a drag nears the screen
                        // edge — which jumps the page and toggles the mobile URL
                        // bar mid-drag.
                        autoScroll={{ canScroll: (el) => el === scrollRef.current }}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                                {items.map((item, itemIdx) => (
                                    <SortableItemRow
                                        key={itemIds[itemIdx]}
                                        id={itemIds[itemIdx]}
                                        item={item}
                                        index={itemIdx}
                                        isLast={itemIdx === items.length - 1}
                                        moveItem={moveItem}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
                {!inReorder && items.map((item, itemIdx) => (
                    <ItemEditorRow
                        key={itemIdx}
                        item={item}
                        itemIdx={itemIdx}
                        people={people}
                        allItemNames={allItemNames}
                        isDesktop={isDesktop}
                        quantityOpen={openQuantityIdx === itemIdx}
                        onToggleQuantity={toggleQuantity}
                        updateItemText={updateItemText}
                        togglePerson={togglePerson}
                        toggleCommunal={toggleCommunal}
                        updatePerNight={updatePerNight}
                        updatePerNights={updatePerNights}
                        updateMaxQuantity={updateMaxQuantity}
                        removeItem={removeItem}
                    />
                ))}
            </div>
            {!inReorder && (
                <button
                    type="button"
                    onClick={addItem}
                    className="mt-3 w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                >
                    + Add Item
                </button>
            )}
        </div>
    )
}

function OptionEditModal({ option, people, allItemNames, onSave, onClose }: {
    option: Option | null
    people: Person[]
    allItemNames: string[]
    onSave: (updated: Option) => void
    onClose: () => void
}) {
    const [text, setText] = useState(option?.text ?? '')
    const { items, scrollRef, updateItemText, togglePerson, toggleCommunal, updatePerNight, updatePerNights, updateMaxQuantity, removeItem, moveItem, reorderItem, addItem } = useItemListState(option?.items ?? [], people)

    const handleSave = () => onSave({
        id: option?.id ?? crypto.randomUUID(),
        order: option?.order ?? 0,
        text: text.trim(),
        items: renumberItemOrder(items, new Date().toISOString()),
    })

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        >
            <div
                className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-gray-100 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">
                        {option ? 'Edit Option' : 'Add Option'}
                    </h2>
                    <input
                        autoFocus
                        type="text"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Option text (e.g. Yes)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        onKeyDown={e => { if (e.key === 'Enter') addItem() }}
                    />
                    {people.length > 1 && (
                        <div className="flex items-center gap-3 flex-wrap mt-3">
                            {people.map((person, i) => (
                                <span key={person.id} className="flex items-center gap-1 text-xs text-gray-400">
                                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${AVATAR_ON[i % AVATAR_ON.length]}`}>
                                        {person.name.charAt(0).toUpperCase()}
                                    </span>
                                    {person.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <ItemListEditor
                    items={items} people={people} allItemNames={allItemNames}
                    scrollRef={scrollRef} updateItemText={updateItemText}
                    togglePerson={togglePerson} toggleCommunal={toggleCommunal}
                    updatePerNight={updatePerNight} updatePerNights={updatePerNights} updateMaxQuantity={updateMaxQuantity}
                    removeItem={removeItem} moveItem={moveItem} reorderItem={reorderItem} addItem={addItem}
                />
                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 flex gap-2 justify-end">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100">
                        Cancel
                    </button>
                    <button type="button" onClick={handleSave} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                        {option ? 'Save changes' : 'Add option'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function AlwaysNeededModal({ initialItems, people, allItemNames, onSave, onClose }: {
    initialItems: Item[]
    people: Person[]
    allItemNames: string[]
    onSave: (items: Item[]) => void
    onClose: () => void
}) {
    const { items, scrollRef, updateItemText, togglePerson, toggleCommunal, updatePerNight, updatePerNights, updateMaxQuantity, removeItem, moveItem, reorderItem, addItem } = useItemListState(initialItems, people)

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        >
            <div
                className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-gray-100 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900">Always Needed Items</h2>
                    {people.length > 1 && (
                        <div className="flex items-center gap-3 flex-wrap mt-2">
                            {people.map((person, i) => (
                                <span key={person.id} className="flex items-center gap-1 text-xs text-gray-400">
                                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${AVATAR_ON[i % AVATAR_ON.length]}`}>
                                        {person.name.charAt(0).toUpperCase()}
                                    </span>
                                    {person.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <ItemListEditor
                    items={items} people={people} allItemNames={allItemNames}
                    scrollRef={scrollRef} updateItemText={updateItemText}
                    togglePerson={togglePerson} toggleCommunal={toggleCommunal}
                    updatePerNight={updatePerNight} updatePerNights={updatePerNights} updateMaxQuantity={updateMaxQuantity}
                    removeItem={removeItem} moveItem={moveItem} reorderItem={reorderItem} addItem={addItem}
                />
                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 flex gap-2 justify-end">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100">
                        Cancel
                    </button>
                    <button type="button" onClick={() => onSave(renumberItemOrder(items, new Date().toISOString()))} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                        Save changes
                    </button>
                </div>
            </div>
        </div>
    )
}

function PeopleModal({ people, onSave, onClose }: {
    people: Person[]
    onSave: (newPeople: Person[]) => void
    onClose: () => void
}) {
    const [localPeople, setLocalPeople] = useState<Person[]>(
        people.length > 0 ? people : [{ id: crypto.randomUUID(), name: '' }]
    )

    const addPerson = () => setLocalPeople(prev => [...prev, { id: crypto.randomUUID(), name: '' }])
    const removePerson = (idx: number) => {
        if (localPeople.length <= 1) return
        setLocalPeople(prev => prev.filter((_, i) => i !== idx))
    }
    const updateName = (idx: number, name: string) =>
        setLocalPeople(prev => prev.map((p, i) => i === idx ? { ...p, name } : p))
    const updateDob = (idx: number, dateOfBirth: string) =>
        setLocalPeople(prev => prev.map((p, i) => i === idx
            ? { ...p, dateOfBirth: dateOfBirth || undefined }
            : p))
    const updateAgeRange = (idx: number, value: string) =>
        setLocalPeople(prev => prev.map((p, i) => i === idx
            ? { ...p, ageRange: value === '' ? undefined : value as Person['ageRange'] }
            : p))

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        >
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="p-5">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit People</h2>
                    <div className="space-y-2 mb-3">
                        {localPeople.map((person, i) => (
                            <div key={person.id}>
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${AVATAR_ON[i % AVATAR_ON.length]}`}>
                                        {person.name.charAt(0).toUpperCase() || '?'}
                                    </span>
                                    <input
                                        autoFocus={i === 0}
                                        type="text"
                                        value={person.name}
                                        onChange={e => updateName(i, e.target.value)}
                                        placeholder={`Person ${i + 1}`}
                                        className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        onKeyDown={e => { if (e.key === 'Enter') addPerson() }}
                                    />
                                    {localPeople.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removePerson(i)}
                                            className="text-gray-300 hover:text-red-400 text-xl leading-none shrink-0"
                                            title="Remove person"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                                {!person.species && (
                                    <div className="ml-9 mt-1 flex items-center gap-2">
                                        <input
                                            type="date"
                                            aria-label={`Birthday for ${person.name || `Person ${i + 1}`} (optional)`}
                                            title="Birthday (optional) — used to keep age-based items up to date"
                                            value={person.dateOfBirth ?? ''}
                                            onChange={e => updateDob(i, e.target.value)}
                                            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        />
                                        <select
                                            aria-label={`Age group for ${person.name || `Person ${i + 1}`}`}
                                            title="Age group — change it manually if they're ready for the next one early"
                                            value={person.ageRange ?? ''}
                                            onChange={e => updateAgeRange(i, e.target.value)}
                                            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        >
                                            <option value="">Age group…</option>
                                            {AGE_RANGE_OPTIONS.map(option => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Birthdays are optional — add one and we'll suggest packing-item updates as they grow. You can also bump the age group early if they're ready for it.</p>
                    <button
                        type="button"
                        onClick={addPerson}
                        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors mb-4"
                    >
                        + Add Person
                    </button>
                    <div className="flex gap-2 justify-end">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100">
                            Cancel
                        </button>
                        <button type="button" onClick={() => onSave(localPeople)} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function reconcileItems(items: Item[], oldPeople: Person[], newPeople: Person[]): Item[] {
    return items.map(item => ({
        ...item,
        personSelections: newPeople.map(person => {
            const oldIdx = oldPeople.findIndex(p => p.id === person.id)
            const selected = oldIdx >= 0
                ? (item.personSelections?.[oldIdx]?.selected ?? true)
                : true
            return { personId: person.id, selected }
        }),
    }))
}

function QuestionModal({ question, onSave, onClose }: {
    question: Question | null
    onSave: (text: string, type: QuestionType) => void
    onClose: () => void
}) {
    const [text, setText] = useState(question?.text ?? '')
    const [type, setType] = useState<QuestionType>(question?.questionType ?? 'single-choice')

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        >
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-5">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                        {question ? 'Edit Question' : 'Add Question'}
                    </h2>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Question text</label>
                    <input
                        autoFocus
                        type="text"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="e.g. Are you going to a hot climate?"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                        onKeyDown={e => { if (e.key === 'Enter' && text.trim()) onSave(text.trim(), type) }}
                    />
                    <label className="block text-sm font-medium text-gray-700 mb-2">Answer type</label>
                    <div className="flex gap-2 mb-5">
                        {(['single-choice', 'multiple-choice'] as QuestionType[]).map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setType(t)}
                                className={`flex-1 py-2 rounded-lg text-sm border-2 transition-colors ${type === t ? 'border-primary-400 bg-primary-50 text-primary-900 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                            >
                                {t === 'single-choice' ? 'Single choice' : 'Multiple choice'}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => onSave(text.trim(), type)}
                            disabled={!text.trim()}
                            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {question ? 'Save changes' : 'Add question'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function QuestionsPage() {
    const { db, loginSyncInProgress } = useDatabase()
    const { isLoggedIn } = useSolidPod()
    const foreignPodCtx = useForeignPod()
    const foreignPodUrl = foreignPodCtx?.foreignPodUrl
    const isForeign = !!foreignPodUrl

    const [data, setData] = useState<PackingListQuestionSet | null>(null)
    // Render-time snapshot of `data` so section handlers can read the latest
    // value without depending on it — keeps their identity stable across data
    // changes, which is what lets the memoized QuestionSections skip renders.
    const dataRef = useRef<PackingListQuestionSet | null>(null)
    dataRef.current = data
    const [rev, setRev] = useState<string | undefined>(undefined)
    const [error, setError] = useState<string | null>(null)
    const [questionModal, setQuestionModal] = useState<{ question: Question | null } | null>(null)
    const [optionModal, setOptionModal] = useState<{ questionId: string; option: Option | null } | null>(null)
    const [peopleModal, setPeopleModal] = useState(false)
    const [alwaysModal, setAlwaysModal] = useState(false)
    // Bracket changes made by hand in the people modal; offered the same
    // item-review flow as birthday-driven transitions, then cleared.
    const [manualPromotions, setManualPromotions] = useState<AgeTransition[]>([])

    const saveToPodRef = useRef<((data: PackingListQuestionSet) => Promise<boolean>) | undefined>(undefined)

    const { saveWithSyncPrevention, handleSyncSuccess, handleSyncError } = useSyncCoordinator<PackingListQuestionSet>({
        currentData: data,
        saveToLocalDb: async (d) => db.saveQuestionSet({ _id: '1', ...d, _rev: rev }),
        updateFormAndState: (d, newRev) => {
            setRev(newRev)
            setData({ ...d, _rev: newRev })
        },
        conflictStrategy: 'fallback-to-pod',
        mergeFunction: mergeQuestionSets,
        saveToPod: saveToPodRef.current,
    })

    const { saveToPod } = usePodSync<PackingListQuestionSet>({
        pathConfig: { container: POD_CONTAINERS.ROOT, filename: 'packing-list-questions.ttl', podUrl: foreignPodUrl },
        rdf: { serialize: questionSetToDataset, deserialize: datasetToQuestionSet },
        pollInterval: 5000,
        enabled: isLoggedIn || isForeign,
        onSyncSuccess: handleSyncSuccess,
        onSyncError: handleSyncError,
    })

    // Keep saveToPodRef in sync so useSyncCoordinator can push merge results back to pod
    useEffect(() => { saveToPodRef.current = saveToPod }, [saveToPod])

    useEffect(() => {
        if (loginSyncInProgress) return
        const load = async () => {
            try {
                const migration = await DatabaseMigration.checkMigrationNeeded(db)
                if (migration.needed) await DatabaseMigration.performMigration(db)
                const d = await db.getQuestionSet()
                setData(d)
                setRev(d._rev)
            } catch (err: unknown) {
                if (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'not_found') {
                    setData({ _id: '1', questions: [], people: [], alwaysNeededItems: [] })
                } else {
                    setError(String(err))
                }
            }
        }
        load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loginSyncInProgress])

    const saveData = useCallback(async (updated: PackingListQuestionSet) => {
        const previous = dataRef.current
        setData(updated)
        const saved = await saveWithSyncPrevention(updated, saveToPod)
        if (saved) setData(saved)
        else setData(previous)
    }, [saveWithSyncPrevention, saveToPod])

    const handleQuestionModalSave = useCallback(async (text: string, type: QuestionType) => {
        if (!data || questionModal === null) return
        const questions = data.questions ?? []
        const now = new Date().toISOString()
        let newQuestions: Question[]
        if (questionModal.question) {
            newQuestions = questions.map(q =>
                q.id === questionModal.question!.id ? { ...q, text, questionType: type, lastModified: now } : q
            )
        } else {
            const maxOrder = questions.reduce((max, q) => Math.max(max, q.order), -1)
            newQuestions = [...questions, { ...newDraftQuestion(maxOrder + 1), text, questionType: type, lastModified: now }]
        }
        setQuestionModal(null)
        await saveData({ ...data, questions: newQuestions })
    }, [data, questionModal, saveData])

    const handleDeleteQuestion = useCallback(async (id: string) => {
        const data = dataRef.current
        if (!data) return
        const now = new Date().toISOString()
        await saveData({
            ...data,
            questions: data.questions.map(q => q.id === id ? { ...q, deletedAt: now } : q),
        })
    }, [saveData])

    const handleMoveQuestion = useCallback(async (id: string, direction: 'up' | 'down') => {
        const data = dataRef.current
        if (!data) return
        const active = data.questions.filter(q => !q.deletedAt)
        const idx = active.findIndex(q => q.id === id)
        if (idx < 0) return
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= active.length) return
        const newActive = [...active]
        ;[newActive[idx], newActive[swapIdx]] = [newActive[swapIdx], newActive[idx]]
        // Renumber order to match the new positions and stamp lastModified on
        // moved questions, so the reorder survives pod round-trips (deserialize
        // sorts by order) and wins per-question LWW during sync merges.
        const now = new Date().toISOString()
        const renumbered = newActive.map((q, i) =>
            q.order === i ? q : { ...q, order: i, lastModified: now }
        )
        // Rebuild full questions array preserving deleted ones
        const deletedQuestions = data.questions.filter(q => q.deletedAt)
        await saveData({ ...data, questions: [...renumbered, ...deletedQuestions] })
    }, [saveData])

    const handleOptionModalSave = useCallback(async (updatedOption: Option) => {
        if (!data || optionModal === null) return
        const newQuestions = data.questions.map(q => {
            if (q.id !== optionModal.questionId) return q
            let newOptions: Option[]
            if (optionModal.option) {
                newOptions = q.options.map(o =>
                    o.id === optionModal.option!.id ? updatedOption : o
                )
            } else {
                const maxOrder = q.options.reduce((max, o) => Math.max(max, o.order), -1)
                newOptions = [...q.options, { ...updatedOption, order: maxOrder + 1 }]
            }
            return { ...q, options: newOptions }
        })
        setOptionModal(null)
        await saveData({ ...data, questions: newQuestions })
    }, [data, optionModal, saveData])

    const handleAlwaysSave = useCallback(async (newItems: Item[]) => {
        if (!data) return
        setAlwaysModal(false)
        await saveData({ ...data, alwaysNeededItems: newItems })
    }, [data, saveData])

    const handlePeopleSave = useCallback(async (newPeople: Person[]) => {
        if (!data) return
        const oldPeople = data.people ?? []
        const oldPeopleMap = new Map(oldPeople.map(p => [p.id, p]))
        const newPeopleIds = new Set(newPeople.map(p => p.id))
        const now = new Date().toISOString()

        // Stamp lastModified on new or changed people
        const stamped: Person[] = newPeople.map(p => {
            const existing = oldPeopleMap.get(p.id)
            const changed = !existing || existing.name !== p.name ||
                existing.ageRange !== p.ageRange || existing.gender !== p.gender ||
                existing.dateOfBirth !== p.dateOfBirth
            return changed ? { ...p, lastModified: now } : p
        })

        // Mark removed people as deleted; preserve previously-deleted people
        const previouslyDeleted = oldPeople.filter(p => p.deletedAt)
        const nowDeleted = oldPeople
            .filter(p => !p.deletedAt && !newPeopleIds.has(p.id))
            .map(p => ({ ...p, deletedAt: now }))
        const allPeople = [...stamped, ...nowDeleted, ...previouslyDeleted]

        const manual: AgeTransition[] = stamped
            .filter(p => !p.species && p.ageRange)
            .flatMap(p => {
                const oldRange = oldPeopleMap.get(p.id)?.ageRange
                return oldPeopleMap.has(p.id) && oldRange !== p.ageRange
                    ? [{ person: p, from: oldRange, to: p.ageRange! }]
                    : []
            })
        setManualPromotions(manual)

        const reconcile = (items: Item[]) => reconcileItems(items, oldPeople.filter(p => !p.deletedAt), stamped)
        const newData: PackingListQuestionSet = {
            ...data,
            people: allPeople,
            alwaysNeededItems: reconcile(data.alwaysNeededItems ?? []),
            questions: data.questions.map(q => ({
                ...q,
                options: q.options.map(o => ({ ...o, items: reconcile(o.items) }))
            }))
        }
        setPeopleModal(false)
        await saveData(newData)
    }, [data, saveData])

    const handleDeleteOption = useCallback(async (questionId: string, optionId: string) => {
        const data = dataRef.current
        if (!data) return
        const newQuestions = data.questions.map(q =>
            q.id === questionId ? { ...q, options: q.options.filter(o => o.id !== optionId) } : q
        )
        await saveData({ ...data, questions: newQuestions })
    }, [saveData])

    // Stable modal openers — inline closures here would defeat the sections' memo.
    const openEditQuestion = useCallback((question: Question) => setQuestionModal({ question }), [])
    const openAddOption = useCallback((questionId: string) => setOptionModal({ questionId, option: null }), [])
    const openEditOption = useCallback((questionId: string, option: Option) => setOptionModal({ questionId, option }), [])
    const openPeopleModal = useCallback(() => setPeopleModal(true), [])
    const openAlwaysModal = useCallback(() => setAlwaysModal(true), [])

    const allItemNames = useMemo(() => {
        if (!data) return []
        const names = [
            ...(data.alwaysNeededItems ?? []).filter(i => !i.deletedAt).map(i => i.text),
            ...data.questions.filter(q => !q.deletedAt).flatMap(q => q.options.flatMap(o => o.items.filter(i => !i.deletedAt).map(i => i.text))),
        ].filter(Boolean)
        return [...new Set(names)]
    }, [data])

    // Memoized so their identity is stable across re-renders that don't change
    // the data (modal opens, sync ticks) — they feed the memoized sections.
    const people = useMemo(() => (data?.people ?? []).filter(p => !p.deletedAt), [data])
    const activeQuestions = useMemo(() => (data?.questions ?? []).filter(q => !q.deletedAt), [data])
    const activeAlwaysNeededItems = useMemo(() => (data?.alwaysNeededItems ?? []).filter(i => !i.deletedAt), [data])

    if (error) return <div className="p-8 text-red-600">Error: {error}</div>
    if (!data) return <div className="p-8 text-gray-500">Loading…</div>

    return (
        <div className="w-full flex flex-col items-center py-8 px-4">
            <div className="w-full max-w-3xl space-y-4">
                <div className="mb-2">
                    <h1 className="text-2xl font-bold text-gray-900">{isForeign ? 'Questions & Items' : 'My Questions & Items'}</h1>
                    <p className="mt-1 text-gray-600 text-sm">Customise the questions and packing items that generate your lists. Changes here affect all future packing lists you create.</p>
                    {!isForeign && <p className="mt-1 text-xs text-gray-400">Want to start from scratch? <Link to="/wizard" className="text-primary-600 hover:underline">Redo the setup wizard</Link> to regenerate your questions.</p>}
                </div>
                {!isForeign && (
                    <AgePromotionCard
                        questionSet={data}
                        onApply={saveData}
                        manualTransitions={manualPromotions}
                        onManualHandled={() => setManualPromotions([])}
                    />
                )}
                {!isForeign && <TemplateUpdatesCard questionSet={data} onApply={saveData} />}
                <PersonLegend people={people} onEdit={openPeopleModal} />
                <AlwaysSection items={activeAlwaysNeededItems} people={people} onEdit={openAlwaysModal} />
                {activeQuestions.map((q, qi) => (
                    <QuestionSection
                        key={q.id}
                        question={q}
                        people={people}
                        canMoveUp={qi > 0}
                        canMoveDown={qi < activeQuestions.length - 1}
                        onEdit={openEditQuestion}
                        onDelete={handleDeleteQuestion}
                        onAddOption={openAddOption}
                        onEditOption={openEditOption}
                        onDeleteOption={handleDeleteOption}
                        onMove={handleMoveQuestion}
                    />
                ))}
                <button
                    type="button"
                    onClick={() => setQuestionModal({ question: null })}
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                >
                    + Add Question
                </button>
            </div>
            {questionModal !== null && (
                <QuestionModal
                    question={questionModal.question}
                    onSave={handleQuestionModalSave}
                    onClose={() => setQuestionModal(null)}
                />
            )}
            {optionModal !== null && (
                <OptionEditModal
                    option={optionModal.option}
                    people={people}
                    allItemNames={allItemNames}
                    onSave={handleOptionModalSave}
                    onClose={() => setOptionModal(null)}
                />
            )}
            {alwaysModal && (
                <AlwaysNeededModal
                    initialItems={activeAlwaysNeededItems}
                    people={people}
                    allItemNames={allItemNames}
                    onSave={handleAlwaysSave}
                    onClose={() => setAlwaysModal(false)}
                />
            )}
            {peopleModal && (
                <PeopleModal
                    people={people}
                    onSave={handlePeopleSave}
                    onClose={() => setPeopleModal(false)}
                />
            )}
        </div>
    )
}
