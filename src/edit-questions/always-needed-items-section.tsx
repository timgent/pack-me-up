import { Button } from '../components/Button'
import { UseFormRegister, UseFormSetValue, Control, useFieldArray } from 'react-hook-form'
import { PackingListQuestionSet, Person, Item } from './types'
import { useRef, useEffect, useState, startTransition, memo } from 'react'
import { LazyItem } from './lazy-item'

interface AlwaysNeededItemsSectionProps {
    control: Control<PackingListQuestionSet>;
    register: UseFormRegister<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    people: Person[];
    triggerScrollToLast?: number;
    getAllItemNames: () => string[];
}

export const AlwaysNeededItemsSection = memo(function AlwaysNeededItemsSection({ control, register, setValue, people, triggerScrollToLast, getAllItemNames }: AlwaysNeededItemsSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [hasBeenExpanded, setHasBeenExpanded] = useState(false);
    const [collapseVersion, setCollapseVersion] = useState(0);

    const { fields: itemFields, append: appendItem } = useFieldArray({
        control,
        name: "alwaysNeededItems"
    });

    const selectRefs = useRef<(HTMLDivElement | null)[]>([]);
    const expectedNewLengthRef = useRef<number | null>(null);
    const [newItemIndex, setNewItemIndex] = useState<number | null>(null);
    const pendingScrollRef = useRef(false);

    useEffect(() => {
        if (expectedNewLengthRef.current === itemFields.length) {
            expectedNewLengthRef.current = null;
            const idx = itemFields.length - 1;
            selectRefs.current[idx]?.querySelector('input')?.focus();
            selectRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setNewItemIndex(idx);
        }
    }, [itemFields.length]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!triggerScrollToLast) return;
        setIsExpanded(true);
        setHasBeenExpanded(true);
        pendingScrollRef.current = true;
    }, [triggerScrollToLast]);

    useEffect(() => {
        if (!pendingScrollRef.current || !isExpanded) return;
        pendingScrollRef.current = false;
        const idx = itemFields.length - 1;
        if (idx >= 0) {
            requestAnimationFrame(() => {
                selectRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            setNewItemIndex(idx);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isExpanded, triggerScrollToLast]);

    const allItemNames = getAllItemNames();

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <button
                type="button"
                onClick={() => {
                    if (hasBeenExpanded) {
                        setIsExpanded(e => {
                            if (e) setCollapseVersion(v => v + 1);
                            return !e;
                        });
                    } else {
                        startTransition(() => { setIsExpanded(true); setHasBeenExpanded(true); });
                    }
                }}
                className="flex items-center gap-2 mb-4 w-full text-left hover:bg-gray-50 -mx-4 -mt-4 px-4 pt-4 rounded-t-lg transition-colors duration-200"
            >
                <svg
                    className={`w-5 h-5 text-gray-400 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <div>
                    <h2 className="text-lg font-medium text-gray-900">Always Needed Items <span className="text-sm font-normal text-gray-500">({itemFields.length} {itemFields.length === 1 ? 'item' : 'items'})</span></h2>
                    <p className="text-sm text-gray-600">Items that should always be included in the packing list.</p>
                </div>
            </button>

            {hasBeenExpanded && (
                <div className={`space-y-3${isExpanded ? '' : ' hidden'}`}>
                {itemFields.map((_item: Item, itemIndex: number) => (
                    <LazyItem
                        key={itemIndex}
                        control={control}
                        basePath={`alwaysNeededItems.${itemIndex}`}
                        register={register}
                        setValue={setValue}
                        allPeople={people}
                        allItemNames={allItemNames}
                        isHighlighted={itemIndex === newItemIndex}
                        onRemove={() => {
                            const newItems = itemFields.filter((_: Item, i: number) => i !== itemIndex);
                            setValue("alwaysNeededItems", newItems);
                        }}
                        refCallback={el => { selectRefs.current[itemIndex] = el; }}
                        autoActivate={expectedNewLengthRef.current !== null && itemIndex === expectedNewLengthRef.current - 1}
                        resetKey={collapseVersion}
                    />
                ))}
                <Button
                    type="button"
                    onClick={() => {
                        expectedNewLengthRef.current = itemFields.length + 1;
                        appendItem({ text: "", personSelections: [] });
                    }}
                    variant="ghost"
                    className="mt-2"
                >
                    Add Item
                </Button>
            </div>
            )}
        </div>
    );
});
