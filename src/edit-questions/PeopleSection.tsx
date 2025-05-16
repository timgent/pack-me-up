import { Control, UseFormRegister } from 'react-hook-form'
import { PackingListQuestionSet, Person } from './types'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'

interface PeopleSectionProps {
    control: Control<PackingListQuestionSet>;
    register: UseFormRegister<PackingListQuestionSet>;
    fields: Person[];
    append: (value: Person) => void;
    remove: (index: number) => void;
}

export function PeopleSection({ control, register, fields, append, remove }: PeopleSectionProps) {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="space-y-4">
                {fields.map((person, personIndex) => (
                    <div key={person.id} className="flex items-center gap-2">
                        <div className="flex-1">
                            <Input
                                label={`Person ${personIndex + 1}`}
                                placeholder="Enter person name"
                                {...register(`people.${personIndex}.name`)}
                            />
                        </div>
                        {fields.length > 1 && (
                            <CloseButton
                                onClick={() => remove(personIndex)}
                                label={`Remove person ${personIndex + 1}`}
                                className="mt-6"
                            />
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-4">
                <Button
                    type="button"
                    onClick={() => append({ id: crypto.randomUUID(), name: "" })}
                    variant="secondary"
                >
                    Add Person
                </Button>
            </div>
        </div>
    );
} 