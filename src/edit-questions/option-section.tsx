import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'
import { CustomCreatableSelect } from '../components/CreatableSelect'
import { UseFormRegister, UseFormWatch, UseFormSetValue, useFieldArray, Control, Controller } from 'react-hook-form'
import { Item, PackingListQuestionSet, Person } from './types'
import { useRef, useEffect, useState } from 'react'
import { ItemPeopleSection } from './item-people-section'

interface OptionSectionProps {
    control: Control<PackingListQuestionSet>;
    questionIndex: number;
    optionIndex: number;
    register: UseFormRegister<PackingListQuestionSet>;
    watch: UseFormWatch<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    removeOption: () => void;
    people: Person[];
    triggerAddItem?: number;
}

export function OptionSection({ control, questionIndex, optionIndex, register, watch, setValue, removeOption, people, triggerAddItem }: OptionSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { fields: itemFields, append: appendItem } = useFieldArray({
        control,
        name: `questions.${questionIndex}.options.${optionIndex}.items`
    })
    const allItems = [...new Set((watch('questions') ?? []).flatMap((q) =>
        q.options.flatMap((o) => o.items)
    ).filter(Boolean))] as Item[];
    const allItemNames = () => allItems.map((item) => item.text);
    const selectRefs = useRef<(HTMLDivElement | null)[]>([]);
    const shouldFocusRef = useRef(false);

    useEffect(() => {
        if (triggerAddItem !== undefined && triggerAddItem > 0) {
            setIsExpanded(true);
            shouldFocusRef.current = true;
            appendItem({ text: "", personSelections: [] });
        }
    }, [triggerAddItem]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        // Only focus/scroll if Add Item was triggered
        if (shouldFocusRef.current) {
            if (selectRefs.current[itemFields.length - 1]) {
                const input = selectRefs.current[itemFields.length - 1]?.querySelector('input');
                if (input) {
                    input.focus();
                }
            }
            containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            shouldFocusRef.current = false;
        }
    }, [itemFields.length]);

    return (
        <div ref={containerRef} className="bg-gray-50 rounded-lg p-4">
            <div className={`flex items-start gap-2 sm:gap-4 ${isExpanded ? 'mb-4' : ''}`}>
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200 mt-7"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                >
                    <svg
                        className={`w-5 h-5 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <div className="flex-1">
                    <Input
                        label={`Option ${optionIndex + 1}`}
                        placeholder="Enter option text"
                        {...register(`questions.${questionIndex}.options.${optionIndex}.text`)}
                    />
                </div>
                <CloseButton
                    onClick={removeOption}
                    label={`Remove option ${optionIndex + 1}`}
                    className="mt-6"
                />
            </div>

            {isExpanded && <div className="ml-0 sm:ml-4 space-y-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Items:</div>
                {itemFields.map((_item: Item, itemIndex: number) => (
                    <div key={itemIndex} className="flex items-start gap-2 sm:gap-3">
                        <div className="flex-1" ref={el => { selectRefs.current[itemIndex] = el; }}>
                            <ItemPeopleSection
                                control={control}
                                basePath={`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}`}
                                register={register}
                                watch={watch}
                                setValue={setValue}
                                allPeople={people}
                            />
                            <Controller
                                control={control}
                                name={`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}`}
                                render={({ field: { value, onChange } }) =>
                                    <CustomCreatableSelect
                                        value={value.text}
                                        onChange={(newValue) => {
                                            onChange({ ...value, text: newValue })
                                        }}
                                        options={allItemNames()}
                                        placeholder="Enter item"
                                    />}
                            >
                            </Controller>
                        </div>
                        <CloseButton
                            onClick={() => {
                                const newItems = itemFields.filter((_: Item, i: number) => i !== itemIndex);
                                setValue(`questions.${questionIndex}.options.${optionIndex}.items`, newItems);
                            }}
                            label={`Remove item ${itemIndex + 1}`}
                        />
                    </div>
                ))}
                <Button
                    type="button"
                    onClick={() => {
                        shouldFocusRef.current = true;
                        appendItem({ text: "", personSelections: [] });
                    }}
                    variant="ghost"
                    className="mt-2"
                >
                    Add Item
                </Button>
            </div>}
        </div>
    );
} 