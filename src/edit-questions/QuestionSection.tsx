import { useFieldArray, Control } from 'react-hook-form'
import { PackingListQuestionSet, newOption } from './types'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
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
        <div className="border p-4 rounded-lg space-y-4">
            <div className="flex items-center space-x-2">
                <Input
                    placeholder="Question text"
                    {...register(`questions.${questionIndex}.text`)}
                />
                <Button
                    type="button"
                    onClick={removeQuestion}
                    className="bg-red-500"
                >
                    Remove Question
                </Button>
            </div>

            <div className="pl-4 space-y-4">
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
                <Button
                    type="button"
                    onClick={() => appendOption(newOption(optionFields.length))}
                >
                    Add Option
                </Button>
            </div>
        </div>
    );
} 