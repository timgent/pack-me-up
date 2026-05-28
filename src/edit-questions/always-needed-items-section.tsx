import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'
import { CustomCreatableSelect } from '../components/CreatableSelect'
import { UseFormRegister, UseFormWatch, UseFormSetValue, Control, Controller, useFieldArray } from 'react-hook-form'
import { PackingListQuestionSet, Person, Item } from './types'
import { useState } from 'react'
import { ItemPeopleSection } from './item-people-section'
import { QuestionItemAddModal } from './question-item-add-modal'

interface AlwaysNeededItemsSectionProps {
    control: Control<PackingListQuestionSet>;
    register: UseFormRegister<PackingListQuestionSet>;
    watch: UseFormWatch<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    people: Person[];
}

export function AlwaysNeededItemsSection({ control, register, watch, setValue, people }: AlwaysNeededItemsSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const { fields: itemFields, append: appendItem } = useFieldArray({
        control,
        name: "alwaysNeededItems"
    });

    const allItems = [...new Set((watch('questions') ?? []).flatMap((q) =>
        q.options.flatMap((o) => o.items)
    ).filter(Boolean))] as Item[];
    const allItemNames = () => allItems.map((item) => item.text);

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
                    <h2 className="text-lg font-medium text-gray-900">Always Needed Items <span className="text-sm font-normal text-gray-500">({itemFields.length} {itemFields.length === 1 ? 'item' : 'items'})</span></h2>
                    <p className="text-sm text-gray-600">Items that should always be included in the packing list.</p>
                </div>
            </button>

            {isExpanded && (
                <div className="space-y-3">
                {itemFields.map((_item: Item, itemIndex: number) => (
                    <div key={itemIndex} className="flex items-start gap-2 sm:gap-3 rounded-md">
                        <div className="flex-1">
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
                    onClick={() => setIsAddModalOpen(true)}
                    variant="ghost"
                    className="mt-2"
                >
                    Add Item
                </Button>
            </div>
            )}
            <QuestionItemAddModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onConfirm={(text) => appendItem({ text, personSelections: [] })}
                existingItemNames={allItemNames()}
            />
        </div>
    );
}
