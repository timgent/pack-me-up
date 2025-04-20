import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { CloseButton } from '../components/CloseButton'

interface OptionSectionProps {
    questionIndex: number;
    optionIndex: number;
    register: any;
    watch: any;
    setValue: any;
    removeOption: () => void;
}

export function OptionSection({ questionIndex, optionIndex, register, watch, setValue, removeOption }: OptionSectionProps) {
    const items = watch(`questions.${questionIndex}.options.${optionIndex}.items`) || [];

    return (
        <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-start gap-2 sm:gap-4 mb-4">
                <div className="flex-1">
                    <Input
                        label={`Option ${optionIndex + 1}`}
                        placeholder="Enter option text"
                        {...register(`questions.${questionIndex}.options.${optionIndex}.text`)}
                    />
                </div>
                <CloseButton
                    onClick={removeOption}
                    label={`Remove option ${optionIndex + 1}`}
                    className="mt-6"
                />
            </div>

            <div className="ml-0 sm:ml-4 space-y-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Items:</div>
                {items.map((_: string, itemIndex: number) => (
                    <div key={itemIndex} className="flex items-start gap-2 sm:gap-3">
                        <div className="flex-1">
                            <Input
                                placeholder="Enter item"
                                {...register(`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}`)}
                            />
                        </div>
                        <CloseButton
                            onClick={() => {
                                const newItems = items.filter((_: string, i: number) => i !== itemIndex);
                                setValue(`questions.${questionIndex}.options.${optionIndex}.items`, newItems);
                            }}
                            label={`Remove item ${itemIndex + 1}`}
                        />
                    </div>
                ))}
                <Button
                    type="button"
                    onClick={() => {
                        setValue(
                            `questions.${questionIndex}.options.${optionIndex}.items`,
                            [...items, ""]
                        );
                    }}
                    variant="ghost"
                    className="mt-2"
                >
                    Add Item
                </Button>
            </div>
        </div>
    );
} 