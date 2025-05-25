import { Control, useFieldArray, UseFormRegister, UseFormWatch, UseFormSetValue, FieldPath } from "react-hook-form";
import { PackingListQuestionSet, Person } from "./types";

interface ItemPeopleSectionProps {
    control: Control<PackingListQuestionSet>;
    questionIndex: number;
    optionIndex: number;
    itemIndex: number;
    register: UseFormRegister<PackingListQuestionSet>;
    watch: UseFormWatch<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    allPeople: Person[];
}

export function ItemPeopleSection({ control, questionIndex, optionIndex, itemIndex, register, watch, setValue, allPeople }: ItemPeopleSectionProps) {
    const personSelections = watch(`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}.personSelections`);
    const allSelected = personSelections?.every(selection => selection.selected) ?? false;

    const handleToggleAll = () => {
        const newValue = !allSelected;
        allPeople.forEach((person, index) => {
            setValue(
                `questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}.personSelections.${index}`,
                { personId: person.id, selected: newValue }
            );
        });
    };

    return (
        <>
            <button
                type="button"
                onClick={handleToggleAll}
                className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
                {allSelected ? 'Unselect All' : 'Select All'}
            </button>
            {allPeople.map((person, personIndex) => {
                return (
                    <label key={itemIndex + person.id} className="px-1" >
                        <span>{person.name}</span>
                        <input type="hidden" {...register(`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}.personSelections.${personIndex}.personId`)} value={person.id} />
                        <input className='ml-1' type="checkbox" key={`${questionIndex}-${optionIndex}-${itemIndex}-${personIndex}`} {...register(`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}.personSelections.${personIndex}.selected`)} />
                    </label>
                )
            })}
        </>
    )
}