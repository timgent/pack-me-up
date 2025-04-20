import { useFieldArray, Control } from 'react-hook-form'
import { PackingListQuestionSet, newOption } from './types'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'
import { OptionSection } from './OptionSection'

interface QuestionSectionProps {
    questionIndex: number;
    control: Control<PackingListQuestionSet>;
    register: any;
    watch: any;
    setValue: any;
    removeQuestion: () => void;
}

export function QuestionSection({ questionIndex, control, register, watch, setValue, removeQuestion }: QuestionSectionProps) {
    const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({
        control,
        name: `questions.${questionIndex}.options` as const
    });

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-4 mb-6">
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

                <div className="space-y-4">
                    {optionFields.map((option, optionIndex) => (
                        <OptionSection
                            key={option.id}
                            questionIndex={questionIndex}
                            optionIndex={optionIndex}
                            register={register}
                            watch={watch}
                            setValue={setValue}
                            removeOption={() => removeOption(optionIndex)}
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
            </div>
        </div>
    );
} 