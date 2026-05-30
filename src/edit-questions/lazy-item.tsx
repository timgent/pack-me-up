import { useState } from 'react';
import { useFormContext, Control, UseFormRegister, UseFormSetValue, Controller } from 'react-hook-form';
import { PackingListQuestionSet, Person } from './types';
import { ItemPeopleSection } from './item-people-section';
import { ItemPath } from './item-people-section';
import { ActiveSelect } from '../components/CreatableSelect';
import { CloseButton } from '../components/CloseButton';

interface LazyItemProps {
    control: Control<PackingListQuestionSet>;
    basePath: ItemPath;
    register: UseFormRegister<PackingListQuestionSet>;
    setValue: UseFormSetValue<PackingListQuestionSet>;
    allPeople: Person[];
    allItemNames: string[];
    isHighlighted: boolean;
    onRemove: () => void;
    refCallback: (el: HTMLDivElement | null) => void;
    autoActivate?: boolean;
}

export function LazyItem({ control, basePath, register, setValue, allPeople, allItemNames, isHighlighted, onRemove, refCallback, autoActivate = false }: LazyItemProps) {
    const [isActive, setIsActive] = useState(autoActivate);
    const { getValues } = useFormContext<PackingListQuestionSet>();

    const outerClass = `flex items-start gap-2 sm:gap-3 rounded-md${isHighlighted ? ' ring-2 ring-primary-300' : ''}`;

    if (!isActive) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = (getValues as any)(basePath) ?? { text: '', personSelections: [] };
        const text: string = item.text ?? '';

        return (
            <div className={outerClass}>
                <div className="flex-1" ref={refCallback} onClick={() => setIsActive(true)}>
                    {allPeople.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                            {allPeople.map((person, i) => {
                                const selected: boolean = item.personSelections?.[i]?.selected ?? false;
                                return (
                                    <span key={person.id} className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border-2 select-none ${selected ? 'bg-primary-50 border-primary-400 text-primary-900 shadow-sm' : 'bg-white border-gray-200 text-gray-400'}`}>
                                        <span className="font-medium">{person.name}</span>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    <div className="flex items-center min-h-[42px] border border-gray-200 hover:border-gray-400 rounded px-3 cursor-text">
                        <span className={`flex-1 text-sm ${text ? 'text-gray-700' : 'text-gray-400'}`}>
                            {text || 'Enter item'}
                        </span>
                        {text && (
                            <button
                                type="button"
                                tabIndex={-1}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    (setValue as any)(basePath, { ...item, text: '' });
                                }}
                                className="text-gray-300 hover:text-gray-500 text-lg leading-none ml-1"
                                aria-label="Clear"
                            >
                                ×
                            </button>
                        )}
                        <svg className="w-4 h-4 text-gray-300 ml-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
                <CloseButton onClick={onRemove} label="Remove item" />
            </div>
        );
    }

    return (
        <div className={outerClass}>
            <div className="flex-1" ref={refCallback}>
                <ItemPeopleSection
                    control={control}
                    basePath={basePath}
                    register={register}
                    setValue={setValue}
                    allPeople={allPeople}
                />
                <Controller
                    control={control}
                    name={basePath as any}
                    render={({ field: { value, onChange } }) => (
                        <ActiveSelect
                            value={value?.text ?? ''}
                            onChange={(newText) => onChange({ ...value, text: newText })}
                            options={allItemNames}
                            placeholder="Enter item"
                        />
                    )}
                />
            </div>
            <CloseButton onClick={onRemove} label="Remove item" />
        </div>
    );
}
