import { Input } from '../components/Input'
import { Button } from '../components/Button'

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
        <div className="border p-4 rounded-lg space-y-4">
            <div className="flex items-center space-x-2">
                <Input
                    placeholder="Option text"
                    {...register(`questions.${questionIndex}.options.${optionIndex}.text`)}
                />
                <Button
                    type="button"
                    onClick={removeOption}
                    className="bg-red-500"
                >
                    Remove Option
                </Button>
            </div>

            <div className="pl-4 space-y-2">
                {items.map((_: string, itemIndex: number) => (
                    <div key={itemIndex} className="flex items-center space-x-2">
                        <Input
                            placeholder="Item"
                            {...register(`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}`)}
                        />
                        <Button
                            type="button"
                            onClick={() => {
                                const newItems = items.filter((_: string, i: number) => i !== itemIndex);
                                setValue(`questions.${questionIndex}.options.${optionIndex}.items`, newItems);
                            }}
                            className="bg-red-500"
                        >
                            Remove Item
                        </Button>
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
                >
                    Add Item
                </Button>
            </div>
        </div>
    );
} 