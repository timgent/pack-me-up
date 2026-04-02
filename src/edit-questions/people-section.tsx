import { Control, UseFormRegister } from 'react-hook-form'
import { PackingListQuestionSet, Person } from './types'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'
import { useState } from 'react'

interface PeopleSectionProps {
    control: Control<PackingListQuestionSet>;
    register: UseFormRegister<PackingListQuestionSet>;
    fields: Person[];
    append: (value: Person) => void;
    remove: (index: number) => void;
}

export function PeopleSection({ register, fields, append, remove }: PeopleSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const personCount = fields.length;
    const personLabel = personCount === 1 ? '1 person' : `${personCount} people`;

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
                    <h2 className="text-lg font-medium text-gray-900">People <span className="text-sm font-normal text-gray-500">({personLabel})</span></h2>
                    <p className="text-sm text-gray-600">Who you are packing for.</p>
                </div>
            </button>

            {isExpanded && (
                <>
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
                </>
            )}
        </div>
    );
} 