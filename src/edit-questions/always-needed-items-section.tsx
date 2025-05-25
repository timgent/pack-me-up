import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'
import { CustomCreatableSelect } from '../components/CreatableSelect'
import { UseFormRegister, UseFormWatch, UseFormSetValue, Control, Controller, useFieldArray } from 'react-hook-form'
import { PackingListQuestionSet, Person, Item } from './types'
import { useRef, useEffect } from 'react'
import { ItemPeopleSection } from './item-people-section'

interface AlwaysNeededItemsSectionProps {
    control: Control<PackingListQuestionSet>;
    register: UseFormRegister<PackingListQuestionSet>;
    watch: UseFormWatch<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    people: Person[];
}

export function AlwaysNeededItemsSection({ control, register, watch, setValue, people }: AlwaysNeededItemsSectionProps) {
    const { fields: itemFields, append: appendItem } = useFieldArray({
        control,
        name: "alwaysNeededItems"
    });

    const allItems = [...new Set((watch('questions') ?? []).flatMap((q) =>
        q.options.flatMap((o) => o.items)
    ).filter(Boolean))] as Item[];
    const allItemNames = () => allItems.map((item) => item.text);
    const selectRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        if (selectRefs.current[itemFields.length - 1]) {
            const input = selectRefs.current[itemFields.length - 1]?.querySelector('input');
            if (input) {
                input.focus();
            }
        }
    }, [itemFields.length]);

    return (
        <div className="bg-gray-50 rounded-lg p-4">
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Always Needed Items</h2>
                <p className="text-sm text-gray-600">Items that should always be included in the packing list.</p>
            </div>

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
        </div>
    );
} 