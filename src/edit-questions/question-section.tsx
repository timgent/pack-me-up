import { useFieldArray, Control, UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form'
import { PackingListQuestionSet, Person, newOption } from './types'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'
import { OptionSection } from './option-section'
import { useState, useEffect } from 'react'

interface QuestionSectionProps {
    questionIndex: number;
    control: Control<PackingListQuestionSet>;
    register: UseFormRegister<PackingListQuestionSet>;
    watch: UseFormWatch<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    removeQuestion: () => void;
    people: Person[];
    moveUp?: () => void;
    moveDown?: () => void;
    forceCollapsed?: boolean | null;
}

export function QuestionSection({ questionIndex, control, register, watch, setValue, removeQuestion, people, moveUp, moveDown, forceCollapsed }: QuestionSectionProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    // Sync with forceCollapsed when it changes
    useEffect(() => {
        if (forceCollapsed !== null && forceCollapsed !== undefined) {
            setIsExpanded(!forceCollapsed);
        }
    }, [forceCollapsed]);
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
                        title={isExpanded ? 'Collapse' : 'Expand'}
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
                    <div className="flex flex-col gap-1">
                        <button
                            type="button"
                            onClick={moveUp}
                            disabled={!moveUp}
                            className={`text-gray-400 transition-colors duration-200 ${moveUp ? 'hover:text-gray-600 cursor-pointer' : 'opacity-30 cursor-not-allowed'}`}
                            title="Move up"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={moveDown}
                            disabled={!moveDown}
                            className={`text-gray-400 transition-colors duration-200 ${moveDown ? 'hover:text-gray-600 cursor-pointer' : 'opacity-30 cursor-not-allowed'}`}
                            title="Move down"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
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
                    <>
                        <div className="mb-4 pb-4 border-b border-gray-200">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Question Type
                            </label>
                            <div className="flex gap-4">
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        value="single-choice"
                                        {...register(`questions.${questionIndex}.questionType`)}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-gray-700">Single Choice</span>
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        value="multiple-choice"
                                        {...register(`questions.${questionIndex}.questionType`)}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-gray-700">Multiple Choice</span>
                                </label>
                            </div>
                        </div>
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
                    </>
                )}
            </div>
        </div>
    );
} 