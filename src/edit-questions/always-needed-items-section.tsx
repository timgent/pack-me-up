import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'
import { CustomCreatableSelect } from '../components/CreatableSelect'
import { UseFormRegister, UseFormWatch, UseFormSetValue, Control, Controller, useFieldArray } from 'react-hook-form'
import { PackingListQuestionSet, Person, Item } from './types'
import { useRef, useEffect, useState } from 'react'
import { ItemPeopleSection } from './item-people-section'

interface AlwaysNeededItemsSectionProps {
    control: Control<PackingListQuestionSet>;
    register: UseFormRegister<PackingListQuestionSet>;
    watch: UseFormWatch<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    people: Person[];
}

export function AlwaysNeededItemsSection({ control, register, watch, setValue, people }: AlwaysNeededItemsSectionProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    const { fields: itemFields, append: appendItem } = useFieldArray({
        control,
        name: "alwaysNeededItems"
    });

    const allItems = [...new Set((watch('questions') ?? []).flatMap((q) =>
        q.options.flatMap((o) => o.items)
    ).filter(Boolean))] as Item[];
    const allItemNames = () => allItems.map((item) => item.text);
    const selectRefs = useRef<(HTMLDivElement | null)[]>([]);
    const previousLengthRef = useRef(itemFields.length);

    useEffect(() => {
        // Only focus if an item was added (not on initial render or removal)
        if (itemFields.length > previousLengthRef.current) {
            if (selectRefs.current[itemFields.length - 1]) {
                const input = selectRefs.current[itemFields.length - 1]?.querySelector('input');
                if (input) {
                    input.focus();
                }
            }
        }
        previousLengthRef.current = itemFields.length;
    }, [itemFields.length]);

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
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
                    <h2 className="text-lg font-medium text-gray-900">Always Needed Items</h2>
                    <p className="text-sm text-gray-600">Items that should always be included in the packing list.</p>
                </div>
            </button>

            {isExpanded && (
                <div className="space-y-3">
                {itemFields.map((_item: Item, itemIndex: number) => (
                    <div key={itemIndex} className="flex items-start gap-2 sm:gap-3">
                        <div className="flex-1" ref={el => { selectRefs.current[itemIndex] = el; }}>
                            <ItemPeopleSection
                                control={control}
                                basePath={`alwaysNeededItems.${itemIndex}`}
                                register={register}
                                watch={watch}
                                setValue={setValue}
                                allPeople={people}
                            />
                            <Controller
                                control={control}
                                name={`alwaysNeededItems.${itemIndex}`}
                                render={({ field: { value, onChange } }) =>
                                    <CustomCreatableSelect
                                        value={value.text}
                                        onChange={(newValue) => {
                                            onChange({ ...value, text: newValue })
                                        }}
                                        options={allItemNames()}
                                        placeholder="Enter item"
                                    />}
                            />
                        </div>
                        <CloseButton
                            onClick={() => {
                                const newItems = itemFields.filter((_: Item, i: number) => i !== itemIndex);
                                setValue("alwaysNeededItems", newItems);
                            }}
                            label={`Remove item ${itemIndex + 1}`}
                        />
                    </div>
                ))}
                <Button
                    type="button"
                    onClick={() => {
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
} 