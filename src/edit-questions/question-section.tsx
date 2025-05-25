import { useFieldArray, Control } from 'react-hook-form'
import { PackingListQuestionSet, Person, newOption } from './types'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'
import { OptionSection } from './option-section'
import { useState } from 'react'

interface QuestionSectionProps {
    questionIndex: number;
    control: Control<PackingListQuestionSet>;
    register: any;
    watch: any;
    setValue: any;
    removeQuestion: () => void;
    people: Person[];
}

export function QuestionSection({ questionIndex, control, register, watch, setValue, removeQuestion, people }: QuestionSectionProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({
        control,
        name: `questions.${questionIndex}.options` as const
    });

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-4 mb-6">
                    <button
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
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
                            label={`Question ${questionIndex + 1}`}
                            placeholder="Enter your question"
                            {...register(`questions.${questionIndex}.text`)}
                        />
                    </div>
                    <CloseButton
                        onClick={removeQuestion}
                        label={`Remove question ${questionIndex + 1}`}
                        className="mt-6"
                    />
                </div>

                {isExpanded && (
                    <div className="space-y-4">
                        {optionFields.map((option, optionIndex) => (
                            <OptionSection
                                control={control}
                                key={option.id}
                                questionIndex={questionIndex}
                                optionIndex={optionIndex}
                                register={register}
                                watch={watch}
                                setValue={setValue}
                                removeOption={() => removeOption(optionIndex)}
                                people={people}
                            />
                        ))}
                        <div className="mt-4">
                            <Button
                                type="button"
                                onClick={() => appendOption(newOption(optionFields.length))}
                                variant="secondary"
                            >
                                Add Option
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
} 