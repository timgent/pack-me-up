/**
 * Arranging the sections a generated packing list is split into.
 *
 * This is the one arrangement on the questions page that belongs to no single
 * question. A section spans questions — "Toiletries" is filled by the
 * always-needed list and by two options besides — so it cannot be moved by
 * dragging items inside any one of them, which is why the item reorder view
 * refuses to drag its headers at all ("a section moves by moving its items").
 * Here the section *is* the row, and there are no items in sight.
 *
 * See `edit-questions/section-order.ts` for what the order means and how a set
 * that has never been arranged still has one.
 */
import { memo, useRef } from 'react'
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
import { sectionAccent } from '../edit-questions/section-accent'
import { moveSectionLabel } from '../edit-questions/section-order'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

// Drags only ever move rows up and down the list.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** How many chips are drawn before the strip stops naming them. */
const CHIP_LIMIT = 4

/**
 * The order, at a glance, above the sections it describes.
 *
 * Compact and always visible rather than tucked behind a menu, so the answer to
 * "why is my list in this order" sits in eyeshot of the sections it is about.
 * A named section wears the same colour here that it wears on every card below
 * — the colour comes from the name — which is what lets the strip be scanned
 * rather than read. Under two sections there is no order to show and nothing to
 * arrange, so it says nothing at all.
 *
 * On a phone the chips give way to the same names as one truncated line. Nine
 * chips wrap to five lines at 390px, which is a lot of screen for something
 * read once — but the reason it is not simply a sideways-scrolling row of chips
 * instead is worse than cosmetic: a scrollable element wider than the screen
 * makes Chrome widen the *layout viewport* to fit its content, and every
 * `position: fixed` overlay on the page — this one, and the item reorganiser —
 * is then laid out against that width and lands off-screen. Truncation clips
 * without scrolling, so it cannot do that.
 */
export const SectionOrderLegend = memo(function SectionOrderLegend({ labels, onEdit }: {
    labels: string[]
    /** Omit on a read-only (foreign pod) page: the order is shown, not offered. */
    onEdit?: () => void
}) {
    if (labels.length < 2) return null
    const shown = labels.slice(0, CHIP_LIMIT)
    const hidden = labels.length - shown.length
    return (
        <div className="flex items-center gap-2 mb-4">
            {/* On a phone the caption costs a third of the row it introduces,
                and the names beside a "Reorder" button say what it would have
                said. Still read out, just not drawn. */}
            <span className="sr-only sm:not-sr-only sm:text-xs sm:text-gray-400 dark:sm:text-gray-500 sm:shrink-0">List order</span>
            <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-1.5 sm:min-w-0">
                {shown.map((label, i) => {
                    const accent = sectionAccent(label, false)
                    return (
                        <span
                            key={label}
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border ${accent.border} ${accent.header} pl-1.5 pr-2 py-0.5 text-[11px] ${accent.text}`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${accent.rail}`} aria-hidden="true" />
                            <span className="sr-only">{`${i + 1}. `}</span>
                            {label}
                        </span>
                    )
                })}
                {hidden > 0 && <span className="text-[11px] text-gray-400 dark:text-gray-500">+{hidden} more</span>}
            </div>
            <span className="sm:hidden flex-1 min-w-0 truncate text-[11px] text-gray-400 dark:text-gray-500">
                {labels.join(' · ')}
            </span>
            {onEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    aria-label="Reorder sections"
                    // A full-size touch target, like every other control the
                    // page expects a thumb to find. At the strip's own scale it
                    // was 24px tall, and missing it looked like a dead button.
                    className="inline-flex items-center justify-center gap-1 shrink-0 h-11 px-3 text-[11px] font-medium rounded-lg text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40 active:bg-primary-100 dark:active:bg-primary-900/40 transition-colors"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                    Reorder
                </button>
            )}
        </div>
    )
})

function SortableSectionRow({ label, position, total, onMove }: {
    label: string
    position: number
    total: number
    onMove: (to: number) => void
}) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: label })
    const accent = sectionAccent(label, false)
    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`flex items-center gap-1 rounded-lg border bg-white dark:bg-gray-900 p-2 ${isDragging ? 'relative z-10 border-primary-400 dark:border-primary-600 shadow-md opacity-95' : accent.border}`}
        >
            <button
                type="button"
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-grab active:cursor-grabbing touch-none"
                title="Drag to reorder"
                aria-label={`Drag ${label} to reorder`}
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
                </svg>
            </button>
            <span className={`w-1.5 h-5 rounded-full shrink-0 ${accent.rail}`} aria-hidden="true" />
            <span className="flex-1 min-w-0 truncate text-sm text-gray-800 dark:text-gray-100 px-1">{label}</span>
            {/* Named destinations rather than bare arrows: this is the path that
                works from the keyboard, and "move up" alone doesn't say where. */}
            <button
                type="button"
                disabled={position === 0}
                onClick={() => onMove(position - 1)}
                aria-label={`Move ${label} up`}
                className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:text-gray-200 disabled:border-gray-100 dark:disabled:border-gray-800 disabled:hover:bg-transparent transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
            </button>
            <button
                type="button"
                disabled={position === total - 1}
                onClick={() => onMove(position + 1)}
                aria-label={`Move ${label} down`}
                className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:text-gray-200 disabled:border-gray-100 dark:disabled:border-gray-800 disabled:hover:bg-transparent transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
        </div>
    )
}

/**
 * The section order, as the only thing on the screen.
 *
 * Full-screen for the same reason the item reorder is (a drag needs a scroll
 * container it owns), and with no Save for the same reason too: like everything
 * else on this page the moves are written as they are made.
 */
export function SectionOrderModal({ labels, onChange, onClose }: {
    labels: string[]
    onChange: (labels: string[]) => void
    onClose: () => void
}) {
    useBodyScrollLock()
    const scrollRef = useRef<HTMLDivElement>(null)

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return
        onChange(moveSectionLabel(labels, labels.indexOf(String(active.id)), labels.indexOf(String(over.id))))
    }

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        >
            <div
                role="dialog"
                aria-label="Reorder list sections"
                className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reorder sections</h2>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        The order your packing lists are grouped in — every list, including the ones you already have.
                    </p>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-2 px-0.5">
                        Drag the handle (press and hold on touch) to reorder, or use the arrows.
                    </div>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis]}
                        // Only ever the modal's own scroll area — `true` would let
                        // dnd-kit scroll every scrollable ancestor, the window
                        // included, moving rows the gesture has already measured.
                        autoScroll={{ canScroll: el => el === scrollRef.current }}
                        accessibility={{
                            screenReaderInstructions: {
                                draggable: 'Press space to pick up the section, the arrow keys to move it '
                                    + 'up or down the list, space again to drop it, and escape to cancel. '
                                    + 'The arrow buttons on each row do the same thing one step at a time.',
                            },
                            announcements: {
                                onDragStart: ({ active }) => `Picked up ${active.id}.`,
                                onDragOver: ({ active, over }) => over && over.id !== active.id
                                    ? `${active.id}, position ${labels.indexOf(String(over.id)) + 1} of ${labels.length}.`
                                    : undefined,
                                onDragEnd: ({ active, over }) => over
                                    ? `Dropped ${active.id} at position ${labels.indexOf(String(over.id)) + 1} of ${labels.length}.`
                                    : `Dropped ${active.id} back where it started.`,
                                onDragCancel: ({ active }) => `Cancelled moving ${active.id}.`,
                            },
                        }}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={labels} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                                {labels.map((label, i) => (
                                    <SortableSectionRow
                                        key={label}
                                        label={label}
                                        position={i}
                                        total={labels.length}
                                        onMove={to => onChange(moveSectionLabel(labels, i, to))}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}
