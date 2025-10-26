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
        <div className="flex items-center gap-2 flex-wrap mb-2">
            <button
                type="button"
                onClick={handleToggleAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border-2 border-primary-200 text-primary-700 bg-white hover:bg-primary-50 hover:border-primary-300 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
                aria-label={allSelected ? 'Unselect all people' : 'Select all people'}
            >
                <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                >
                    {allSelected ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    )}
                </svg>
                {allSelected ? 'Unselect All' : 'Select All'}
            </button>
            {allPeople.map((person, personIndex) => {
                const isSelected = personSelections?.[personIndex]?.selected ?? false;
                return (
                    <label
                        key={person.id}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                            isSelected
                                ? 'bg-primary-50 border-primary-400 text-primary-900 shadow-sm'
                                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        <input
                            type="checkbox"
                            {...register(`${basePath}.personSelections.${personIndex}.selected` as const)}
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                            aria-label={`Select ${person.name}`}
                        />
                        <span className="font-medium select-none">{person.name}</span>
                        <input type="hidden" {...register(`${basePath}.personSelections.${personIndex}.personId` as const)} value={person.id} />
                    </label>
                )
            })}
        </div>
    )
}