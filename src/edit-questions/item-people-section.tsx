import { Control, UseFormRegister, UseFormWatch, UseFormSetValue } from "react-hook-form";
import { PackingListQuestionSet, Person } from "./types";

type ItemPath =
    | `alwaysNeededItems.${number}`
    | `questions.${number}.options.${number}.items.${number}`;

interface ItemPeopleSectionProps {
    control: Control<PackingListQuestionSet>;
    basePath: ItemPath;
    register: UseFormRegister<PackingListQuestionSet>;
    watch: UseFormWatch<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    allPeople: Person[];
}

export function ItemPeopleSection({ basePath, register, watch, setValue, allPeople }: ItemPeopleSectionProps) {
    const personSelections = watch(`${basePath}.personSelections` as const);
    const allSelected = personSelections?.every(selection => selection.selected) ?? false;

    const handleToggleAll = () => {
        const newValue = !allSelected;
        allPeople.forEach((person, index) => {
            setValue(
                `${basePath}.personSelections.${index}` as const,
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
                    <label key={person.id} className="px-1" >
                        <span>{person.name}</span>
                        <input type="hidden" {...register(`${basePath}.personSelections.${personIndex}.personId` as const)} value={person.id} />
                        <input className='ml-1' type="checkbox" {...register(`${basePath}.personSelections.${personIndex}.selected` as const)} />
                    </label>
                )
            })}
        </>
    )
}