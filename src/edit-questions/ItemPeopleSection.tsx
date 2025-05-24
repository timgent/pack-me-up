import { Control, useFieldArray, UseFormRegister, UseFormWatch } from "react-hook-form";
import { PackingListQuestionSet, Person } from "./types";

interface ItemPeopleSectionProps {
    control: Control<PackingListQuestionSet>;
    questionIndex: number;
    optionIndex: number;
    itemIndex: number;
    register: UseFormRegister<PackingListQuestionSet>;
    watch: UseFormWatch<PackingListQuestionSet>;
    allPeople: Person[];
}

export function ItemPeopleSection({ control, questionIndex, optionIndex, itemIndex, register, watch, allPeople }: ItemPeopleSectionProps) {
    return (
        <>
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