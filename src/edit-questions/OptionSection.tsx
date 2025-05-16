import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'
import { CustomCreatableSelect } from '../components/CreatableSelect'
import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form'
import { Item, PackingListQuestionSet, Person } from './types'
import { useRef, useEffect } from 'react'

interface OptionSectionProps {
    questionIndex: number;
    optionIndex: number;
    register: UseFormRegister<PackingListQuestionSet>;
    watch: UseFormWatch<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    removeOption: () => void;
    people: Person[];
}

export function OptionSection({ questionIndex, optionIndex, register, watch, setValue, removeOption, people }: OptionSectionProps) {
    const items = watch(`questions.${questionIndex}.options.${optionIndex}.items`) || [];
    const allItems = [...new Set(watch('questions').flatMap((q) =>
        q.options.flatMap((o) => o.items)
    ).filter(Boolean))] as Item[];
    const allItemNames = () => allItems.map((item) => item.text);
    const selectRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        if (selectRefs.current[items.length - 1]) {
            const input = selectRefs.current[items.length - 1]?.querySelector('input');
            if (input) {
                input.focus();
            }
        }
    }, [items.length]);

    return (
        <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-start gap-2 sm:gap-4 mb-4">
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

            <div className="ml-0 sm:ml-4 space-y-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Items:</div>
                {items.map((item: Item, itemIndex: number) => (
                    <div key={itemIndex} className="flex items-start gap-2 sm:gap-3">
                        <div className="flex-1" ref={el => { selectRefs.current[itemIndex] = el; }}>
                            {people.map((person) => {
                                return (
                                    <div key={person.order}>
                                        {person.name}
                                    </div>
                                )
                            })}
                            <CustomCreatableSelect
                                value={item.text}
                                onChange={(value) => {
                                    const newItems = [...items];
                                    newItems[itemIndex] = { text: value, personSelections: [] };
                                    setValue(`questions.${questionIndex}.options.${optionIndex}.items`, newItems);
                                }}
                                options={allItemNames()}
                                placeholder="Enter item"
                            />
                        </div>
                        <CloseButton
                            onClick={() => {
                                const newItems = items.filter((_: Item, i: number) => i !== itemIndex);
                                setValue(`questions.${questionIndex}.options.${optionIndex}.items`, newItems);
                            }}
                            label={`Remove item ${itemIndex + 1}`}
                        />
                    </div>
                ))}
                <Button
                    type="button"
                    onClick={() => {
                        setValue(
                            `questions.${questionIndex}.options.${optionIndex}.items`,
                            [...items, ""]
                        );
                    }}
                    variant="ghost"
                    className="mt-2"
                >
                    Add Item
                </Button>
            </div>
        </div>
    );
} 