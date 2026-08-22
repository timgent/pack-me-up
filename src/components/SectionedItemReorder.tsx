/**
 * Reorder view for an item list, split into sections.
 *
 * Position is the interaction — you drag an item under a header to put it in
 * that section — but nothing positional is stored. Every drop runs the sequence
 * back through `applySectionLayout`, which stamps each item with the nearest
 * header above it. See `item-sections.ts` for why the storage is stamped.
 */
import { useRef, useState } from 'react'
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
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { Item } from '../edit-questions/types'
import {
    applySectionLayout,
    buildSectionSequence,
    forgetEmptySection,
    reconcileEmptySections,
    isAtSectionEdge,
    moveItemToSection,
    moveItemWithinSection,
    removeSection,
    renameSection,
    sectionLabelAt,
    sectionLabelsIn,
    type SectionSequenceEntry,
} from '../edit-questions/item-sections'
import { sectionAccent } from '../edit-questions/section-accent'

// Drags only ever move rows up and down the list.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/**
 * A section's banner, and the drop target that puts an item into it.
 *
 * Drawn as a filled bar in the section's own colour rather than a caption with
 * a rule beside it: this is the line you drag an item across, so it has to be
 * obvious where one section stops and the next starts, and the colour is the
 * same one the section wears on the questions page behind the modal.
 */
function SectionHeaderRow({ id, label, isDefault, onRename, onRemove }: {
    id: string
    label: string
    isDefault: boolean
    onRename: (label: string) => void
    onRemove: () => void
}) {
    // Headers sit in the sortable context so items can be dropped across them,
    // but they aren't draggable themselves — a section moves by moving its items.
    const { setNodeRef, transform, transition } = useSortable({ id, disabled: true })
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(label)
    const accent = sectionAccent(label, isDefault)

    const commit = () => {
        const trimmed = draft.trim()
        if (trimmed && trimmed !== label) onRename(trimmed)
        else setDraft(label)
        setEditing(false)
    }

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className="pt-1"
        >
            {editing ? (
                <input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={e => {
                        if (e.key === 'Enter') commit()
                        if (e.key === 'Escape') { setDraft(label); setEditing(false) }
                    }}
                    aria-label={`Rename section ${label}`}
                    className="w-full border border-primary-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
            ) : (
                <div className={`flex items-center gap-2 rounded-lg border ${accent.border} ${accent.header} px-3 py-2`}>
                    <span className={`w-1.5 h-4 rounded-full shrink-0 ${accent.rail}`} aria-hidden="true" />
                    <span className={`text-sm font-semibold truncate ${accent.text}`}>
                        {label}
                    </span>
                    {!isDefault && (
                        <>
                            <button
                                type="button"
                                onClick={() => { setDraft(label); setEditing(true) }}
                                aria-label={`Rename section ${label}`}
                                className={`ml-auto text-[11px] px-1 ${accent.muted} hover:text-primary-700`}
                            >
                                Rename
                            </button>
                            <button
                                type="button"
                                onClick={onRemove}
                                aria-label={`Remove section ${label}`}
                                className={`text-[11px] px-1 ${accent.muted} hover:text-red-600`}
                            >
                                Remove
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

/**
 * Every move the drag handle can make, offered as menu commands. Dragging is
 * the quick way; this is the way that works from the keyboard, with a screen
 * reader, or when the destination is off-screen — so it names its destinations
 * rather than relying on aim.
 */
function MoveMenu({ label, canMoveToTop, canMoveToBottom, otherSections, onMoveWithinSection, onMoveToSection }: {
    label: string
    canMoveToTop: boolean
    canMoveToBottom: boolean
    otherSections: string[]
    onMoveWithinSection: (position: 'top' | 'bottom') => void
    onMoveToSection: (label: string) => void
}) {
    const hasMoves = canMoveToTop || canMoveToBottom || otherSections.length > 0
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    disabled={!hasMoves}
                    title="Move item"
                    aria-label={`Move ${label}`}
                    className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:text-gray-200 disabled:border-gray-100 disabled:hover:bg-transparent transition-colors"
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
                    className="min-w-52 max-w-72 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50"
                >
                    {canMoveToTop && (
                        <DropdownMenu.Item
                            onSelect={() => onMoveWithinSection('top')}
                            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 cursor-default outline-none"
                        >
                            Move to top of section
                        </DropdownMenu.Item>
                    )}
                    {canMoveToBottom && (
                        <DropdownMenu.Item
                            onSelect={() => onMoveWithinSection('bottom')}
                            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 cursor-default outline-none"
                        >
                            Move to bottom of section
                        </DropdownMenu.Item>
                    )}
                    {otherSections.length > 0 && (canMoveToTop || canMoveToBottom) && (
                        <DropdownMenu.Separator className="my-1 h-px bg-gray-100" />
                    )}
                    {otherSections.map(section => (
                        <DropdownMenu.Item
                            key={section}
                            onSelect={() => onMoveToSection(section)}
                            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 cursor-default outline-none truncate"
                        >
                            Move to {section}
                        </DropdownMenu.Item>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    )
}

function SortableSectionItem({ id, item, canMoveToTop, canMoveToBottom, otherSections, onMoveWithinSection, onMoveToSection }: {
    id: string
    item: Item
    canMoveToTop: boolean
    canMoveToBottom: boolean
    otherSections: string[]
    onMoveWithinSection: (position: 'top' | 'bottom') => void
    onMoveToSection: (label: string) => void
}) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            data-reorder-row
            className={`flex items-center gap-1 rounded-lg border bg-white p-2 ${isDragging ? 'relative z-10 border-primary-400 shadow-md opacity-95' : 'border-gray-200'}`}
        >
            <button
                type="button"
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-grab active:cursor-grabbing touch-none"
                title="Drag to reorder or move between sections"
                aria-label={`Drag ${item.text || 'item'} to reorder`}
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
                </svg>
            </button>
            <span className="flex-1 min-w-0 truncate text-sm text-gray-800 px-1">
                {item.text || <span className="text-gray-400 italic">Unnamed item</span>}
            </span>
            <MoveMenu
                label={item.text || 'item'}
                canMoveToTop={canMoveToTop}
                canMoveToBottom={canMoveToBottom}
                otherSections={otherSections}
                onMoveWithinSection={onMoveWithinSection}
                onMoveToSection={onMoveToSection}
            />
        </div>
    )
}

export function SectionedItemReorder({ items, defaultLabel, emptySections, scrollRef, onChange }: {
    items: Item[]
    /** Section name for items carrying no category — what the list will call them. */
    defaultLabel: string
    /**
     * Sections of this list with nothing in them yet. They arrive as a prop and
     * go back through `onChange` rather than living here: an empty section used
     * to be view state that evaporated when the view closed, which is exactly
     * what made "create a section, then fill it" impossible to offer anywhere.
     */
    emptySections: string[] | undefined
    /** Confines drag auto-scroll to one element. Omit to let the window scroll. */
    scrollRef?: React.RefObject<HTMLDivElement | null>
    onChange: (items: Item[], emptySections: string[] | undefined) => void
}) {
    const sequence = buildSectionSequence(items, defaultLabel, emptySections ?? [])

    // dnd-kit needs a stable id per row across reorders. Items may have no `id`
    // yet (defaults not saved), so map each object to a client-only drag id.
    const dragIdMap = useRef(new WeakMap<Item, string>())
    const dragIdSeq = useRef(0)
    const entryId = (entry: SectionSequenceEntry): string => {
        if (entry.kind === 'header') return `header:${entry.label}`
        let id = dragIdMap.current.get(entry.item)
        if (!id) {
            id = `item-${dragIdSeq.current++}`
            dragIdMap.current.set(entry.item, id)
        }
        return id
    }
    const entryIds = sequence.map(entryId)

    const applySequence = (next: SectionSequenceEntry[]) => {
        const updated = applySectionLayout(next, defaultLabel, new Date().toISOString())
        // A section that gained items no longer needs recording; one whose last
        // item was just dragged out starts being recorded, so dragging a section
        // empty doesn't destroy it mid-reorganisation.
        onChange(updated, reconcileEmptySections(items, updated, emptySections))
    }

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const handleDragEnd = (e: DragEndEvent) => {
        const { active, over } = e
        if (!over || active.id === over.id) return
        const from = entryIds.indexOf(String(active.id))
        const to = entryIds.indexOf(String(over.id))
        if (from === -1 || to === -1) return
        const next = [...sequence]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        applySequence(next)
    }

    const sectionLabels = sectionLabelsIn(sequence, defaultLabel)

    // Screen-reader narration for a keyboard drag. dnd-kit's defaults would read
    // out the internal drag ids, and they know nothing about sections — so both
    // the item and where it has landed are named here instead.
    const describe = (id: string | number) => {
        const entry = sequence[entryIds.indexOf(String(id))]
        return entry?.kind === 'item' ? (entry.item.text || 'unnamed item') : 'item'
    }
    const describeDrop = (activeId: string | number, overId: string | number) => {
        const from = entryIds.indexOf(String(activeId))
        const to = entryIds.indexOf(String(overId))
        if (from === -1 || to === -1) return describe(activeId)
        const next = [...sequence]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        const landed = next.indexOf(moved)
        const label = sectionLabelAt(next, landed, defaultLabel)
        const position = next.slice(0, landed).filter((e, i) =>
            e.kind === 'item' && sectionLabelAt(next, i, defaultLabel) === label).length + 1
        return `${describe(activeId)}, position ${position} in ${label}`
    }

    const renameSectionAt = (from: string, to: string) => {
        const renamed = emptySections?.map(label => label === from ? to : label)
        onChange(renameSection(items, from, to, new Date().toISOString()), renamed)
    }

    // Removing a section is the one deliberate way to lose one, so it drops the
    // name itself rather than going through `reconcileEmptySections` — which
    // exists to *keep* a section whose items merely left.
    const removeSectionAt = (label: string) => {
        onChange(
            removeSection(items, label, new Date().toISOString()),
            forgetEmptySection(emptySections, label),
        )
    }

    return (
        <>
            <div className="text-[11px] text-gray-400 mb-2 px-0.5">
                Drag the handle (press and hold on touch) to reorder, or focus it and press
                space, then the arrow keys. Each item's move menu jumps it to the top or
                bottom of its section, or into another section.
            </div>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                // Only ever auto-scroll the modal's own scroll area — see the
                // note on the unsectioned editor for why.
                // Only ever the container it was given. `true` would let
                // dnd-kit scroll every scrollable ancestor, the window
                // included — which moves the page, and on a phone the URL bar,
                // underneath a gesture that has already measured it.
                autoScroll={{ canScroll: (el) => el === scrollRef?.current }}
                accessibility={{
                    screenReaderInstructions: {
                        draggable: 'Press space to pick up the item, the arrow keys to move it '
                            + 'up or down the list and across section headings, space again to '
                            + 'drop it, and escape to cancel. The move menu on each row can also '
                            + 'send it straight to the top or bottom of a section.',
                    },
                    announcements: {
                        onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
                        // dnd-kit reports the item as over itself the moment it
                        // is picked up; announcing that would talk over the
                        // "picked up" message before it has been read.
                        onDragOver: ({ active, over }) =>
                            over && over.id !== active.id ? `${describeDrop(active.id, over.id)}.` : undefined,
                        onDragEnd: ({ active, over }) => over
                            ? `Dropped ${describeDrop(active.id, over.id)}.`
                            : `Dropped ${describe(active.id)} back where it started.`,
                        onDragCancel: ({ active }) => `Cancelled moving ${describe(active.id)}.`,
                    },
                }}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={entryIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                        {sequence.map((entry, i) => entry.kind === 'header' ? (
                            <SectionHeaderRow
                                key={entryIds[i]}
                                id={entryIds[i]}
                                label={entry.label}
                                isDefault={entry.label === defaultLabel}
                                onRename={to => renameSectionAt(entry.label, to)}
                                onRemove={() => removeSectionAt(entry.label)}
                            />
                        ) : (
                            <SortableSectionItem
                                key={entryIds[i]}
                                id={entryIds[i]}
                                item={entry.item}
                                canMoveToTop={!isAtSectionEdge(sequence, i, 'top')}
                                canMoveToBottom={!isAtSectionEdge(sequence, i, 'bottom')}
                                otherSections={sectionLabels.filter(l => l !== sectionLabelAt(sequence, i, defaultLabel))}
                                onMoveWithinSection={position => applySequence(moveItemWithinSection(sequence, i, position))}
                                onMoveToSection={label => applySequence(moveItemToSection(sequence, i, label, defaultLabel))}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </>
    )
}
